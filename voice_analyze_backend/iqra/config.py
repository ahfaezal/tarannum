import os


def _enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_iqra_enabled() -> bool:
    return _enabled(os.getenv("IQRA_ENABLED", "false"))


def is_azure_speech_configured() -> bool:
    return bool(
        os.getenv("AZURE_SPEECH_KEY", "").strip()
        and os.getenv("AZURE_SPEECH_REGION", "").strip()
    )
