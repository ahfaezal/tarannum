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
    _validate_package_values,
    _validate_source_metadata,
)


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
        for invalid in (
            {"required_unit_pass_rate": 0},
            {"required_unit_pass_rate": 1.1},
            {"minimum_valid_attempts_per_unit": 0},
        ):
            with self.assertRaises(HTTPException):
                _default_completion_rules(invalid)

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


if __name__ == "__main__":
    unittest.main()
