"""Replica-safe rate limiting for authenticated classroom traffic."""
import hashlib
import logging
import os
import time
from collections import defaultdict
from typing import Dict, List, Tuple

from fastapi import Request, status
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from runtime_metrics import observe_rate_limit

logger = logging.getLogger(__name__)

_RATE_LIMIT_SCRIPT = """
local burst = redis.call('INCR', KEYS[1])
if burst == 1 then redis.call('EXPIRE', KEYS[1], 11) end
local minute = redis.call('INCR', KEYS[2])
if minute == 1 then redis.call('EXPIRE', KEYS[2], 61) end
local hour = redis.call('INCR', KEYS[3])
if hour == 1 then redis.call('EXPIRE', KEYS[3], 3601) end
return {burst, minute, hour}
"""


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Limit requests by authenticated user across all backend replicas."""

    def __init__(self, app, requests_per_minute: int = 60,
                 requests_per_hour: int = 1000, burst_limit: int = 10,
                 safe_read_requests_per_minute: int = 1200,
                 safe_read_requests_per_hour: int = 20000,
                 safe_read_burst_limit: int = 300,
                 exclude_localhost: bool = True):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_limit = burst_limit
        self.safe_read_requests_per_minute = safe_read_requests_per_minute
        self.safe_read_requests_per_hour = safe_read_requests_per_hour
        self.safe_read_burst_limit = safe_read_burst_limit
        self.exclude_localhost = exclude_localhost
        self.requests_minute: Dict[str, List[float]] = defaultdict(list)
        self.requests_hour: Dict[str, List[float]] = defaultdict(list)
        self.last_cleanup = time.time()
        self._redis = None
        self._redis_warning_at = 0.0
        redis_url = os.getenv("REDIS_URL", "").strip()
        if redis_url:
            try:
                from redis.asyncio import from_url
                self._redis = from_url(redis_url, encoding="utf-8", decode_responses=True)
            except Exception:
                logger.exception("Redis rate limiter initialization failed; using local fallback")

    @staticmethod
    def _token_subject(request: Request) -> str | None:
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            return None
        token = authorization.split(" ", 1)[1].strip()
        secret = os.getenv("SECRET_KEY", "").strip()
        if not token or len(secret) < 32:
            return None
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            subject = payload.get("sub")
            return str(subject) if subject else None
        except JWTError:
            return None

    def _identity(self, request: Request, client_ip: str) -> str:
        subject = self._token_subject(request)
        raw = f"user:{subject}" if subject else f"ip:{client_ip}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def _cleanup_old_requests(self) -> None:
        current_time = time.time()
        if current_time - self.last_cleanup < 60:
            return
        for store, window in ((self.requests_minute, 60), (self.requests_hour, 3600)):
            cutoff = current_time - window
            for key in list(store):
                store[key] = [recorded for recorded in store[key] if recorded > cutoff]
                if not store[key]:
                    del store[key]
        self.last_cleanup = current_time

    def _check_local(self, key: str, minute_limit: int, hour_limit: int,
                     burst_limit: int) -> Tuple[bool, int]:
        now = time.time()
        self._cleanup_old_requests()
        if len([value for value in self.requests_minute[key] if now - value < 10]) >= burst_limit:
            return False, 10
        if len([value for value in self.requests_minute[key] if now - value < 60]) >= minute_limit:
            return False, 60
        if len([value for value in self.requests_hour[key] if now - value < 3600]) >= hour_limit:
            return False, 3600
        self.requests_minute[key].append(now)
        self.requests_hour[key].append(now)
        return True, 0

    async def _check(self, key: str, minute_limit: int, hour_limit: int,
                     burst_limit: int) -> Tuple[bool, int, int]:
        if self._redis is not None:
            now = int(time.time())
            prefix = f"tarannum:rate:{key}"
            keys = [f"{prefix}:b:{now // 10}", f"{prefix}:m:{now // 60}", f"{prefix}:h:{now // 3600}"]
            try:
                burst, minute, hour = await self._redis.eval(_RATE_LIMIT_SCRIPT, 3, *keys)
                if int(burst) > burst_limit:
                    return False, 10, 0
                if int(minute) > minute_limit:
                    return False, 60, 0
                if int(hour) > hour_limit:
                    return False, 3600, 0
                return True, 0, max(0, minute_limit - int(minute))
            except Exception as exc:
                now_value = time.time()
                if now_value - self._redis_warning_at > 60:
                    logger.warning("Redis rate limiter unavailable; using local fallback: %s", exc)
                    self._redis_warning_at = now_value
        allowed, retry_after = self._check_local(key, minute_limit, hour_limit, burst_limit)
        return allowed, retry_after, max(0, minute_limit - len(self.requests_minute[key]))

    async def dispatch(self, request: Request, call_next):
        skip_paths = ("/health", "/api/health", "/score", "/favicon.ico", "/docs", "/openapi.json", "/redoc")
        if request.method == "OPTIONS" or any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)
        client_ip = request.client.host if request.client else "unknown"
        if "x-forwarded-for" in request.headers:
            client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        if self.exclude_localhost and client_ip in {"127.0.0.1", "localhost", "::1"}:
            return await call_next(request)

        safe_prefixes = ("/api/references", "/api/platform/content/available", "/api/scoring/capacity",
                         "/api/scoring/jobs/", "/api/recording-sessions/")
        safe_read = request.method in {"GET", "HEAD"} and request.url.path.startswith(safe_prefixes)
        category = "safe-read" if safe_read else "standard"
        key = f"{category}:{self._identity(request, client_ip)}"
        minute_limit = self.safe_read_requests_per_minute if safe_read else self.requests_per_minute
        hour_limit = self.safe_read_requests_per_hour if safe_read else self.requests_per_hour
        burst_limit = self.safe_read_burst_limit if safe_read else self.burst_limit
        allowed, retry_after, remaining = await self._check(key, minute_limit, hour_limit, burst_limit)
        if not allowed:
            observe_rate_limit()
            logger.warning("Rate limit exceeded category=%s identity=%s retry_after=%s", category, key[-8:], retry_after)
            return Response(content='{"detail":"Too many requests. Please retry shortly."}',
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, media_type="application/json",
                headers={"Retry-After": str(retry_after), "X-RateLimit-Limit": str(minute_limit),
                         "X-RateLimit-Remaining": "0"})
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(minute_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)
        return response
