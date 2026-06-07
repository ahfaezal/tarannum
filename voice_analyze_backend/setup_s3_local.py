"""Create or update a local .env file with S3 configuration."""

from getpass import getpass
from pathlib import Path


def setup_s3_local() -> None:
    env_file = Path(__file__).parent / ".env"

    print("S3 Local Setup")
    print("Credentials are stored only in the ignored .env file.")

    access_key = input("AWS access key ID: ").strip()
    secret_key = getpass("AWS secret access key: ").strip()
    bucket = input("S3 bucket name [tarannum-audio-prod]: ").strip()
    region = input("AWS region [ap-southeast-1]: ").strip()

    if not access_key or not secret_key:
        raise SystemExit("AWS access key ID and secret access key are required.")

    config = (
        "\n# S3 Configuration (local development)\n"
        "CLOUD_STORAGE_TYPE=s3\n"
        f"S3_BUCKET_NAME={bucket or 'tarannum-audio-prod'}\n"
        f"AWS_ACCESS_KEY_ID={access_key}\n"
        f"AWS_SECRET_ACCESS_KEY={secret_key}\n"
        f"AWS_REGION={region or 'ap-southeast-1'}\n"
    )

    existing = env_file.read_text(encoding="utf-8") if env_file.exists() else ""
    if "AWS_ACCESS_KEY_ID=" in existing:
        raise SystemExit(
            f"{env_file} already contains AWS configuration. Update it manually."
        )

    env_file.write_text(existing.rstrip() + config, encoding="utf-8")
    print(f"Updated {env_file}")


if __name__ == "__main__":
    setup_s3_local()
