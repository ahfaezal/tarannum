import os
import unittest
from unittest.mock import patch

from iqra.config import is_azure_speech_configured, is_iqra_enabled


class IqraConfigTests(unittest.TestCase):
    def test_iqra_is_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(is_iqra_enabled())

    def test_iqra_accepts_explicit_enabled_values(self):
        for value in ("1", "true", "YES", "on"):
            with self.subTest(value=value), patch.dict(
                os.environ, {"IQRA_ENABLED": value}, clear=True
            ):
                self.assertTrue(is_iqra_enabled())

    def test_azure_requires_key_and_region(self):
        with patch.dict(
            os.environ,
            {"AZURE_SPEECH_KEY": "test-key", "AZURE_SPEECH_REGION": "eastus"},
            clear=True,
        ):
            self.assertTrue(is_azure_speech_configured())

        with patch.dict(os.environ, {"AZURE_SPEECH_KEY": "test-key"}, clear=True):
            self.assertFalse(is_azure_speech_configured())


if __name__ == "__main__":
    unittest.main()
