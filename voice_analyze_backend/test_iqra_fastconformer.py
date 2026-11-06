import unittest

from iqra.fastconformer import _normalize_arabic


class FastConformerShadowTests(unittest.TestCase):
    def test_normalizes_diacritics_and_alef_variants(self):
        self.assertEqual(_normalize_arabic("الرَّحْمَٰنِ الرَّحِيمِ"), "الرحمن الرحيم")
        self.assertEqual(_normalize_arabic("إِيَّاكَ"), "اياك")


if __name__ == "__main__":
    unittest.main()
