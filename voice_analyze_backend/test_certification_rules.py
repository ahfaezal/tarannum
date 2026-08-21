import unittest

from certification_service import grade_for_score, required_recording_count


class CertificationRuleTests(unittest.TestCase):
    def test_one_minute_reference_requires_sixty_recordings(self):
        self.assertEqual(required_recording_count(3600, 60), 60)

    def test_four_minute_azan_requires_fifteen_recordings(self):
        self.assertEqual(required_recording_count(3600, 240), 15)

    def test_fractional_result_rounds_up(self):
        self.assertEqual(required_recording_count(3600, 105), 35)

    def test_grade_boundaries(self):
        self.assertEqual(grade_for_score(85), "mumtaz")
        self.assertEqual(grade_for_score(84.99), "jayyid_jiddan")
        self.assertEqual(grade_for_score(80), "jayyid_jiddan")
        self.assertEqual(grade_for_score(79.99), "jayyid")
        self.assertEqual(grade_for_score(75), "jayyid")

    def test_score_below_threshold_is_rejected(self):
        with self.assertRaises(ValueError):
            grade_for_score(74.99)


if __name__ == "__main__":
    unittest.main()
