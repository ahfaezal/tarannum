import unittest

from iqra.azure_speech import parse_detailed_result
from iqra.samples import get_sample


class IqraAzureSpeechTests(unittest.TestCase):
    def test_iqra_three_sample_is_server_controlled(self):
        sample = get_sample("iqra-3-demo")
        self.assertIsNotNone(sample)
        self.assertEqual(sample.level, 3)
        self.assertEqual(sample.reference_text, "كَتَبَ ذَهَبَ فَتَحَ")

    def test_parse_word_and_phoneme_scores(self):
        words = parse_detailed_result(
            {
                "NBest": [
                    {
                        "Words": [
                            {
                                "Word": "كَتَبَ",
                                "PronunciationAssessment": {
                                    "AccuracyScore": 88.125,
                                    "ErrorType": "None",
                                },
                                "Phonemes": [
                                    {
                                        "Phoneme": "k",
                                        "PronunciationAssessment": {
                                            "AccuracyScore": 91.9
                                        },
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        )
        self.assertEqual(words[0]["word"], "كَتَبَ")
        self.assertEqual(words[0]["accuracy_score"], 88.12)
        self.assertEqual(words[0]["phonemes"][0]["accuracy_score"], 91.9)


if __name__ == "__main__":
    unittest.main()
