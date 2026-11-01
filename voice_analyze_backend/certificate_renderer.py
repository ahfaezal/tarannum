"""Deterministic PDF renderer for the three locked Tarannum.ai certificates."""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime
from pathlib import Path

import qrcode
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

from certificate_display import certificate_display_snapshot
from database import Certificate, CertificateApplication, QariSignature, CEOSignature, User


EMERALD = HexColor("#07543D")
GOLD = HexColor("#C9982E")
LIGHT_GOLD = HexColor("#F6E8B7")
CREAM = HexColor("#FFFDF5")
NAVY = HexColor("#132A45")
RED = HexColor("#B91C1C")
PALE = HexColor("#E7E2D4")

TRANSCRIPT_RUBRIC = (
    ("lafaz_completion", "Kelengkapan dan susunan lafaz", 15),
    ("pronunciation", "Ketepatan lafaz dan sebutan", 20),
    ("melodic_contour", "Bentuk melodi keseluruhan", 15),
    ("contour_detail", "Perincian lenggok setiap frasa", 10),
    ("pitch_control", "Kedudukan dan kawalan nada", 10),
    ("timing", "Tempo, jeda dan kesinambungan", 10),
    ("vocal_breath", "Kestabilan suara dan kawalan nafas", 10),
    ("overall_azan", "Kesesuaian persembahan azan keseluruhan", 10),
)

GRADE_DETAILS = {
    "mumtaz": ("MUMTAZ", "Cemerlang", "grade-mumtaz.png"),
    "jayyid_jiddan": ("JAYYID JIDDAN", "Sangat Baik", "grade-jayyid-jiddan.png"),
    "jayyid": ("JAYYID", "Baik", "grade-jayyid.png"),
}


def _fit_font(text: str, font: str, maximum: float, max_width: float, minimum: float = 12) -> float:
    size = maximum
    while size > minimum and stringWidth(text, font, size) > max_width:
        size -= 0.5
    return size


def _wrap_text_to_width(text: str, font: str, size: float, max_width: float) -> list[str]:
    """Wrap a short certificate label without shrinking it into illegibility."""
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _centered(c: canvas.Canvas, text: str, y: float, font: str, size: float, color=EMERALD):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(landscape(A4)[0] / 2, y, text)


