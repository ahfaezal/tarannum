import unittest
from types import SimpleNamespace
from uuid import UUID

from certification_endpoints import certificate_publication_held
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

    def test_muazzin_course_certificates_are_held_from_publication(self):
        certificate = SimpleNamespace(
            id=UUID("ec41d82f-4451-435b-9785-737e3aa626c2"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
        )
        self.assertTrue(certificate_publication_held(certificate))

    def test_reviewed_muazzin_certificate_is_released(self):
        certificate = SimpleNamespace(
            id=UUID("ec5ffa40-bd71-4f78-8d75-56f41b1fc005"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
        )
        self.assertFalse(certificate_publication_held(certificate))

    def test_duplicate_muazzin_certificate_remains_held(self):
        certificate = SimpleNamespace(
            id=UUID("9b244a19-b26a-47aa-85b1-4e1de26d9205"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
        )
        self.assertTrue(certificate_publication_held(certificate))

    def test_other_course_certificates_are_not_held(self):
        certificate = SimpleNamespace(
            id=UUID("00000000-0000-0000-0000-000000000002"),
            course_id=UUID("00000000-0000-0000-0000-000000000001"),
        )
        self.assertFalse(certificate_publication_held(certificate))


if __name__ == "__main__":
    unittest.main()
