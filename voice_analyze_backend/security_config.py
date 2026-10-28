"""Security-sensitive environment configuration without application imports."""
import secrets


def resolve_secret_key(configured_value: str, service_role: str) -> str:
    value = (configured_value or "").strip()
    if len(value) >= 32:
        return value
    if (service_role or "").strip().lower() == "scoring-worker":
        return secrets.token_urlsafe(48)
    raise RuntimeError("SECRET_KEY must be configured with at least 32 characters")