def _draw_border(c: canvas.Canvas, certificate_type: str):
    width, height = landscape(A4)
    if certificate_type == "attendance":
        background = Path(__file__).resolve().parent / "assets" / "attendance-certificate-background.png"
        c.drawImage(str(background), 0, 0, width, height)
        return
    if certificate_type == "competency_azan":
        background = Path(__file__).resolve().parent / "assets" / "azan-competency-background.png"
        c.drawImage(str(background), 0, 0, width, height)
        return
    c.setFillColor(CREAM)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    outer = 10
    c.setStrokeColor(EMERALD)
    c.setLineWidth(7 if certificate_type != "attendance" else 5)
    c.rect(outer, outer, width - outer * 2, height - outer * 2)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.4)
    c.rect(outer + 6, outer + 6, width - (outer + 6) * 2, height - (outer + 6) * 2)
    c.rect(outer + 11, outer + 11, width - (outer + 11) * 2, height - (outer + 11) * 2)
    if certificate_type == "competency_azan":
        c.setStrokeColor(Color(0.78, 0.60, 0.18, alpha=0.6))
        c.setLineWidth(0.7)
        y = 183
        points = [(x, y + (6 if (x // 10) % 2 else -6)) for x in range(110, int(width - 110), 10)]
        path = c.beginPath()
        path.moveTo(*points[0])
        for point in points[1:]:
            path.lineTo(*point)
        c.drawPath(path)


def _course_date_label(value: str) -> str:
    months = ("Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember")
    try:
        course_date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return value[:10] if value else ""
    return f"{course_date.day} {months[course_date.month - 1]} {course_date.year}"


def _draw_attendance_body(c: canvas.Canvas, certificate: Certificate, snapshot: dict, width: float, height: float):
    _centered(c, "SIJIL KEHADIRAN & PENYERTAAN", height - 198, "Times-Bold", 31, EMERALD)
    _centered(c, "Dengan ini diperakui bahawa", height - 239, "Helvetica", 12.5, NAVY)
    student_name = (snapshot.get("student_name") or "").upper()
    _centered(c, student_name, height - 279, "Times-Bold", _fit_font(student_name, "Times-Bold", 29, width - 145, 14), EMERALD)
    _centered(c, "telah menghadiri", height - 309, "Helvetica", 12, NAVY)

    # The empty ornate course cartouche is part of the approved background.
    course_title = (snapshot.get("certificate_course_title") or snapshot.get("course_title") or snapshot.get("reference_title") or "").upper()
    _centered(c, course_title, height - 355, "Times-Bold", _fit_font(course_title, "Times-Bold", 18, width - 330, 10), EMERALD)
    practice_minutes = snapshot.get("practice_minutes") or 60
    _centered(c, f"dan berjaya menyempurnakan {practice_minutes} minit latihan rakaman", height - 399, "Helvetica", 11, NAVY)

    left = 123
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 10)
    duration_minutes = snapshot.get("course_duration_minutes") or 360
    duration_hours = round(duration_minutes / 60)
    footer_rows = [
        [f"Tarikh Kursus: {_course_date_label(snapshot.get('course_date') or '')}"],
        [f"Tempoh Kursus: 1 Hari - {duration_hours} Jam"],
        [f"No. Sijil: {certificate.certificate_number}"],
    ]
    if snapshot.get("course_location"):
        footer_rows.append(
            _wrap_text_to_width(
                f"Lokasi Latihan: {snapshot['course_location']}",
                "Helvetica",
                9.5,
                255,
            )
        )

    y = 150
    for row in footer_rows:
        c.setFont("Helvetica", 9.5 if len(row) > 1 else 10)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.9)
        c.line(left - 15, y + 4, left - 11, y + 9)
        c.line(left - 11, y + 9, left - 7, y + 4)
        c.line(left - 7, y + 4, left - 11, y - 1)
        c.line(left - 11, y - 1, left - 15, y + 4)
        for line_index, line in enumerate(row):
            c.drawString(left, y - line_index * 11, line)
        y -= 26 + max(0, len(row) - 1) * 11


def _draw_diamond(c: canvas.Canvas, x: float, y: float, radius: float, color=EMERALD):
    path = c.beginPath()
    path.moveTo(x, y + radius)
    path.lineTo(x + radius, y)
    path.lineTo(x, y - radius)
    path.lineTo(x - radius, y)
    path.close()
    c.setFillColor(color)
    c.drawPath(path, fill=1, stroke=0)


def _draw_azan_wave(c: canvas.Canvas, x: float, y: float, direction: int):
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.75)
    c.line(x, y, x + direction * 120, y)
    heights = (2, 5, 10, 6, 3, 12, 17, 8, 4, 2, 7, 13, 19, 9, 4, 3, 8, 14, 7, 3)
    for index, level in enumerate(heights):
        cx = x + direction * (15 + index * 4.7)
        c.line(cx, y - level / 2, cx, y + level / 2)


def _draw_grade_cartouche(c: canvas.Canvas, x: float, y: float, width: float, height: float):
    inset = 13
    point = 8
    path = c.beginPath()
    path.moveTo(x + inset, y)
    path.lineTo(x + width - inset, y)
    path.curveTo(x + width - 6, y, x + width - 6, y + 5, x + width, y + height / 2)
    path.curveTo(x + width - 6, y + height - 5, x + width - 6, y + height, x + width - inset, y + height)
    path.lineTo(x + inset, y + height)
    path.curveTo(x + 6, y + height, x + 6, y + height - 5, x, y + height / 2)
    path.curveTo(x + 6, y + 5, x + 6, y, x + inset, y)
    path.close()
    c.setFillColor(EMERALD)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.4)
    c.drawPath(path, fill=1, stroke=1)
    _draw_diamond(c, x + point + 4, y + height / 2, 4, GOLD)
    _draw_diamond(c, x + width - point - 4, y + height / 2, 4, GOLD)


def _draw_azan_seal(c: canvas.Canvas, x: float, y: float):
    seal_path = Path(__file__).resolve().parent / "assets" / "tarannum-gold-seal.png"
    if not seal_path.is_file():
        raise FileNotFoundError(f"Gold competency seal is missing: {seal_path}")
    size = 105
    c.drawImage(str(seal_path), x - size / 2, y - size / 2, size, size,
                preserveAspectRatio=True, mask="auto")


