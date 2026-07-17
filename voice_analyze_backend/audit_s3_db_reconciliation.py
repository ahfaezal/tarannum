"""Read-only reconciliation of Railway recording rows against S3 folders."""
import json
import os
from collections import Counter
from pathlib import PurePosixPath

import boto3
from dotenv import load_dotenv
from sqlalchemy import func

from database import AnalysisResult, SessionLocal, UserSession


def _s3_key(value):
    if not value or not value.startswith("s3://"):
        return None
    parts = value[5:].split("/", 1)
    return parts[1] if len(parts) == 2 else None


def main():
    load_dotenv(".env")
    load_dotenv(".env.local", override=True)
    bucket = os.getenv("S3_BUCKET_NAME", "tarannum-audio-prod")
    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "ap-southeast-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

    db = SessionLocal()
    try:
        sessions = db.query(UserSession).all()
        analysis_session_ids = {
            str(value[0])
            for value in db.query(AnalysisResult.user_session_id).all()
            if value[0]
        }
        session_ids = {str(session.id) for session in sessions}
        db_audio_keys = {
            key for key in (_s3_key(session.cloud_storage_path) for session in sessions) if key
        }
        db_score_keys = {
            key for key in (_s3_key(session.score_storage_path) for session in sessions) if key
        }

        object_keys = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket):
            object_keys.extend(item["Key"] for item in page.get("Contents", []))

        audio_keys = {key for key in object_keys if key.endswith("/audio.wav")}
        score_keys = {key for key in object_keys if key.endswith("/score.json")}
        recording_folders = {
            str(PurePosixPath(key).parent)
            for key in audio_keys | score_keys
        }
        folder_ids = {PurePosixPath(folder).name for folder in recording_folders}

        path_types = Counter(
            "s3" if (session.cloud_storage_path or "").startswith("s3://")
            else "other" if session.cloud_storage_path
            else "missing"
            for session in sessions
        )
        report = {
            "database": {
                "sessions": len(sessions),
                "analysis_results": db.query(func.count(AnalysisResult.id)).scalar(),
                "sessions_with_analysis": len(session_ids & analysis_session_ids),
                "sessions_without_analysis": len(session_ids - analysis_session_ids),
                "standard_schema_sessions": sum(bool(s.data_schema_version) for s in sessions),
                "legacy_sessions": sum(not bool(s.data_schema_version) for s in sessions),
                "audio_path_types": dict(path_types),
                "s3_audio_paths": len(db_audio_keys),
                "s3_score_paths": len(db_score_keys),
            },
            "s3": {
                "objects": len(object_keys),
                "recording_folders": len(recording_folders),
                "audio_files": len(audio_keys),
                "score_files": len(score_keys),
                "complete_pairs": len(audio_keys & {f"{PurePosixPath(k).parent}/audio.wav" for k in score_keys}),
            },
            "matches": {
                "folder_id_matches_session_id": len(folder_ids & session_ids),
                "db_audio_key_matches": len(db_audio_keys & audio_keys),
                "db_score_key_matches": len(db_score_keys & score_keys),
                "s3_folder_ids_not_in_current_database": len(folder_ids - session_ids),
                "database_session_ids_without_s3_folder_id": len(session_ids - folder_ids),
            },
        }
        print(json.dumps(report, indent=2, sort_keys=True))
    finally:
        db.close()


if __name__ == "__main__":
    main()
