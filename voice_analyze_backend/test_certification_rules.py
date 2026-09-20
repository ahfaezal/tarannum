import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi import HTTPException
from certification_endpoints import (
    certificate_publication_held,
    admin_user_certificates,
    download_certificate,
    missing_certificate_profile_fields,
    my_certificates,
    verify_certificate,
)
from certification_service import calculate_qari_score, grade_for_score, required_recording_count


class CertificationRuleTests(unittest.TestCase):
    def test_certificate_requires_all_student_profile_details(self):
        user = SimpleNamespace(full_name="  ", ic_number=None, address="Jalan 1", phone_number="")
        self.assertEqual(
            missing_certificate_profile_fields(user),
            ["Nama penuh", "No. kad pengenalan", "No. telefon"],
        )
        user.full_name = "Peserta"
        user.ic_number = "123456789012"
        user.phone_number = "0123456789"
        self.assertEqual(missing_certificate_profile_fields(user), [])

    def test_incomplete_student_cannot_list_or_download_certificates(self):
        student_id = UUID("00000000-0000-0000-0000-000000000001")
        student = SimpleNamespace(
            id=student_id, role="student", full_name="Peserta", ic_number=None,
            address="Alamat", phone_number="0123456789",
        )
        certificate = SimpleNamespace(
            id=UUID("00000000-0000-0000-0000-000000000002"),
            student_id=student_id, qari_id=None,
            course_id=UUID("00000000-0000-0000-0000-000000000003"),
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = certificate
        self.assertEqual(my_certificates(current_user=student, db=db), [])
        with self.assertRaises(HTTPException) as error:
            download_certificate(certificate.id, current_user=student, db=db)
        self.assertEqual(error.exception.status_code, 403)

    def test_public_verification_uses_issued_certificate_not_profile(self):
        certificate = SimpleNamespace(
            student_id=UUID("00000000-0000-0000-0000-000000000001"),
            course_id=UUID("00000000-0000-0000-0000-000000000003"),
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = certificate
        with patch("certification_endpoints.certificate_public_payload", return_value={"status": "valid"}):
            self.assertEqual(verify_certificate("example-token", db=db), {"status": "valid"})
        self.assertEqual(db.query.call_count, 1)

    def test_held_certificate_still_cannot_be_publicly_verified(self):
        certificate = SimpleNamespace(
            id=UUID("9b244a19-b26a-47aa-85b1-4e1de26d9205"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = certificate
        with self.assertRaises(HTTPException) as error:
            verify_certificate("held-token", db=db)
        self.assertEqual(error.exception.status_code, 404)

    def test_admin_can_list_one_users_held_certificates(self):
        student_id = UUID("00000000-0000-0000-0000-000000000001")
        student = SimpleNamespace(role="student", full_name="Peserta", ic_number=None, address="Alamat", phone_number="0123456789")
        certificate = SimpleNamespace(
            id=UUID("9b244a19-b26a-47aa-85b1-4e1de26d9205"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = student
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [certificate]
        with patch("certification_endpoints.certificate_public_payload", return_value={"certificate_number": "TEST"}):
            rows = admin_user_certificates(student_id, admin=SimpleNamespace(role="admin"), db=db)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["publication_held"])
        self.assertTrue(rows[0]["profile_incomplete"])

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

    def test_complete_qari_rubric_is_weighted_to_percentage(self):
        assessment = {
            "lafaz_completion": 5, "pronunciation": 4,
            "melodic_contour": 4, "contour_detail": 3,
            "pitch_control": 4, "timing": 4,
            "vocal_breath": 3, "overall_azan": 4,
        }
        self.assertEqual(calculate_qari_score(assessment), 79.0)

    def test_incomplete_qari_rubric_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Semua elemen"):
            calculate_qari_score({"pronunciation": 5})

    def test_qari_rubric_only_accepts_scale_one_to_five(self):
        assessment = {key: 5 for key in (
            "lafaz_completion", "pronunciation", "melodic_contour", "contour_detail",
            "pitch_control", "timing", "vocal_breath", "overall_azan",
        )}
        assessment["timing"] = 6
        with self.assertRaisesRegex(ValueError, "skala 1 hingga 5"):
            calculate_qari_score(assessment)

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

    def test_explicitly_released_muazzin_certificate_is_visible(self):
        certificate = SimpleNamespace(
            id=UUID("9b244a19-b26a-47aa-85b1-4e1de26d9205"),
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
            publication_released=True,
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
