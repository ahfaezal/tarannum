from pathlib import Path
import unittest


BACKEND_DIR = Path(__file__).resolve().parent


class MigrationConfigurationTests(unittest.TestCase):
    def test_baseline_revision_and_runner_are_pinned_together(self):
        runner = (BACKEND_DIR / "migration_runner.py").read_text(encoding="utf-8")
        baseline = (
            BACKEND_DIR
            / "alembic"
            / "versions"
            / "20261028_0001_legacy_schema_baseline.py"
        ).read_text(encoding="utf-8")
        self.assertIn('BASELINE_REVISION = "20261028_0001"', runner)
        self.assertIn('revision: str = "20261028_0001"', baseline)

    def test_runner_serialises_predeploy_migrations(self):
        runner = (BACKEND_DIR / "migration_runner.py").read_text(encoding="utf-8")
        self.assertIn("pg_advisory_lock", runner)
        self.assertIn("pg_advisory_unlock", runner)
        self.assertIn('command.upgrade(config, "head")', runner)

    def test_railway_runs_migrations_before_start(self):
        railway = (BACKEND_DIR / "railway.toml").read_text(encoding="utf-8")
        self.assertIn('preDeployCommand = ["python migration_runner.py"]', railway)
        self.assertIn('cmd = "python migration_runner.py && python main.py"', railway)

    def test_qr_schema_repair_is_idempotent(self):
        repair = (
            BACKEND_DIR
            / "alembic"
            / "versions"
            / "20261028_0003_repair_course_qr_schema.py"
        ).read_text(encoding="utf-8")
        self.assertIn("ADD COLUMN IF NOT EXISTS join_code", repair)
        self.assertIn('"enrollment_source VARCHAR NOT NULL DEFAULT', repair)
        self.assertIn("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_join_code", repair)

    def test_health_exposes_non_secret_deployment_revision(self):
        main_source = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        self.assertIn('"deployment_revision"', main_source)
        self.assertIn('os.getenv("RAILWAY_GIT_COMMIT_SHA")', main_source)


if __name__ == "__main__":
    unittest.main()
