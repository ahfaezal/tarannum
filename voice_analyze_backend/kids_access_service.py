"""Server-authoritative daily unlock decisions for Tarannum Kids."""
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone


KUALA_LUMPUR = timezone(timedelta(hours=8), name="Asia/Kuala_Lumpur")
REQUIRED_PRACTICE_SECONDS = 60 * 60
ACCESS_START = time(6, 0)
ACCESS_END = time(23, 30)


@dataclass(frozen=True)
class KidsAccessWindow:
    local_date: str
    starts_at_local: datetime
    expires_at_local: datetime
    starts_at_utc_naive: datetime
    expires_at_utc_naive: datetime
    is_open: bool


def access_window(now_utc: datetime | None = None) -> KidsAccessWindow:
    now_utc = now_utc or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    local_now = now_utc.astimezone(KUALA_LUMPUR)
    starts = datetime.combine(local_now.date(), ACCESS_START, KUALA_LUMPUR)
    expires = datetime.combine(local_now.date(), ACCESS_END, KUALA_LUMPUR)
    return KidsAccessWindow(
        local_date=local_now.date().isoformat(),
        starts_at_local=starts,
        expires_at_local=expires,
        starts_at_utc_naive=starts.astimezone(timezone.utc).replace(tzinfo=None),
        expires_at_utc_naive=expires.astimezone(timezone.utc).replace(tzinfo=None),
        is_open=starts <= local_now < expires,
    )


def daily_access_response(credited_seconds: float, window: KidsAccessWindow) -> dict:
    credited = max(0, int(credited_seconds))
    granted = window.is_open and credited >= REQUIRED_PRACTICE_SECONDS
    return {
        "localDate": window.local_date,
        "creditedSeconds": credited,
        "requiredSeconds": REQUIRED_PRACTICE_SECONDS,
        "unlockGranted": granted,
        "unlockExpiresAt": window.expires_at_local.isoformat() if granted else None,
    }
