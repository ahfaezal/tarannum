import os
import unittest
from unittest.mock import patch

from jose import jwt
from starlette.requests import Request

from rate_limiting import RateLimitMiddleware


class RateLimitingTests(unittest.TestCase):
    secret = "test-secret-key-longer-than-thirty-two-characters"

    def middleware(self):
        return RateLimitMiddleware(lambda scope, receive, send: None, exclude_localhost=False)

    def request(self, subject):
        token = jwt.encode({"sub": subject}, self.secret, algorithm="HS256")
        return Request({"type": "http", "method": "GET", "path": "/api/example",
                        "headers": [(b"authorization", f"Bearer {token}".encode())],
                        "client": ("10.0.0.5", 1234), "scheme": "https",
                        "server": ("test", 443), "query_string": b""})

    def test_authenticated_users_have_separate_keys_on_shared_wifi(self):
        middleware = self.middleware()
        with patch.dict(os.environ, {"SECRET_KEY": self.secret}):
            first = middleware._identity(self.request("student-a"), "10.0.0.5")
            second = middleware._identity(self.request("student-b"), "10.0.0.5")
        self.assertNotEqual(first, second)

    def test_local_fallback_enforces_burst_limit(self):
        middleware = self.middleware()
        self.assertTrue(middleware._check_local("student", 100, 1000, 1)[0])
        allowed, retry_after = middleware._check_local("student", 100, 1000, 1)
        self.assertFalse(allowed)
        self.assertEqual(retry_after, 10)


if __name__ == "__main__":
    unittest.main()