def _transparent_signature_reader(image_data: bytes) -> ImageReader:
    """Render legacy signatures without the photographed white paper background."""
    with Image.open(io.BytesIO(image_data)) as source:
        rgba = source.convert("RGBA")
        pixels = []
        for red, green, blue, alpha in rgba.getdata():
            luminance = int((red * 0.299) + (green * 0.587) + (blue * 0.114))
            ink_alpha = min(alpha, max(0, min(255, (245 - luminance) * 5)))
            pixels.append((15, 23, 42, ink_alpha))
        rgba.putdata(pixels)
        alpha_box = rgba.getchannel("A").getbbox()
        if alpha_box:
            left, top, right, bottom = alpha_box
            padding = max(4, int(max(rgba.size) * 0.015))
            rgba = rgba.crop((
                max(0, left - padding), max(0, top - padding),
                min(rgba.width, right + padding), min(rgba.height, bottom + padding),
            ))
        stream = io.BytesIO()
        rgba.save(stream, format="PNG", optimize=True)
        stream.seek(0)
        return ImageReader(stream)


def _draw_azan_competency_body(c: canvas.Canvas, certificate: Certificate, snapshot: dict, width: float, height: float):
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.7)
    c.line(width / 2 - 80, height - 154, width / 2 - 10, height - 154)
    c.line(width / 2 + 10, height - 154, width / 2 + 80, height - 154)
    _draw_diamond(c, width / 2, height - 154, 5)

    _centered(c, "SIJIL KOMPETENSI AZAN", height - 198, "Times-Roman", 41, EMERALD)
    c.line(190, height - 210, width - 190, height - 210)
    _draw_diamond(c, width / 2, height - 210, 4)
    c.setLineWidth(0.7)
    c.line(width / 2 - 220, height - 237, width / 2 - 176, height - 237)
    c.line(width / 2 + 176, height - 237, width / 2 + 220, height - 237)
    _draw_diamond(c, width / 2 - 166, height - 237, 3)
    _draw_diamond(c, width / 2 + 166, height - 237, 3)
    _centered(c, "Dengan ini diperakui bahawa", height - 236, "Times-Roman", 13, NAVY)
    student_name = (snapshot.get("student_name") or "").upper()
    _centered(c, student_name, height - 281, "Times-Roman", _fit_font(student_name, "Times-Roman", 32, width - 150, 15), EMERALD)
    _centered(c, "telah menunjukkan kompetensi dalam", height - 311, "Times-Roman", 13, NAVY)

    c.setStrokeColor(GOLD)
    c.setLineWidth(1.0)
    c.roundRect(202, height - 355, width - 404, 37, 7, fill=0, stroke=1)
    c.setLineWidth(0.4)
    c.roundRect(205, height - 352, width - 410, 31, 6, fill=0, stroke=1)
    _draw_diamond(c, 198, height - 336.5, 3)
    _draw_diamond(c, width - 198, height - 336.5, 3)
    maqam = (snapshot.get("maqam") or "").upper()
    if maqam in {"HIJAZ", "HIJJAZ"}:
        maqam = "HIJJAZ"
    competency = (snapshot.get("competency_name") or ("AZAN TARANNUM" + (f" {maqam}" if maqam else ""))).upper()
    _centered(c, competency, height - 344, "Times-Roman", _fit_font(competency, "Times-Roman", 24, width - 430, 13), EMERALD)

    grade = (snapshot.get("final_grade") or "").upper()
    _draw_grade_cartouche(c, width / 2 - 140, height - 406, 280, 38)
    _centered(c, f"TAHAP: {grade}", height - 394, "Times-Bold", _fit_font(f"TAHAP: {grade}", "Times-Bold", 21, 255, 14), LIGHT_GOLD)
    _draw_azan_wave(c, width / 2 - 148, height - 387, -1)
    _draw_azan_wave(c, width / 2 + 148, height - 387, 1)

    _centered(c, "Disahkan oleh Qari Berautoriti", height - 418, "Times-Roman", 11, NAVY)
    _centered(c, f"Tarikh Kelulusan: {_course_date_label(certificate.issued_at.isoformat())}", height - 435, "Times-Roman", 10, NAVY)
    _centered(c, f"No. Sijil: {certificate.certificate_number}", height - 450, "Times-Roman", 10, NAVY)
    _draw_azan_seal(c, width / 2, 95)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.9)
    c.line(319, 72, 319, 137)
    c.line(523, 72, 523, 137)


