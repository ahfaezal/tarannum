import os


def _enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_production_environment() -> bool:
    environment = os.getenv("ENVIRONMENT", "").strip().lower()
    railway_environment = os.getenv("RAILWAY_ENVIRONMENT_NAME", "").strip().lower()
    return environment == "production" or railway_environment == "production"


def is_iqra_enabled() -> bool:
    if not _enabled(os.getenv("IQRA_ENABLED", "false")):
        return False
    if _is_production_environment():
        return _enabled(os.getenv("IQRA_PRODUCTION_APPROVED", "false"))
    return True


def is_azure_speech_configured() -> bool:
    return bool(
        os.getenv("AZURE_SPEECH_KEY", "").strip()
        and os.getenv("AZURE_SPEECH_REGION", "").strip()
    )


def is_fastconformer_shadow_enabled() -> bool:
    """Enable the optional IQRA 6 comparison engine only when fully configured."""
    return bool(
        _enabled(os.getenv("IQRA_FASTCONFORMER_ENABLED", "false"))
        and os.getenv("IQRA_FASTCONFORMER_ENDPOINT", "").strip()
    )
