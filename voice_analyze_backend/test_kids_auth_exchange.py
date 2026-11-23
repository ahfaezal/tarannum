import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///./test-kids-auth-exchange.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-tests")

from fastapi import HTTPException

from database import UserRole
from kids_auth_endpoints import _upsert_shadow_student


class FakeDB:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1

    def refresh(self, value):
        return None


class KidsCentralAuthExchangeTests(unittest.TestCase):
    def central_student(self, **overrides):
        values = {
            "email": "Pelajar@Tarannum.ai",
            "role": "student",
            "account_type": "student",
            "full_name": "Pelajar Ujian",
            "is_active": True,
            "is_approved": True,
        }
        values.update(overrides)
        return values

    @patch("kids_auth_endpoints.get_user_by_email", return_value=None)
    def test_creates_passwordless_shadow_student(self, _get_user):
        db = FakeDB()
        user = _upsert_shadow_student(db, self.central_student())

        self.assertEqual(user.email, "pelajar@tarannum.ai")
        self.assertEqual(user.role, UserRole.STUDENT.value)
        self.assertIsNone(user.hashed_password)
        self.assertTrue(user.email_verified)
        self.assertTrue(user.admin_provisioned)
        self.assertEqual(db.commits, 1)

    @patch("kids_auth_endpoints.get_user_by_email")
    def test_updates_existing_shadow_without_password_copy(self, get_user):
        existing = SimpleNamespace(
            role=UserRole.STUDENT.value,
            hashed_password=None,
            full_name=None,
            is_active=False,
            is_approved=False,
            email_verified=False,
            admin_provisioned=False,
        )
        get_user.return_value = existing
        db = FakeDB()

        user = _upsert_shadow_student(db, self.central_student())

        self.assertIs(user, existing)
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_approved)
        self.assertIsNone(user.hashed_password)

    @patch("kids_auth_endpoints.get_user_by_email")
    def test_never_overwrites_a_non_student_account(self, get_user):
        get_user.return_value = SimpleNamespace(role=UserRole.ADMIN.value)
        with self.assertRaises(HTTPException) as context:
            _upsert_shadow_student(FakeDB(), self.central_student())
        self.assertEqual(context.exception.status_code, 409)

    def test_rejects_non_student_or_unapproved_central_account(self):
        for overrides in (
            {"role": "admin"},
            {"is_active": False},
            {"is_approved": False},
        ):
            with self.subTest(overrides=overrides), self.assertRaises(HTTPException):
                _upsert_shadow_student(FakeDB(), self.central_student(**overrides))


if __name__ == "__main__":
    unittest.main()
