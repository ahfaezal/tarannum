import unittest

from iqra.samples import SAMPLES, get_sample
from iqra.scoring import align_word_results, decide_iqra_attempt


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
