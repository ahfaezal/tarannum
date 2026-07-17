"""
Rate limiting middleware for Milestone 4.
Prevents abuse and ensures fair resource usage.
"""
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
from collections import defaultdict
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware.
    
    Tracks requests per IP address and enforces limits.
    """
    
    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
        burst_limit: int = 10,
        safe_read_requests_per_minute: int = 1200,
        safe_read_requests_per_hour: int = 20000,
        safe_read_burst_limit: int = 300,
        exclude_localhost: bool = True
    ):
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
    
    def _cleanup_old_requests(self):
        """Clean up old request records periodically."""
        current_time = time.time()
        if current_time - self.last_cleanup < 60:  # Cleanup every minute
            return
        
        # Clean up minute-based tracking
        cutoff_minute = current_time - 60
        for ip in list(self.requests_minute.keys()):
            self.requests_minute[ip] = [
                req_time for req_time in self.requests_minute[ip]
                if req_time > cutoff_minute
            ]
            if not self.requests_minute[ip]:
                del self.requests_minute[ip]
        
        # Clean up hour-based tracking
        cutoff_hour = current_time - 3600
        for ip in list(self.requests_hour.keys()):
            self.requests_hour[ip] = [
                req_time for req_time in self.requests_hour[ip]
                if req_time > cutoff_hour
            ]
            if not self.requests_hour[ip]:
                del self.requests_hour[ip]
        
        self.last_cleanup = current_time
    
    def _check_rate_limit(
        self,
        client_key: str,
        requests_per_minute: int = None,
        requests_per_hour: int = None,
        burst_limit: int = None,
    ) -> Tuple[bool, str]:
        """
        Check if request exceeds rate limits.
        
        Returns:
            (allowed, message) tuple
        """
        current_time = time.time()
        minute_limit = requests_per_minute or self.requests_per_minute
        hour_limit = requests_per_hour or self.requests_per_hour
        active_burst_limit = burst_limit or self.burst_limit
        
        # Cleanup old records
        self._cleanup_old_requests()
        
        # Check burst limit (requests in last 10 seconds)
        recent_requests = [
            req_time for req_time in self.requests_minute[client_key]
            if current_time - req_time < 10
        ]
        if len(recent_requests) >= active_burst_limit:
            return False, f"Burst limit exceeded: {active_burst_limit} requests per 10 seconds"
        
        # Check per-minute limit
        minute_requests = [
            req_time for req_time in self.requests_minute[client_key]
            if current_time - req_time < 60
        ]
        if len(minute_requests) >= minute_limit:
            return False, f"Rate limit exceeded: {minute_limit} requests per minute"
        
        # Check per-hour limit
        hour_requests = [
            req_time for req_time in self.requests_hour[client_key]
            if current_time - req_time < 3600
        ]
        if len(hour_requests) >= hour_limit:
            return False, f"Rate limit exceeded: {hour_limit} requests per hour"
        
        # Record request
        self.requests_minute[client_key].append(current_time)
        self.requests_hour[client_key].append(current_time)
        
        return True, "OK"
    
    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        # Skip rate limiting for health checks, static files, and OPTIONS requests
        skip_paths = [
            "/health", 
            "/api/health", 
            "/favicon.ico",
            "/docs",
            "/openapi.json",
            "/redoc"
        ]
        
        # Skip rate limiting for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            response = await call_next(request)
            return response
            
        # Skip rate limiting for specific paths
        if any(request.url.path.startswith(path) for path in skip_paths):
            response = await call_next(request)
            return response
        
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        
        # Skip rate limiting for localhost in development
        if self.exclude_localhost and client_ip in ["127.0.0.1", "localhost", "::1"]:
            response = await call_next(request)
            return response
        
        # Check for forwarded IP (behind proxy)
        if "x-forwarded-for" in request.headers:
            client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        
        safe_read_prefixes = (
            "/api/references",
            "/api/platform/content/available",
        )
        is_safe_read = request.method in ("GET", "HEAD") and request.url.path.startswith(safe_read_prefixes)
        client_key = f"safe-read:{client_ip}" if is_safe_read else client_ip
        minute_limit = self.safe_read_requests_per_minute if is_safe_read else self.requests_per_minute
        hour_limit = self.safe_read_requests_per_hour if is_safe_read else self.requests_per_hour
        active_burst_limit = self.safe_read_burst_limit if is_safe_read else self.burst_limit

        # Keep classroom-safe reads separate from sensitive authentication and write traffic.
        allowed, message = self._check_rate_limit(
            client_key,
            requests_per_minute=minute_limit,
            requests_per_hour=hour_limit,
            burst_limit=active_burst_limit,
        )
        
        if not allowed:
            logger.warning(f"Rate limit exceeded for {client_ip}: {message}")
            return Response(
                content=f'{{"detail": "{message}"}}',
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                media_type="application/json",
                headers={
                    "Retry-After": "60",
                    "X-RateLimit-Limit": str(minute_limit),
                    "X-RateLimit-Remaining": "0"
                }
            )
        
        response = await call_next(request)
        
        # Add rate limit headers
        current_time = time.time()
        minute_requests = [
            req_time for req_time in self.requests_minute[client_key]
            if current_time - req_time < 60
        ]
        remaining = max(0, minute_limit - len(minute_requests))
        
        response.headers["X-RateLimit-Limit"] = str(minute_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(current_time) + 60)
        
        return response
