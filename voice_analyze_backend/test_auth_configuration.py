import unittest
from pathlib import Path

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

    def test_worker_marks_role_before_lazy_main_import(self):
        source = (Path(__file__).parent / "task_queue.py").read_text(encoding="utf-8")
        marker = 'os.environ["SERVICE_ROLE"] = "scoring-worker"'
        lazy_import = "from main import score_performance"
        self.assertIn(marker, source)
        self.assertLess(source.index(marker), source.index(lazy_import))


if __name__ == "__main__":
    unittest.main()