def _draw_logo(c: canvas.Canvas, certificate_type: str):
    backend_dir = Path(__file__).resolve().parent
    # Railway builds the backend without the frontend/public directory.
    default_logo = backend_dir / "assets" / "tarannum-logo.png"
    configured_logo = os.getenv("CERTIFICATE_LOGO_PATH")
    logo_path = Path(configured_logo) if configured_logo and Path(configured_logo).is_file() else default_logo
    width, height = landscape(A4)
    if not logo_path.is_file():
        raise FileNotFoundError(f"Certificate logo is missing: {logo_path}")
    logo_size = 105 if certificate_type == "attendance" else (90 if certificate_type == "competency_azan" else 60)
    logo_bottom = height - 149 if certificate_type == "attendance" else (height - 122 if certificate_type == "competency_azan" else height - 82)
    c.drawImage(str(logo_path), width / 2 - logo_size / 2, logo_bottom, logo_size, logo_size, preserveAspectRatio=True, mask="auto")
    label_y = height - 159 if certificate_type == "attendance" else (height - 135 if certificate_type == "competency_azan" else height - 102)
    _centered(c, "tarannum.ai", label_y, "Helvetica-Bold", 15, EMERALD)


def _draw_qr(c: canvas.Canvas, url: str, certificate_type: str):
    qr = qrcode.QRCode(version=None, box_size=5, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    stream.seek(0)
    from reportlab.lib.utils import ImageReader
    if certificate_type == "attendance":
        c.drawImage(ImageReader(stream), 674, 80, 91, 91, preserveAspectRatio=True, mask="auto")
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.8)
        c.rect(671, 77, 97, 97, fill=0, stroke=1)
    elif certificate_type == "competency_azan":
        c.drawImage(ImageReader(stream), 686, 84, 72, 72, preserveAspectRatio=True, mask="auto")
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.8)
        c.rect(683, 81, 78, 78, fill=0, stroke=1)
    else:
        c.drawImage(ImageReader(stream), 704, 58, 78, 78, preserveAspectRatio=True, mask="auto")


def _draw_signature(c: canvas.Canvas, x: float, y: float, name: str, title_lines: list[str], image_path=None,
                    image_height: float = 45, image_width: float = 130, image_offset_y: float = 12):
    if isinstance(image_path, ImageReader):
        c.drawImage(image_path, x - image_width / 2, y + image_offset_y, image_width, image_height, preserveAspectRatio=True, mask='auto')
    elif image_path and Path(image_path).exists():
        c.drawImage(str(image_path), x - image_width / 2, y + image_offset_y, image_width, image_height, preserveAspectRatio=True, mask="auto")
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(x - 85, y + 10, x + 85, y + 10)
    c.setFillColor(NAVY)
    size = _fit_font(name, "Helvetica", 9, 180, 7)
    c.setFont("Helvetica", size)
    c.drawCentredString(x, y - 3, name)
    for index, line in enumerate(title_lines):
        c.setFont("Helvetica", _fit_font(line or "", "Helvetica", 7.5, 180, 6))
        c.drawCentredString(x, y - 15 - index * 10, line)


def _masked_identity(value: str | None) -> str:
    digits = "".join(character for character in (value or "") if character.isdigit())
    return f"******-**-{digits[-4:]}" if len(digits) >= 4 else "Tidak dipaparkan"


def _draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float,
                  font: str = "Helvetica", size: float = 8.5, leading: float = 11,
                  max_lines: int = 4, color=NAVY) -> float:
    lines = _wrap_text_to_width((text or "").strip(), font, size, width)[:max_lines]
    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def _draw_transcript_box(c: canvas.Canvas, x: float, y: float, width: float, height: float,
                         title: str | None = None):
    c.setFillColor(CREAM)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 8, fill=1, stroke=1)
    if title:
        c.setFillColor(EMERALD)
        c.roundRect(x, y + height - 22, width, 22, 8, fill=1, stroke=0)
        c.rect(x, y + height - 22, width, 11, fill=1, stroke=0)
        c.setFillColor(CREAM)
        c.setFont("Times-Bold", 11)
        c.drawString(x + 10, y + height - 15, title)


