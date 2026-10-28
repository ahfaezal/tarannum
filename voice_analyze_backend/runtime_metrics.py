"""Small, process-local operational metrics used by the admin health view.

Railway aggregates application logs across replicas. These counters complement
those logs with a quick snapshot of the replica serving the admin request.
"""
from collections import Counter, deque
from threading import Lock
from time import time

_lock = Lock()
_latencies = deque(maxlen=2000)
_status_counts = Counter()
_rate_limited = 0


def observe_request(duration_ms: float, status_code: int) -> None:
    with _lock:
        _latencies.append((time(), float(duration_ms)))
        _status_counts[str(status_code)] += 1


def observe_rate_limit() -> None:
    global _rate_limited
    with _lock:
        _rate_limited += 1


def snapshot(window_seconds: int = 900) -> dict:
    cutoff = time() - window_seconds
    with _lock:
        values = sorted(duration for recorded_at, duration in _latencies if recorded_at >= cutoff)
        statuses = dict(_status_counts)
        limited = _rate_limited
    if values:
        index = min(len(values) - 1, max(0, int(round(0.95 * len(values) + 0.5)) - 1))
        p95 = round(values[index], 1)
    else:
        p95 = 0.0
    return {
        "window_seconds": window_seconds,
        "sample_count": len(values),
        "response_time_p95_ms": p95,
        "http_status_counts_since_start": statuses,
        "http_429_since_start": limited,
        "scope": "current_replica",
    }
