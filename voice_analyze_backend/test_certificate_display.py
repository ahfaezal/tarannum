import unittest
from types import SimpleNamespace
from uuid import UUID

from certificate_display import certificate_display_snapshot


class CertificateDisplayTests(unittest.TestCase):
    def test_muazzin_attendance_uses_approved_title_without_changing_snapshot(self):
        original = {"course_title": "Kursus Pemantapan Muazzin", "student_name": "Peserta"}
        certificate = SimpleNamespace(
            certificate_type="attendance",
            course_id=UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275"),
            snapshot_json=original,
        )
        display = certificate_display_snapshot(certificate)
        self.assertEqual(display["course_title"], "KURSUS AZAN TARANNUM HIJJAZ")
        self.assertEqual(original["course_title"], "Kursus Pemantapan Muazzin")

    def test_other_course_keeps_its_title(self):
        certificate = SimpleNamespace(
            certificate_type="attendance",
            course_id=UUID("00000000-0000-0000-0000-000000000001"),
            snapshot_json={"course_title": "Kursus Lain"},
        )
        self.assertEqual(certificate_display_snapshot(certificate)["course_title"], "Kursus Lain")