def _draw_transcript_page(c: canvas.Canvas, db, certificate: Certificate, snapshot: dict,
                          width: float, height: float):
    """Append the locked competency transcript as page two of the certificate PDF."""
    application = db.get(CertificateApplication, certificate.application_id) if certificate.application_id else None
    student = db.get(User, certificate.student_id)
    assessment = dict(application.qari_assessment_json or {}) if application else {}
    qari_score = float(application.qari_score or 0) if application else 0.0
    qari_notes = (application.qari_notes or "").strip() if application else ""
    grade_key = certificate.final_grade or "jayyid"
    grade_roman, grade_malay, grade_asset = GRADE_DETAILS.get(grade_key, GRADE_DETAILS["jayyid"])
    transcript_number = f"{certificate.certificate_number}-T"

    transcript_background = Path(__file__).resolve().parent / "assets" / "azan-transcript-background.png"
    if transcript_background.is_file():
        c.drawImage(str(transcript_background), 0, 0, width, height,
                    preserveAspectRatio=False, mask="auto")
    else:
        c.setFillColor(CREAM)
        c.rect(0, 0, width, height, fill=1, stroke=0)
        c.setStrokeColor(EMERALD)
        c.setLineWidth(6)
        c.rect(10, 10, width - 20, height - 20, fill=0, stroke=1)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.2)
        c.rect(17, 17, width - 34, height - 34, fill=0, stroke=1)
    logo_path = Path(__file__).resolve().parent / "assets" / "tarannum-logo.png"
    c.drawImage(str(logo_path), width / 2 - 25, height - 62, 50, 50,
                preserveAspectRatio=True, mask="auto")

    c.setFillColor(NAVY)
    c.setFont("Helvetica", 7.5)
    c.drawString(width - 218, height - 38, f"No. Transkrip: {transcript_number}")
    c.drawString(width - 218, height - 50, f"No. Sijil: {certificate.certificate_number}")
    c.drawString(width - 218, height - 62, f"Tarikh Dikeluarkan: {_course_date_label(certificate.issued_at.isoformat())}")
    _centered(c, "TRANSKRIP PENILAIAN KOMPETENSI AZAN", height - 91, "Times-Bold", 23, EMERALD)
    _centered(c, "AZAN MAQAM HIJJAZ", height - 113, "Times-Bold", 15, GOLD)
    _centered(c, "REKOD PENILAIAN QARI BERAUTORITI", height - 130, "Helvetica-Bold", 7.5, NAVY)

    top_y = 304
    _draw_transcript_box(c, 28, top_y, 310, 118, "MAKLUMAT PESERTA")
    details = (
        ("Nama", snapshot.get("student_name") or ""),
        ("No. Kad Pengenalan", _masked_identity(getattr(student, "ic_number", None))),
        ("Program", snapshot.get("certificate_course_title") or snapshot.get("course_title") or ""),
        ("Tarikh Kursus", _course_date_label(snapshot.get("course_date") or "")),
        ("Lokasi", snapshot.get("course_location") or ""),
        ("Qari Penilai", snapshot.get("qari_name") or "Qari Berautoriti"),
    )
    y = top_y + 83
    for label, value in details:
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 7.5)
        c.drawString(39, y, label)
        c.drawString(118, y, ":")
        c.setFont("Helvetica-Bold" if label in {"Nama", "Qari Penilai"} else "Helvetica", 7.5)
        c.drawString(128, y, str(value)[:52])
        y -= 13
    qari_title = snapshot.get("qari_title") or "Qari Penilai"
    c.setFont("Helvetica", 6.5)
    c.drawString(128, y + 7, str(qari_title)[:66])

    _draw_transcript_box(c, 350, top_y, 265, 118, "PENGANUGERAHAN")
    c.setFillColor(NAVY)
    c.setFont("Times-Roman", 10)
    c.drawCentredString(482.5, top_y + 84, "Dengan ini disahkan bahawa")
    c.setFont("Times-Bold", _fit_font(snapshot.get("student_name") or "", "Times-Bold", 14, 235, 9))
    c.drawCentredString(482.5, top_y + 61, snapshot.get("student_name") or "")
    c.setFont("Times-Roman", 8.5)
    c.drawCentredString(482.5, top_y + 42, "telah menunjukkan kompetensi dalam melafazkan azan")
    c.drawCentredString(482.5, top_y + 29, "mengikut Maqam Hijjaz melalui penilaian Qari berautoriti.")

    _draw_transcript_box(c, 627, top_y, 187, 118, "TAHAP KOMPETENSI")
    c.setFillColor(EMERALD)
    c.roundRect(642, top_y + 39, 157, 50, 14, fill=1, stroke=0)
    c.setFillColor(LIGHT_GOLD)
    c.setFont("Times-Bold", _fit_font(grade_roman, "Times-Bold", 16, 145, 10))
    c.drawCentredString(720.5, top_y + 68, grade_roman)
    arabic_path = Path(__file__).resolve().parent / "assets" / grade_asset
    if arabic_path.is_file():
        c.drawImage(str(arabic_path), 682, top_y + 43, 77, 19, preserveAspectRatio=True, mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 12)
    c.drawCentredString(720.5, top_y + 19, grade_malay)

    table_x, table_y, table_w, row_h = 28, 127, 786, 17
    table_top = table_y + row_h * 9
    c.setFillColor(EMERALD)
    c.rect(table_x, table_top, table_w, 22, fill=1, stroke=0)
    c.setFillColor(CREAM)
    c.setFont("Times-Bold", 10)
    c.drawString(table_x + 10, table_top + 7, "PERINCIAN PENILAIAN QARI")
    columns = (table_x, table_x + 42, table_x + 445, table_x + 574, table_x + 662, table_x + table_w)
    headers = ("Bil.", "Elemen Kompetensi", "Skala Qari (1-5)", "Wajaran", "Markah Berwajaran")
    c.setFillColor(HexColor("#E8F0EB"))
    c.rect(table_x, table_top - row_h, table_w, row_h, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7.4)
    for index, header in enumerate(headers):
        c.drawCentredString((columns[index] + columns[index + 1]) / 2, table_top - 13, header)
    scale_labels = {1: "Lemah", 2: "Memadai", 3: "Baik", 4: "Sangat Baik", 5: "Cemerlang"}
    for row_index, (key, label, weight) in enumerate(TRANSCRIPT_RUBRIC, start=1):
        y0 = table_top - row_h * (row_index + 1)
        if row_index % 2 == 0:
            c.setFillColor(HexColor("#F2F5F2"))
            c.rect(table_x, y0, table_w, row_h, fill=1, stroke=0)
        rating = int(assessment.get(key) or 0)
        weighted = (rating / 5) * weight
        values = (str(row_index), label, f"{rating} - {scale_labels.get(rating, '-')}", f"{weight}%", f"{weighted:.0f}")
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 7.1)
        c.drawCentredString((columns[0] + columns[1]) / 2, y0 + 5, values[0])
        c.drawString(columns[1] + 8, y0 + 5, values[1])
        for column_index in range(2, 5):
            c.drawCentredString((columns[column_index] + columns[column_index + 1]) / 2, y0 + 5, values[column_index])
    c.setStrokeColor(HexColor("#A8B8AF"))
    c.setLineWidth(0.35)
    for x in columns:
        c.line(x, table_y, x, table_top)
    for row_index in range(10):
        c.line(table_x, table_y + row_h * row_index, table_x + table_w, table_y + row_h * row_index)

    _draw_transcript_box(c, 28, 69, 500, 48, "RUMUSAN KEPUTUSAN")
    summary = (("Jumlah", f"{qari_score:.0f}/100"), ("Keputusan", "LULUS"), ("Pangkat", grade_roman), ("Tahap", grade_malay))
    for index, (label, value) in enumerate(summary):
        center = 28 + (index + 0.5) * 125
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 6.7)
        c.drawCentredString(center, 88, label)
        c.setFont("Times-Bold", _fit_font(value, "Times-Bold", 12, 105, 8))
        c.drawCentredString(center, 75, value)

    _draw_transcript_box(c, 540, 69, 274, 48, "SKALA PENILAIAN QARI")
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 7)
    c.setFont("Helvetica", 6.4)
    c.drawCentredString(677, 80, "1 Lemah | 2 Memadai | 3 Baik | 4 Sangat Baik | 5 Cemerlang")

    _draw_transcript_box(c, 28, 18, 372, 42, "ULASAN QARI")
    comment = qari_notes or "Penilaian kompetensi telah disahkan berdasarkan rubrik rasmi oleh Qari Penilai."
    _draw_wrapped(c, comment, 39, 31, 350, size=5.8, leading=7, max_lines=2)
    _draw_transcript_box(c, 410, 18, 112, 42)
    _draw_wrapped(c, "Skor AI menyokong latihan; keputusan kompetensi disahkan oleh Qari Penilai.", 420, 45, 92, size=5.8, leading=6.5, max_lines=4)

    qari_signature = None
    qari_id = getattr(certificate, "qari_id", None)
    if qari_id:
        qari_signature = (
            db.query(QariSignature)
            .filter(QariSignature.qari_id == qari_id, QariSignature.is_active.is_(True))
            .order_by(QariSignature.updated_at.desc())
            .first()
        )
    if qari_signature:
        signature_reader = _transparent_signature_reader(qari_signature.signature_path)
        if signature_reader:
            c.drawImage(signature_reader, 535, 28, 90, 30,
                        preserveAspectRatio=True, anchor="c", mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", _fit_font(snapshot.get("qari_name") or "Qari Penilai", "Helvetica-Bold", 6.5, 120, 5.2))
    c.drawCentredString(580, 20, snapshot.get("qari_name") or "Qari Penilai")
    c.setFont("Helvetica", _fit_font(qari_title, "Helvetica", 5.2, 120, 4.2))
    c.drawCentredString(580, 13, qari_title)
    qr = qrcode.QRCode(version=None, box_size=3, border=1)
    qr.add_data(snapshot.get("verification_url", "https://tarannum.ai"))
    qr.make(fit=True)
    qr_image = qr.make_image(fill_color="black", back_color="white")
    qr_stream = io.BytesIO()
    qr_image.save(qr_stream, format="PNG")
    qr_stream.seek(0)
    c.drawImage(ImageReader(qr_stream), 660, 18, 42, 42, preserveAspectRatio=True, mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 6)
    c.drawString(710, 42, "Pengesahan ketulenan")
    c.drawString(710, 29, transcript_number)


def render_certificate_pdf(db, certificate: Certificate) -> Path:
    """Render and persist a certificate PDF, then store its SHA-256 hash."""
    output_dir = Path(os.getenv("CERTIFICATE_OUTPUT_DIR", "data/private/certificates")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{certificate.certificate_number}.pdf"
    snapshot = certificate_display_snapshot(certificate)
    c = canvas.Canvas(str(output_path), pagesize=landscape(A4), pageCompression=1)
    width, height = landscape(A4)
    c.setTitle(certificate.certificate_number)
    c.setAuthor("Tarannum Technologies")
    _draw_border(c, certificate.certificate_type)
    _draw_logo(c, certificate.certificate_type)

    is_attendance = certificate.certificate_type == "attendance"
    is_azan = certificate.certificate_type == "competency_azan"
    if is_azan:
        if os.getenv("CERTIFICATE_SAMPLE_MODE") == "true":
            c.saveState()
            c.translate(width / 2, height / 2)
            c.rotate(25)
            c.setFillColor(PALE)
            c.setFont("Helvetica-Bold", 56)
            c.drawCentredString(0, -15, "CONTOH")
            c.restoreState()
    elif not is_attendance:
        c.saveState()
        c.translate(width / 2, height / 2)
        c.rotate(25)
        c.setFillColor(PALE)
        c.setFont("Helvetica-Bold", 62)
        c.drawCentredString(0, -15, "CONTOH - SAH" if os.getenv("CERTIFICATE_SAMPLE_MODE") == "true" else "TARANNUM.AI")
        c.restoreState()
    title = (
        "SIJIL KOMPETENSI AZAN" if certificate.certificate_type == "competency_azan" else "SIJIL KOMPETENSI TARANNUM"
    )
    if is_attendance:
        _draw_attendance_body(c, certificate, snapshot, width, height)
    elif is_azan:
        _draw_azan_competency_body(c, certificate, snapshot, width, height)
    else:
        _centered(c, title, height - 150, "Times-Bold", _fit_font(title, "Times-Bold", 29, width - 130), EMERALD)
        _centered(c, "Dengan ini diperakui bahawa", height - 181, "Times-Roman", 13, NAVY)
        student_name = (snapshot.get("student_name") or "").upper()
        _centered(c, student_name, height - 220, "Times-Bold", _fit_font(student_name, "Times-Bold", 27, width - 150), EMERALD)
        _centered(c, "telah menunjukkan kompetensi dalam", height - 250, "Times-Roman", 13, NAVY)
        competency = (snapshot.get("competency_name") or " • ".join(filter(None, [snapshot.get("reference_title"), snapshot.get("maqam")]))).upper()
        _centered(c, competency, height - 283, "Times-Bold", _fit_font(competency, "Times-Bold", 19, width - 170), EMERALD)
        grade = (snapshot.get("final_grade") or "").upper()
        c.setFillColor(EMERALD)
        c.roundRect(width / 2 - 110, height - 327, 220, 31, 8, fill=1, stroke=0)
        _centered(c, f"TAHAP: {grade}", height - 317, "Times-Bold", 16, GOLD)
        _centered(c, "Disahkan oleh Qari Berautoriti", height - 346, "Times-Roman", 10.5, NAVY)

    if not is_attendance and not is_azan:
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 8)
        c.drawString(52, 82, f"No. Sijil: {certificate.certificate_number}")
        c.drawString(52, 69, f"Tarikh Dikeluarkan: {certificate.issued_at.strftime('%d/%m/%Y')}")

    ceo_signature = os.getenv("CERTIFICATE_CEO_SIGNATURE_PATH")
    uploaded_ceo_signature = db.get(CEOSignature, 1)
    if uploaded_ceo_signature:
        ceo_signature = _transparent_signature_reader(bytes(uploaded_ceo_signature.image_data))
    if is_attendance:
        _draw_signature(c, width / 2, 111, snapshot.get("ceo_name", ""), [snapshot.get("ceo_title", ""), snapshot.get("ceo_organization", "")], ceo_signature)
    else:
        qari_signature = db.query(QariSignature).filter(QariSignature.qari_id == certificate.qari_id, QariSignature.is_active.is_(True)).first()
        qari_signature_image = None
        if qari_signature:
            if qari_signature.image_data:
                qari_signature_image = _transparent_signature_reader(bytes(qari_signature.image_data))
            elif qari_signature.storage_path and Path(qari_signature.storage_path).exists():
                qari_signature_image = qari_signature.storage_path
        qari_title = snapshot.get("qari_title") or (qari_signature.signer_title if qari_signature else None)
        if is_azan:
            _draw_signature(c, 215, 81, snapshot.get("qari_name", "Qari Berautoriti"), [qari_title or "Qari Berautoriti"], qari_signature_image,
                            image_height=82, image_width=165, image_offset_y=3)
            _draw_signature(c, 595, 81, snapshot.get("ceo_name", ""), [snapshot.get("ceo_title", ""), snapshot.get("ceo_organization", "")], ceo_signature)
        else:
            _draw_signature(c, 255, 86, snapshot.get("qari_name", "Qari Berautoriti"), [qari_title or "Qari Berautoriti"], qari_signature_image)
            _draw_signature(c, 545, 86, snapshot.get("ceo_name", ""), [snapshot.get("ceo_title", ""), snapshot.get("ceo_organization", "")], ceo_signature)

    _draw_qr(c, snapshot.get("verification_url", "https://tarannum.ai"), certificate.certificate_type)
    c.setFont("Helvetica", 6.5)
    c.setFillColor(NAVY)
    c.drawCentredString(719 if is_attendance else (722 if is_azan else 743), 67 if is_attendance else (72 if is_azan else 49), "tarannum.ai" if is_attendance else certificate.certificate_number)
    c.showPage()
    if is_azan:
        _draw_transcript_page(c, db, certificate, snapshot, width, height)
        c.showPage()
    c.save()

    digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
    certificate.document_path = str(output_path)
    certificate.document_hash = digest
    return output_path
