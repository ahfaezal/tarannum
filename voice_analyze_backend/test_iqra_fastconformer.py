import json
import unittest
from unittest.mock import Mock, patch

from iqra.fastconformer import _normalize_arabic, _reference_word_coverage, compare_transcription


class FastConformerShadowTests(unittest.TestCase):
    def test_normalizes_diacritics_and_alef_variants(self):
        self.assertEqual(_normalize_arabic("الرَّحْمَٰنِ الرَّحِيمِ"), "الرحمن الرحيم")
        self.assertEqual(_normalize_arabic("إِيَّاكَ"), "اياك")

    def test_connected_ayah_reports_complete_ordered_word_coverage(self):
        coverage, words = _reference_word_coverage(
            "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
            "بسم الله الرحمن الرحيم",
        )
        self.assertEqual(coverage, 100.0)
        self.assertEqual(words, ["بسم", "الله", "الرحمن", "الرحيم"])

    @patch("iqra.fastconformer.is_fastconformer_shadow_enabled", return_value=True)
    @patch("iqra.fastconformer.urlopen")
    def test_endpoint_payload_uses_custom_handler_inputs_contract(self, mocked_urlopen, _mocked_enabled):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"text": "بسم الله الرحمن الرحيم"}).encode()

        mocked_urlopen.return_value = Response()
        audio = Mock()
        audio.name = "sample.wav"
        audio.read_bytes.return_value = b"RIFF-test"
        with patch.dict(
            "os.environ",
            {"IQRA_FASTCONFORMER_ENDPOINT": "https://example.invalid", "IQRA_FASTCONFORMER_TOKEN": "test"},
        ):
            result = compare_transcription(audio, "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ")

        request = mocked_urlopen.call_args.args[0]
        payload = json.loads(request.data.decode())
        self.assertIn("inputs", payload)
        self.assertIn("audio_base64", payload["inputs"])
        self.assertTrue(result["confirms_reference"])


if __name__ == "__main__":
    unittest.main()
