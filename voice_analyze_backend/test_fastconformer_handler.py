import base64
import importlib.util
import unittest
from pathlib import Path


HANDLER_PATH = (
    Path(__file__).resolve().parents[1]
    / "deploy"
    / "huggingface_fastconformer"
    / "handler.py"
)
SPEC = importlib.util.spec_from_file_location("tarannum_fastconformer_handler", HANDLER_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FastConformerEndpointHandlerTests(unittest.TestCase):
    def test_decodes_nested_hugging_face_inputs(self):
        content = b"RIFF-example-wave"
        decoded, filename = MODULE.decode_request({
            "inputs": {
                "filename": "reading.wav",
                "audio_base64": base64.b64encode(content).decode("ascii"),
            }
        })
        self.assertEqual(decoded, content)
        self.assertEqual(filename, "reading.wav")

    def test_rejects_non_wav_audio(self):
        with self.assertRaisesRegex(ValueError, "WAV"):
            MODULE.decode_request({
                "filename": "reading.m4a",
                "audio_base64": base64.b64encode(b"audio").decode("ascii"),
            })

    def test_extracts_nemo_hypothesis_text(self):
        hypothesis = type("Hypothesis", (), {"text": "الرحمن الرحيم"})()
        self.assertEqual(MODULE.transcription_text([hypothesis]), "الرحمن الرحيم")


if __name__ == "__main__":
    unittest.main()
