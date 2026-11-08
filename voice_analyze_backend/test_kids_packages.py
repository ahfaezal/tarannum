import os
import unittest
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-kids-packages.db")

from fastapi import HTTPException

from kids_package_endpoints import (
    PackageUnitInput,
    _default_completion_rules,
    _require_draft,
    _validate_transition_conditions,
    _validate_package_values,
    _validate_source_metadata,
)
from seed_kids_staging_package import _require_staging
from kids_assignment_endpoints import _validate_assignment_target
from kids_learning_endpoints import _evaluate_completion_rows
from kids_agent_service import evaluate_agent_policy


def unit(**overrides):
    values = {
        "unit_key": "ayat-1",
        "sequence": 1,
        "title": "Ayat 1",
        "activity_type": "iqra_reading",
        "required": True,
    }
    values.update(overrides)
    return PackageUnitInput(**values)


class KidsPackageValidationTests(unittest.TestCase):
    def test_valid_page_package_configuration(self):
        _validate_package_values(
            "page",
            ["azure_speech"],
            ["advance", "remedial"],
            [unit()],
        )
        _validate_source_metadata("page", {"book_title": "IQRA 3", "page_number": 4})

    def test_page_requires_book_and_positive_page_number(self):
        for metadata in ({}, {"book_title": "IQRA 3"}, {"book_title": "IQRA 3", "page_number": 0}):
            with self.assertRaises(HTTPException):
                _validate_source_metadata("page", metadata)

    def test_surah_requires_name(self):
        with self.assertRaises(HTTPException):
            _validate_source_metadata("surah", {})
        _validate_source_metadata("surah", {"surah_name": "Al-Fatihah", "surah_number": 1})

    def test_unknown_engine_action_and_activity_are_rejected(self):
        cases = (
            ("page", ["unknown"], ["advance"], [unit()]),
            ("page", ["azure_speech"], ["delete_score"], [unit()]),
            ("page", ["azure_speech"], ["advance"], [unit(activity_type="video")]),
        )
        for values in cases:
            with self.assertRaises(HTTPException):
                _validate_package_values(*values)

    def test_duplicate_unit_key_or_sequence_is_rejected(self):
        with self.assertRaises(HTTPException):
            _validate_package_values(
                "page", ["azure_speech"], ["advance"],
                [unit(), unit(title="Duplicate", sequence=2)],
            )
        with self.assertRaises(HTTPException):
            _validate_package_values(
                "page", ["azure_speech"], ["advance"],
                [unit(), unit(unit_key="ayat-2", title="Duplicate", sequence=1)],
            )

    def test_completion_defaults_are_strict_and_bounded(self):
        rules = _default_completion_rules({})
        self.assertEqual(rules["required_unit_pass_rate"], 1.0)
        self.assertEqual(rules["minimum_valid_attempts_per_unit"], 1)
        self.assertTrue(rules["require_in_sequence"])
        self.assertEqual(rules["agent_minimum_confidence"], 0.75)
        self.assertEqual(rules["agent_advance_minimum_score"], 80.0)
        self.assertEqual(rules["agent_remedial_below_score"], 70.0)
        for invalid in (
            {"required_unit_pass_rate": 0},
            {"required_unit_pass_rate": 1.1},
            {"minimum_valid_attempts_per_unit": 0},
            {"agent_minimum_confidence": 1.1},
        ):
            with self.assertRaises(HTTPException):
                _default_completion_rules(invalid)

    def test_transition_conditions_match_bounded_agent_contract(self):
        _validate_transition_conditions({
            "min_average_score": 80,
            "min_confidence": 0.75,
            "max_failed_units": 0,
        })
        for invalid in (
            {"minimum_mastery_score": 80},
            {"min_confidence": 75},
            {"max_failed_units": 1.5},
        ):
            with self.assertRaises(HTTPException):
                _validate_transition_conditions(invalid)

    def test_published_and_archived_packages_are_immutable(self):
        _require_draft(SimpleNamespace(status="draft"))
        for status in ("published", "archived"):
            with self.assertRaises(HTTPException):
                _require_draft(SimpleNamespace(status=status))

    def test_admin_dependency_and_migration_chain_are_present(self):
        root = Path(__file__).parent
        endpoint = root.joinpath("kids_package_endpoints.py").read_text(encoding="utf-8")
        migration = root.joinpath(
            "alembic", "versions", "20261108_0009_kids_learning_packages.py"
        ).read_text(encoding="utf-8")
        main = root.joinpath("main.py").read_text(encoding="utf-8")
        self.assertIn("Depends(get_current_admin_user)", endpoint)
        self.assertIn('down_revision: Union[str, None] = "20261107_0008"', migration)
        self.assertIn('"kids_learning_packages"', migration)
        self.assertIn("app.include_router(kids_package_admin_router)", main)

    def test_seed_script_is_staging_only(self):
        previous_railway = os.environ.get("RAILWAY_ENVIRONMENT_NAME")
        previous_environment = os.environ.get("ENVIRONMENT")
        try:
            os.environ["RAILWAY_ENVIRONMENT_NAME"] = "production"
            os.environ.pop("ENVIRONMENT", None)
            with self.assertRaises(RuntimeError):
                _require_staging()
            os.environ["RAILWAY_ENVIRONMENT_NAME"] = "staging"
            _require_staging()
        finally:
            if previous_railway is None:
                os.environ.pop("RAILWAY_ENVIRONMENT_NAME", None)
            else:
                os.environ["RAILWAY_ENVIRONMENT_NAME"] = previous_railway
            if previous_environment is None:
                os.environ.pop("ENVIRONMENT", None)
            else:
                os.environ["ENVIRONMENT"] = previous_environment

    def test_agent_execution_migration_uses_central_identity_and_audit_tables(self):
        root = Path(__file__).parent
        migration = root.joinpath(
            "alembic", "versions", "20261108_0010_kids_agent_execution.py"
        ).read_text(encoding="utf-8")
        database = root.joinpath("database.py").read_text(encoding="utf-8")

        self.assertIn('down_revision: Union[str, None] = "20261108_0009"', migration)
        for table in (
            "kids_package_assignments",
            "kids_package_runs",
            "kids_package_unit_results",
            "kids_agent_decisions",
            "kids_learning_plans",
            "kids_agent_overrides",
        ):
            self.assertIn(f'"{table}"', migration)
        self.assertEqual(migration.count('ForeignKey("users.id"'), 7)
        self.assertIn("class KidsAgentDecision", database)
        self.assertIn("evidence_snapshot", database)
        self.assertIn("policy_version", database)

    def test_assignment_requires_active_student_and_published_package(self):
        student = SimpleNamespace(role="student", is_active=True)
        package = SimpleNamespace(status="published")
        _validate_assignment_target(student, package)

        for invalid_student in (
            SimpleNamespace(role="qari", is_active=True),
            SimpleNamespace(role="student", is_active=False),
        ):
            with self.assertRaises(HTTPException):
                _validate_assignment_target(invalid_student, package)
        with self.assertRaises(HTTPException):
            _validate_assignment_target(student, SimpleNamespace(status="draft"))

    def test_assignment_router_is_registered(self):
        root = Path(__file__).parent
        main = root.joinpath("main.py").read_text(encoding="utf-8")
        endpoint = root.joinpath("kids_assignment_endpoints.py").read_text(encoding="utf-8")
        self.assertIn("app.include_router(kids_assignment_admin_router)", main)
        self.assertIn('ForeignKey("users.id"', root.joinpath("database.py").read_text(encoding="utf-8"))
        self.assertIn('@router.post("/assignments")', endpoint)
        self.assertIn('@router.get("/students")', endpoint)

    def test_student_learning_router_uses_verified_evidence_and_is_registered(self):
        root = Path(__file__).parent
        main = root.joinpath("main.py").read_text(encoding="utf-8")
        endpoint = root.joinpath("kids_learning_endpoints.py").read_text(encoding="utf-8")
        self.assertIn("app.include_router(kids_learning_router)", main)
        self.assertIn("Depends(get_current_student_user)", endpoint)
        self.assertIn("IqraAttempt.student_id == student_id", endpoint)
        self.assertIn("ScoringJob.user_id == student_id", endpoint)
        self.assertIn('@router.post("/runs/{run_id}/complete")', endpoint)
        self.assertIn('@router.get("/agent-decisions/latest")', endpoint)
        self.assertIn('@router.get("/history")', endpoint)

    def test_history_score_helpers_normalize_and_average(self):
        from kids_learning_endpoints import _average_score, _score_from_summary

        self.assertEqual(_score_from_summary({"unit_score": 82.25}), 82.25)
        self.assertEqual(_score_from_summary({"score": 110}), 100.0)
        self.assertIsNone(_score_from_summary({"score": "invalid"}))
        self.assertEqual(_average_score([70.0, None, 90.0]), 80.0)
        self.assertIsNone(_average_score([None]))

    def test_package_completion_gate_requires_all_evidence_by_default(self):
        first = SimpleNamespace(id="u1", unit_key="ayat-1")
        second = SimpleNamespace(id="u2", unit_key="ayat-2")
        passed = SimpleNamespace(passed=True, valid_attempt_count=1)
        failed = SimpleNamespace(passed=False, valid_attempt_count=1)

        incomplete = _evaluate_completion_rows([first, second], {"u1": passed}, {})
        self.assertFalse(incomplete["eligible_for_agent"])
        self.assertEqual(incomplete["missing_unit_keys"], ["ayat-2"])

        not_passed = _evaluate_completion_rows(
            [first, second], {"u1": passed, "u2": failed}, {}
        )
        self.assertFalse(not_passed["eligible_for_agent"])
        self.assertEqual(not_passed["failed_unit_keys"], ["ayat-2"])

        complete = _evaluate_completion_rows(
            [first, second], {"u1": passed, "u2": passed}, {}
        )
        self.assertTrue(complete["eligible_for_agent"])
        self.assertEqual(complete["actual_pass_rate"], 1.0)

    def test_bounded_agent_advances_only_through_admin_transition(self):
        transition = SimpleNamespace(
            outcome="advance", is_active=True, priority=1, created_at=None,
            conditions={"min_average_score": 80}, requires_human_approval=False,
        )
        rows = [
            {"unit_key": "u1", "passed": True, "score": 90, "valid_attempt_count": 1},
            {"unit_key": "u2", "passed": True, "score": 86, "valid_attempt_count": 1},
        ]
        result = evaluate_agent_policy(
            allowed_actions=["advance", "retain", "human_review"],
            unit_rows=rows,
            transitions=[transition],
        )
        self.assertEqual(result["outcome"], "advance")
        self.assertIs(result["transition"], transition)
        self.assertFalse(result["requires_human_review"])

        no_route = evaluate_agent_policy(
            allowed_actions=["advance", "retain"], unit_rows=rows, transitions=[]
        )
        self.assertEqual(no_route["outcome"], "retain")

    def test_bounded_agent_fails_closed_for_unknown_transition_conditions(self):
        transition = SimpleNamespace(
            outcome="advance", is_active=True, priority=1, created_at=None,
            conditions={"untrusted_future_rule": True}, requires_human_approval=False,
        )
        result = evaluate_agent_policy(
            allowed_actions=["advance", "retain"],
            unit_rows=[{"unit_key": "u1", "passed": True, "score": 95, "valid_attempt_count": 1}],
            transitions=[transition],
        )
        self.assertEqual(result["outcome"], "retain")

    def test_bounded_agent_requires_review_when_evidence_confidence_is_low(self):
        result = evaluate_agent_policy(
            allowed_actions=["advance", "retain", "human_review"],
            unit_rows=[{"unit_key": "u1", "passed": True, "score": None, "valid_attempt_count": 1}],
            transitions=[],
        )
        self.assertEqual(result["outcome"], "human_review")
        self.assertTrue(result["requires_human_review"])


if __name__ == "__main__":
    unittest.main()
