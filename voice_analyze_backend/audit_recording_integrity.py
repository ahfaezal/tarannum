"""Read-only reconciliation for Tarannum recording data in PostgreSQL and S3."""
import argparse
import hashlib
import json
import os

import boto3
from dotenv import load_dotenv

from database import AnalysisResult, SessionLocal, UserSession


def _s3_location(url: str):
    if not url or not url.startswith("s3://"):
        return None, None
    return url[5:].split("/", 1)


def _stream_sha256(body) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: body.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--verify-content", action="store_true")
    args = parser.parse_args()

    load_dotenv(".env")
    load_dotenv(".env.local", override=True)
    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "ap-southeast-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    db = SessionLocal()
    report = {"checked": 0, "complete": 0, "issues": []}
    try:
        sessions = (
            db.query(UserSession)
            .filter(UserSession.data_schema_version.isnot(None))
            .order_by(UserSession.created_at.desc())
            .limit(args.limit)
            .all()
        )
        for session in sessions:
            report["checked"] += 1
            issues = []
            analysis = db.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == session.id
            ).first()
            if not analysis:
                issues.append("missing_analysis")
            for label, url, expected_hash in (
                ("audio", session.cloud_storage_path, session.audio_checksum),
                ("score", session.score_storage_path, session.score_checksum),
            ):
                bucket, key = _s3_location(url)
                if not bucket or not key:
                    issues.append(f"missing_{label}_storage_path")
                    continue
                try:
                    response = s3.get_object(Bucket=bucket, Key=key) if args.verify_content else s3.head_object(Bucket=bucket, Key=key)
                    if label == "audio" and session.file_size is not None and response["ContentLength"] != session.file_size:
                        issues.append("audio_size_mismatch")
                    if args.verify_content and expected_hash and _stream_sha256(response["Body"]) != expected_hash:
                        issues.append(f"{label}_checksum_mismatch")
                except Exception as error:
                    issues.append(f"{label}_s3_error:{type(error).__name__}")
            if session.integrity_status != "complete":
                issues.append(f"status_{session.integrity_status or 'missing'}")
            if issues:
                report["issues"].append({"session_id": str(session.id), "issues": issues})
            else:
                report["complete"] += 1
    finally:
        db.close()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
