import unittest

from iqra.samples import SAMPLES, get_sample
from iqra.scoring import (
    apply_level_word_diagnostics,
    align_word_results,
    decide_iqra_attempt,
    reconcile_fastconformer_words,
)


class IqraScoringTests(unittest.TestCase):
    def test_catalog_contains_three_iqra_three_units(self):
        ids = {sample.id for sample in SAMPLES.values() if sample.level == 3}
        self.assertEqual(ids, {"iqra-3-unit-1", "iqra-3-unit-2", "iqra-3-unit-3"})

    def test_catalog_contains_complete_alfatihah(self):
        ayat = {sample.id for sample in SAMPLES.values() if sample.level == 6}
        self.assertEqual(len(ayat), 7)
        self.assertEqual(get_sample("iqra-6-ayah-7").sequence, 7)

    def test_iqra_three_requires_every_word_to_reach_sixty(self):
        decision = decide_iqra_attempt(3, 90, 100, 90, [95, 58, 94])
        self.assertGreaterEqual(decision.score, 70)
        self.assertFalse(decision.passed)

    def test_iqra_three_passes_a_complete_balanced_reading(self):
        decision = decide_iqra_attempt(3, 82, 100, 78, [82, 77, 80])
        self.assertTrue(decision.passed)
        self.assertEqual(decision.score, 86.8)

    def test_iqra_six_ayah_requires_completeness(self):
        decision = decide_iqra_attempt(6, 92, 80, 90, [92])
        self.assertFalse(decision.passed)

    def test_iqra_six_does_not_cap_ayah_score_with_uncalibrated_phonemes(self):
        words = [
            {"accuracy_score": 80, "phonemes": [{"accuracy_score": value} for value in [62, 75, 72, 84, 69, 50]]},
            {"accuracy_score": 92, "phonemes": [{"accuracy_score": value} for value in [19, 29, 72, 100, 89, 100]]},
        ]
        diagnosed = apply_level_word_diagnostics(6, words)
        decision = decide_iqra_attempt(6, 86, 100, 71, [item["accuracy_score"] for item in diagnosed], diagnosed)
        self.assertTrue(decision.passed)
        self.assertGreaterEqual(decision.score, 70)
        self.assertEqual(diagnosed[1]["azure_accuracy_score"], 92)
        self.assertLess(diagnosed[1]["accuracy_score"], 70)

    def test_fastconformer_can_confirm_connected_ayah_completeness(self):
        shadow = {
            "status": "completed",
            "text_similarity": 96,
            "word_coverage": 100,
            "confirms_reference": True,
        }
        decision = decide_iqra_attempt(6, 82, 50, 80, [], [], shadow)
        self.assertTrue(decision.passed)
        self.assertGreaterEqual(decision.score, 70)

    def test_fastconformer_confirmation_clears_false_omission_without_inventing_score(self):
        words = [{"word": "اللَّهِ", "accuracy_score": None, "error_type": "Omission", "phonemes": []}]
        shadow = {
            "confirms_reference": True,
            "matched_reference_words": ["الله"],
        }
        reconciled = reconcile_fastconformer_words(words, shadow)
        self.assertEqual(reconciled[0]["error_type"], "ConfirmedByFastConformer")
        self.assertTrue(reconciled[0]["content_confirmed"])
        self.assertIsNone(reconciled[0]["accuracy_score"])

    def test_iqra_six_passes_balanced_connected_reading(self):
        words = [
            {"accuracy_score": 86, "phonemes": [{"accuracy_score": value} for value in [65, 79, 83, 88]]},
            {"accuracy_score": 90, "phonemes": [{"accuracy_score": value} for value in [70, 76, 84, 89]]},
            {"accuracy_score": 99, "phonemes": [{"accuracy_score": value} for value in [99, 100]]},
            {"accuracy_score": 96, "phonemes": [{"accuracy_score": value} for value in [69, 88, 94, 100]]},
        ]
        diagnosed = apply_level_word_diagnostics(6, words)
        decision = decide_iqra_attempt(6, 93, 100, 98, [item["accuracy_score"] for item in diagnosed], diagnosed)
        self.assertTrue(decision.passed)
        self.assertGreaterEqual(decision.score, 75)

    def test_azure_insertions_do_not_create_extra_child_facing_cards(self):
        aligned = align_word_results(
            "جِهَادٌ جَامِدٌ غَفَّارٌ غَافِرٌ",
            [
                {"word": "جهاد", "accuracy_score": 73, "error_type": "None", "phonemes": []},
                {"word": "جامد", "accuracy_score": 82, "error_type": "None", "phonemes": []},
                {"word": "غفار", "accuracy_score": 86, "error_type": "None", "phonemes": []},
                {"word": "غفار", "accuracy_score": 84, "error_type": "None", "phonemes": []},
                {"word": "غافر", "accuracy_score": 88, "error_type": "None", "phonemes": []},
            ],
        )
        self.assertEqual([item["word"] for item in aligned], ["جِهَادٌ", "جَامِدٌ", "غَفَّارٌ", "غَافِرٌ"])
        self.assertEqual(len(aligned), 4)


if __name__ == "__main__":
    unittest.main()
