import unittest

from security_config import resolve_secret_key


class AuthConfigurationTests(unittest.TestCase):
    def test_api_refuses_to_start_without_secret(self):
        with self.assertRaisesRegex(RuntimeError, "SECRET_KEY must be configured"):
            resolve_secret_key("", "")

    def test_scoring_worker_uses_transient_in_memory_secret(self):
        self.assertGreaterEqual(len(resolve_secret_key("", "scoring-worker")), 32)

    def test_configured_secret_is_preserved(self):
        configured = "a" * 40
        self.assertEqual(resolve_secret_key(configured, "api"), configured)


if __name__ == "__main__":
    unittest.main()
