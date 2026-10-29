import ast
import unittest
from pathlib import Path


BACKEND = Path(__file__).parent


class ScoringJobResilienceTests(unittest.TestCase):
    def source(self, filename: str) -> str:
        return (BACKEND / filename).read_text(encoding="utf-8")

    def function_source(self, filename: str, name: str) -> str:
        source = self.source(filename)
        tree = ast.parse(source)
        function = next(
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
        )
        return ast.get_source_segment(source, function) or ""

    def test_retry_checks_real_staging_object(self):
        retry_source = self.function_source("main.py", "retry_scoring_job")
        self.assertIn("cloud_storage.file_exists(job.staging_path)", retry_source)
        self.assertIn('job.stage = "recording_missing"', retry_source)

    def test_admin_operations_expose_retryability_reason(self):
        operations_source = self.function_source("main.py", "get_scoring_operations")
        self.assertIn('"retryable"', operations_source)
        self.assertIn('"action_reason"', operations_source)

    def test_watchdog_runs_recovery_periodically(self):
        watchdog_source = self.function_source("main.py", "scoring_recovery_watchdog")
        self.assertIn("recover_stale_queued_scoring_jobs", watchdog_source)
        self.assertIn("SCORING_WATCHDOG_INTERVAL_SECONDS", watchdog_source)

    def test_failed_worker_keeps_staging_for_retry(self):
        queue_source = self.source("task_queue.py")
        self.assertIn('current_job.status == "completed"', queue_source)
        self.assertNotIn("if terminal and staged_path and cloud_storage is not None:\n                cloud_storage.delete_file", queue_source)

    def test_temp_path_fallback_cannot_abort_score_persistence(self):
        persistence_source = self.function_source("db_session_service.py", "create_user_session")
        self.assertIn("except ValueError", persistence_source)
        self.assertIn("local_file_path = None", persistence_source)


if __name__ == "__main__":
    unittest.main()
