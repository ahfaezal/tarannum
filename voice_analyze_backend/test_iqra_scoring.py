import unittest

from iqra.samples import SAMPLES, get_sample
from iqra.scoring import decide_iqra_attempt


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


if __name__ == "__main__":
    unittest.main()
