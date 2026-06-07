"""Verify that the required S3 environment variables are configured."""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


REQUIRED_VARIABLES = (
    "CLOUD_STORAGE_TYPE",
    "S3_BUCKET_NAME",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
)


def masked(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def check_s3_config() -> None:
    env_path = Path(__file__).parent / ".env"
    if load_dotenv and env_path.exists():
        load_dotenv(env_path)

    missing = []
    for name in REQUIRED_VARIABLES:
        value = os.getenv(name, "").strip()
        if not value:
            missing.append(name)
            print(f"FAIL: {name} is not set")
        elif name in {"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"}:
            print(f"OK: {name} = {masked(value)}")
        else:
            print(f"OK: {name} = {value}")

    if missing:
        raise SystemExit(
            "S3 configuration is incomplete. Missing: " + ", ".join(missing)
        )

    if os.environ["CLOUD_STORAGE_TYPE"].lower() != "s3":
        raise SystemExit("CLOUD_STORAGE_TYPE must be set to 's3'.")

    print("S3 environment variables are configured.")


if __name__ == "__main__":
    check_s3_config()
