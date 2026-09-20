import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

from certificate_display import certificate_display_snapshot
from certificate_renderer import _draw_logo


class CertificateDisplayTests(unittest.TestCase):
    def test_attendance_logo_is_bundled_with_backend(self):
        canvas = MagicMock()
        _draw_logo(canvas, "attendance")
        logo_path = Path(canvas.drawImage.call_args.args[0])
        self.assertTrue(logo_path.is_file())
        self.assertEqual(logo_path.name, "tarannum-logo.png")
        self.assertEqual(logo_path.parent.name, "assets")

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
