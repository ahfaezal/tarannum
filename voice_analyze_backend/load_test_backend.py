"""Non-destructive concurrency test for Tarannum read-only backend endpoints."""
import argparse
import collections
import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request


def request_once(url: str, timeout: float):
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            response.read()
            return {
                "ok": 200 <= response.status < 400,
                "status": response.status,
                "elapsed_ms": (time.perf_counter() - started) * 1000,
                "server_ms": response.headers.get("X-Response-Time-Ms"),
            }
    except urllib.error.HTTPError as error:
        error.read()
        return {"ok": False, "status": error.code, "elapsed_ms": (time.perf_counter() - started) * 1000}
    except Exception as error:
        return {"ok": False, "error": type(error).__name__, "elapsed_ms": (time.perf_counter() - started) * 1000}


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]


def run_batch(base_url: str, path: str, concurrency: int, timeout: float):
    url = base_url.rstrip("/") + path
    batch_started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        rows = list(executor.map(lambda _: request_once(url, timeout), range(concurrency)))
    elapsed = [row["elapsed_ms"] for row in rows]
    outcomes = collections.Counter(
        str(row.get("status", row.get("error", "unknown"))) for row in rows
    )
    return {
        "path": path,
        "concurrency": concurrency,
        "success": sum(row["ok"] for row in rows),
        "failed": sum(not row["ok"] for row in rows),
        "median_ms": round(statistics.median(elapsed), 1),
        "p95_ms": round(percentile(elapsed, 0.95), 1),
        "max_ms": round(max(elapsed), 1),
        "batch_ms": round((time.perf_counter() - batch_started) * 1000, 1),
        "outcomes": dict(sorted(outcomes.items())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--levels", default="1,5,10,20")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    levels = [int(value) for value in args.levels.split(",") if value.strip()]
    paths = ["/health", "/api/references", "/api/platform/content/available"]
    report = [run_batch(args.base_url, path, level, args.timeout) for path in paths for level in levels]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
