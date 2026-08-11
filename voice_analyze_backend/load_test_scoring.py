"""Controlled end-to-end classroom load test for asynchronous scoring.

This script is intentionally staging-only. It submits one R1 for every
simulated participant, waits for all baselines to finish, then optionally runs
repeated R2 rounds using the same assessment sessions.

Authentication is read from TARANNUM_LOAD_TEST_TOKEN so credentials do not
appear in the command line or source tree.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import mimetypes
import os
import statistics
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 2)


def multipart_body(fields: dict[str, str], audio: bytes, filename: str) -> tuple[bytes, str]:
    boundary = f"----tarannum-load-test-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(),
            b"\r\n",
        ])
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="user_audio"; filename="{filename}"\r\n'.encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        audio,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def json_request(
    url: str,
    token: str,
    *,
    data: bytes | None = None,
    content_type: str | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} from {url}: {detail[:500]}") from error


def submit_job(
    base_url: str,
    token: str,
    reference_id: str,
    participant: int,
    client_session_id: str,
    mode: str,
    attempt: int,
    audio: bytes,
    audio_suffix: str,
    timeout: float,
) -> dict[str, Any]:
    filename = f"LOAD_TEST_P{participant:03d}_{mode}_A{attempt}{audio_suffix}"
    body, content_type = multipart_body(
        {
            "reference_id": reference_id,
            "client_session_id": client_session_id,
            "recording_mode": mode,
            "scoring_version": "V2.3",
            "recording_attempt": str(attempt),
        },
        audio,
        filename,
    )
    started = time.perf_counter()
    result = json_request(
        f"{base_url}/api/scoring/jobs",
        token,
        data=body,
        content_type=content_type,
        timeout=timeout,
    )
    return {
        "participant": participant,
        "client_session_id": client_session_id,
        "mode": mode,
        "attempt": attempt,
        "job_id": result["job_id"],
        "ack_seconds": round(time.perf_counter() - started, 3),
        "deduplicated": bool(result.get("deduplicated")),
    }


def wait_for_jobs(
    base_url: str,
    token: str,
    jobs: list[dict[str, Any]],
    poll_seconds: float,
    maximum_wait_seconds: float,
) -> list[dict[str, Any]]:
    pending = {
        job["job_id"]: job
        for job in jobs
        if job.get("status") != "submission_failed" and job.get("job_id")
    }
    deadline = time.monotonic() + maximum_wait_seconds
    while pending and time.monotonic() < deadline:
        for job_id, row in list(pending.items()):
            status = json_request(f"{base_url}/api/scoring/jobs/{job_id}", token, timeout=30)
            row["status"] = status.get("status")
            row["stage"] = status.get("stage")
            row["queue_position"] = status.get("queue_position")
            if status.get("status") in {"completed", "failed"}:
                queued_at = status.get("queued_at")
                started_at = status.get("started_at")
                completed_at = status.get("completed_at")
                row["queue_seconds"] = (
                    (datetime.fromisoformat(started_at) - datetime.fromisoformat(queued_at)).total_seconds()
                    if queued_at and started_at
                    else None
                )
                row["processing_seconds"] = (
                    (datetime.fromisoformat(completed_at) - datetime.fromisoformat(started_at)).total_seconds()
                    if started_at and completed_at
                    else None
                )
                row["error"] = status.get("error")
                pending.pop(job_id)
        if pending:
            time.sleep(poll_seconds)
    for row in pending.values():
        row["status"] = "load_test_timeout"
        row["error"] = f"No terminal status after {maximum_wait_seconds:.0f} seconds"
    return jobs


def summarize(label: str, rows: list[dict[str, Any]], wall_seconds: float) -> dict[str, Any]:
    queue = [float(row["queue_seconds"]) for row in rows if row.get("queue_seconds") is not None]
    processing = [float(row["processing_seconds"]) for row in rows if row.get("processing_seconds") is not None]
    acknowledgements = [float(row["ack_seconds"]) for row in rows]
    statuses: dict[str, int] = {}
    for row in rows:
        status = str(row.get("status", "unknown"))
        statuses[status] = statuses.get(status, 0) + 1
    return {
        "phase": label,
        "jobs": len(rows),
        "statuses": statuses,
        "wall_seconds": round(wall_seconds, 2),
        "upload_ack_median_seconds": round(statistics.median(acknowledgements), 2),
        "upload_ack_p95_seconds": percentile(acknowledgements, 0.95),
        "queue_p95_seconds": percentile(queue, 0.95),
        "processing_p95_seconds": percentile(processing, 0.95),
        "errors": [
            {"job_id": row.get("job_id"), "participant": row["participant"], "error": row.get("error")}
            for row in rows
            if row.get("status") != "completed"
        ],
    }


def run_phase(
    label: str,
    mode: str,
    attempt: int,
    args: argparse.Namespace,
    token: str,
    sessions: list[str],
    audio: bytes,
    audio_suffix: str,
) -> dict[str, Any]:
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.submit_concurrency) as executor:
        futures = {
            executor.submit(
                submit_job,
                args.base_url,
                token,
                args.reference_id,
                index + 1,
                session_id,
                mode,
                attempt,
                audio,
                audio_suffix,
                args.request_timeout,
            ): index + 1
            for index, session_id in enumerate(sessions)
        }
        jobs = []
        for future in concurrent.futures.as_completed(futures):
            participant = futures[future]
            try:
                jobs.append(future.result())
            except Exception as error:
                jobs.append({
                    "participant": participant,
                    "mode": mode,
                    "attempt": attempt,
                    "status": "submission_failed",
                    "ack_seconds": 0.0,
                    "error": str(error),
                })
    wait_for_jobs(
        args.base_url,
        token,
        jobs,
        args.poll_seconds,
        args.maximum_wait_minutes * 60,
    )
    return summarize(label, jobs, time.perf_counter() - started)


def main() -> None:
    parser = argparse.ArgumentParser(description="Staging-only Tarannum scoring load test")
    parser.add_argument("--base-url", required=True, help="Staging API URL; production URLs are rejected")
    parser.add_argument("--reference-id", required=True)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--participants", type=int, default=40)
    parser.add_argument("--r2-rounds", type=int, default=1)
    parser.add_argument("--submit-concurrency", type=int, default=10)
    parser.add_argument("--poll-seconds", type=float, default=4.0)
    parser.add_argument("--request-timeout", type=float, default=180.0)
    parser.add_argument("--maximum-wait-minutes", type=float, default=45.0)
    parser.add_argument("--allow-production", action="store_true", help="Explicit safety override")
    args = parser.parse_args()

    if not args.allow_production and "staging" not in args.base_url.lower():
        raise SystemExit("Refusing to run: --base-url must contain 'staging'")
    if args.participants < 1 or args.participants > 200:
        raise SystemExit("--participants must be between 1 and 200")
    if args.r2_rounds < 0 or args.r2_rounds > 20:
        raise SystemExit("--r2-rounds must be between 0 and 20")
    if not args.audio.is_file():
        raise SystemExit(f"Audio file not found: {args.audio}")

    token = os.getenv("TARANNUM_LOAD_TEST_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set TARANNUM_LOAD_TEST_TOKEN in the process environment")

    args.base_url = args.base_url.rstrip("/")
    audio = args.audio.read_bytes()
    audio_suffix = args.audio.suffix.lower() or ".bin"
    sessions = [str(uuid.uuid4()) for _ in range(args.participants)]
    report = {
        "target": args.base_url,
        "participants": args.participants,
        "audio_bytes": len(audio),
        "started_at_epoch": time.time(),
        "phases": [],
    }
    report["phases"].append(run_phase("R1", "R1", 1, args, token, sessions, audio, audio_suffix))
    if report["phases"][-1]["statuses"].get("completed") != args.participants:
        report["aborted"] = "R1 did not complete for every simulated participant"
        print(json.dumps(report, indent=2))
        raise SystemExit(2)

    for round_number in range(1, args.r2_rounds + 1):
        report["phases"].append(
            run_phase(
                f"R2 attempt {round_number}",
                "R2",
                round_number,
                args,
                token,
                sessions,
                audio,
                audio_suffix,
            )
        )
    report["completed_at_epoch"] = time.time()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
