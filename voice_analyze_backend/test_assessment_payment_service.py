import hashlib
import os
import unittest
from unittest.mock import patch

from assessment_payment_service import callback_amount_is_correct, valid_callback_hash


class AssessmentPaymentServiceTests(unittest.TestCase):
    def test_only_exact_rm10_callback_amount_is_accepted(self):
        self.assertTrue(callback_amount_is_correct("10.00"))
        self.assertTrue(callback_amount_is_correct("10"))
        self.assertFalse(callback_amount_is_correct("9.99"))
        self.assertFalse(callback_amount_is_correct("1000"))
        self.assertFalse(callback_amount_is_correct("not-a-number"))

    def test_callback_hash_must_match_secret_and_transaction(self):
        expected = hashlib.md5("secret1payment-idreferenceok".encode("utf-8")).hexdigest()
        with patch.dict(os.environ, {"TOYYIBPAY_SECRET_KEY": "secret"}):
            self.assertTrue(valid_callback_hash("1", "payment-id", "reference", expected))
            self.assertFalse(valid_callback_hash("1", "another-id", "reference", expected))


if __name__ == "__main__":
    unittest.main()
