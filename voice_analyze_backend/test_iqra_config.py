import os
import unittest
from unittest.mock import patch

from iqra.config import is_azure_speech_configured, is_fastconformer_shadow_enabled, is_iqra_enabled


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

    def test_iqra_stays_disabled_in_production_without_separate_approval(self):
        for marker in (
            {"ENVIRONMENT": "production"},
            {"RAILWAY_ENVIRONMENT_NAME": "production"},
        ):
            with self.subTest(marker=marker), patch.dict(
                os.environ,
                {"IQRA_ENABLED": "true", **marker},
                clear=True,
            ):
                self.assertFalse(is_iqra_enabled())

    def test_iqra_production_requires_explicit_approval(self):
        with patch.dict(
            os.environ,
            {
                "IQRA_ENABLED": "true",
                "ENVIRONMENT": "production",
                "IQRA_PRODUCTION_APPROVED": "true",
            },
            clear=True,
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

    def test_fastconformer_shadow_requires_flag_and_endpoint(self):
        with patch.dict(os.environ, {"IQRA_FASTCONFORMER_ENABLED": "true"}, clear=True):
            self.assertFalse(is_fastconformer_shadow_enabled())
        with patch.dict(os.environ, {
            "IQRA_FASTCONFORMER_ENABLED": "true",
            "IQRA_FASTCONFORMER_ENDPOINT": "https://example.test/asr",
        }, clear=True):
            self.assertTrue(is_fastconformer_shadow_enabled())


if __name__ == "__main__":
    unittest.main()
