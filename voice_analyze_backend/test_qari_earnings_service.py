import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-tests")

from qari_earnings_service import (
    ASSESSMENT_FEE_CENTS,
    bank_payload,
    decrypt_account_number,
    encrypt_account_number,
    record_assessment_earning,
)


class QariEarningsServiceTests(unittest.TestCase):
    def test_bank_account_round_trip_and_masking(self):
        encrypted = encrypt_account_number("1234567890")
        self.assertNotIn("1234567890", encrypted)
        self.assertEqual(decrypt_account_number(encrypted), "1234567890")
        payload = bank_payload(SimpleNamespace(
            account_holder_name="QARI TEST", bank_name="BANK TEST",
            account_number_last4="7890", is_verified=False, updated_at=None,
        ))
        self.assertEqual(payload["account_number_masked"], "•••• 7890")
        self.assertNotIn("account_number", payload)

    def test_one_application_creates_one_rm10_earning(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        application = SimpleNamespace(
            id=uuid4(), qari_id=uuid4(), student_id=uuid4(), course_id=uuid4(),
            status="approved", decided_at=None,
        )
        earning = record_assessment_earning(db, application)
        self.assertEqual(earning.amount_cents, ASSESSMENT_FEE_CENTS)
        self.assertEqual(earning.currency, "MYR")
        self.assertEqual(earning.payer_type, "tarannum")
        self.assertEqual(earning.status, "available")
        db.add.assert_called_once_with(earning)

    def test_retry_returns_existing_earning(self):
        existing = SimpleNamespace(id=uuid4())
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing
        application = SimpleNamespace(id=uuid4())
        self.assertIs(record_assessment_earning(db, application), existing)
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
