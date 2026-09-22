"""Regression checks for the promotion checkout and late ToyyibPay callbacks."""
import hashlib
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import promotion_endpoints as promotions


class PromotionPaymentTests(unittest.TestCase):
    def test_short_registration_does_not_require_location(self):
        payload = promotions.RegistrationCreate(
            full_name="Ahmad Peserta",
            phone="0123456789",
            email="ahmad@example.com",
            registration_consent=True,
        )
        self.assertEqual(payload.state, "")
        self.assertEqual(payload.district, "")

    def callback(self, status):
        registration_id = uuid4()
        registration = SimpleNamespace(
            id=registration_id,
            toyyibpay_bill_code="new-bill",
            status="payment_reserved",
            email="ahmad@example.com",
            user_id=None,
            paid_at=None,
        )
        db = MagicMock()
        registration_query = MagicMock()
        registration_query.filter.return_value.with_for_update.return_value.first.return_value = registration
        attempt_query = MagicMock()
        attempt_query.filter.return_value.first.return_value = (uuid4(),)
        user_query = MagicMock()
        user_query.filter.return_value.first.return_value = None
        db.query.side_effect = [registration_query, attempt_query, user_query]
        refno = "FPX123"
        order_id = str(registration_id)
        digest = hashlib.md5(f"test-secret{status}{order_id}{refno}ok".encode()).hexdigest()
        with patch.dict(promotions.os.environ, {"TOYYIBPAY_SECRET_KEY": "test-secret"}):
            result = promotions.toyyibpay_callback(
                refno=refno, status=status, billcode="old-bill",
                order_id=order_id, amount="200.00", hash=digest, db=db,
            )
        return result, registration, db

    def test_late_success_from_previous_bill_is_not_lost(self):
        result, registration, db = self.callback("1")
        self.assertEqual(result, {"status": "ok"})
        self.assertEqual(registration.status, "paid")
        self.assertIsInstance(registration.paid_at, datetime)
        db.commit.assert_called_once()

    def test_old_failed_bill_does_not_cancel_current_bill(self):
        result, registration, db = self.callback("3")
        self.assertEqual(result, {"status": "ok"})
        self.assertEqual(registration.status, "payment_reserved")
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
