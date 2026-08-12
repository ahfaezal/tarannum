"""Production error and performance telemetry configured entirely by environment."""
import logging
import os

logger = logging.getLogger(__name__)
_initialized = False


def initialize_observability(service_name: str) -> bool:
    """Enable Sentry when SENTRY_DSN is present; remain a no-op otherwise."""
    global _initialized
    if _initialized:
        return True

    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        logger.info("Sentry disabled: SENTRY_DSN is not configured")
        return False

    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("ENVIRONMENT", "development"),
            release=os.getenv("RENDER_GIT_COMMIT") or os.getenv("RAILWAY_GIT_COMMIT_SHA"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.10")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,
            server_name=service_name,
        )
        sentry_sdk.set_tag("tarannum.service", service_name)
        _initialized = True
        logger.info("Sentry enabled for service=%s", service_name)
        return True
    except Exception:
        logger.exception("Sentry initialization failed; service will continue without telemetry")
        return False
