import unittest

from iqra.fastconformer import _normalize_arabic, _reference_word_coverage


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


if __name__ == "__main__":
    unittest.main()
