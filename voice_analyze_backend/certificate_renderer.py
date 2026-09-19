"""Deterministic PDF renderer for the three locked Tarannum.ai certificates."""
from __future__ import annotations

import hashlib
import io
import math
import os
from datetime import datetime
from pathlib import Path

import qrcode
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from database import Certificate, QariSignature, CEOSignature


EMERALD = HexColor("#07543D")
GOLD = HexColor("#C9982E")
CREAM = HexColor("#FFFDF5")
NAVY = HexColor("#132A45")
RED = HexColor("#B91C1C")
PALE = HexColor("#E7E2D4")


def _fit_font(text: str, font: str, maximum: float, max_width: float, minimum: float = 12) -> float:
    size = maximum
    while size > minimum and stringWidth(text, font, size) > max_width:
        size -= 0.5
    return size


def _centered(c: canvas.Canvas, text: str, y: float, font: str, size: float, color=EMERALD):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(landscape(A4)[0] / 2, y, text)


def _draw_border(c: canvas.Canvas, certificate_type: str):
    width, height = landscape(A4)
    if certificate_type == "attendance":
        _draw_attendance_frame(c, width, height)
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


def _draw_rosette(c: canvas.Canvas, x: float, y: float, radius: float):
    """Eight-point gold ornament used by the attendance template."""
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    for offset in (0, math.pi / 8):
        points = [
            (x + radius * math.cos(offset + index * math.pi / 4),
             y + radius * math.sin(offset + index * math.pi / 4))
            for index in range(8)
        ]
        path = c.beginPath()
        path.moveTo(*points[0])
        for point in points[1:]:
            path.lineTo(*point)
        path.close()
        c.drawPath(path)
    c.circle(x, y, radius * 0.24, fill=0, stroke=1)


def _draw_attendance_frame(c: canvas.Canvas, width: float, height: float):
    """Vector recreation of the approved green-and-gold attendance design."""
    c.setFillColor(EMERALD)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setStrokeColor(Color(0.79, 0.60, 0.25, alpha=0.50))
    c.setLineWidth(0.4)
    # The geometric lattice stays visible only in the dark outer frame.
    for x in range(-12, int(width) + 20, 18):
        for y in range(-12, int(height) + 20, 18):
            c.line(x, y + 9, x + 9, y + 18)
            c.line(x + 9, y + 18, x + 18, y + 9)
            c.line(x + 18, y + 9, x + 9, y)
            c.line(x + 9, y, x, y + 9)

    c.setFillColor(CREAM)
    c.setStrokeColor(GOLD)
    c.setLineWidth(2.2)
    c.roundRect(21, 18, width - 42, height - 36, 47, fill=1, stroke=1)
    c.setLineWidth(0.8)
    c.roundRect(26, 23, width - 52, height - 46, 43, fill=0, stroke=1)
    c.roundRect(31, 28, width - 62, height - 56, 39, fill=0, stroke=1)
    c.setStrokeColor(EMERALD)
    c.setLineWidth(1.4)
    c.rect(9, 9, width - 18, height - 18, fill=0, stroke=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.rect(13, 13, width - 26, height - 26, fill=0, stroke=1)

    for x in (47, width - 47):
        for y in (47, height - 47):
            _draw_rosette(c, x, y, 19)
    for x, y in ((width / 2, height - 21), (width / 2, 21), (22, height / 2), (width - 22, height / 2)):
        _draw_rosette(c, x, y, 8)


def _course_date_label(value: str) -> str:
    months = ("Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember")
    try:
        course_date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return value[:10] if value else ""
    return f"{course_date.day} {months[course_date.month - 1]} {course_date.year}"


def _draw_attendance_body(c: canvas.Canvas, certificate: Certificate, snapshot: dict, width: float, height: float):
    _centered(c, "SIJIL KEHADIRAN & PENYERTAAN", height - 184, "Times-Bold", 28, EMERALD)
    _centered(c, "Dengan ini diperakui bahawa", height - 218, "Times-Roman", 13, NAVY)
    student_name = (snapshot.get("student_name") or "").upper()
    _centered(c, student_name, height - 250, "Times-Bold", _fit_font(student_name, "Times-Bold", 25, width - 135, 14), EMERALD)
    _centered(c, "telah menghadiri", height - 278, "Times-Roman", 12.5, NAVY)

    c.setFillColor(CREAM)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.1)
    c.roundRect(135, height - 347, width - 270, 48, 17, fill=1, stroke=1)
    c.setLineWidth(0.45)
    c.roundRect(139, height - 343, width - 278, 40, 14, fill=0, stroke=1)
    _draw_rosette(c, 135, height - 323, 10)
    _draw_rosette(c, width - 135, height - 323, 10)
    course_title = (snapshot.get("course_title") or snapshot.get("reference_title") or "").upper()
    _centered(c, course_title, height - 330, "Times-Bold", _fit_font(course_title, "Times-Bold", 16, width - 305, 10), EMERALD)
    practice_minutes = snapshot.get("practice_minutes") or 60
    _centered(c, f"dan berjaya menyempurnakan {practice_minutes} minit latihan rakaman", height - 378, "Helvetica", 11, NAVY)

    left = 105
    c.setFillColor(NAVY)
    c.setFont("Helvetica", 9)
    duration_minutes = snapshot.get("course_duration_minutes") or 360
    duration_hours = round(duration_minutes / 60)
    footer_items = (
        f"Tarikh Kursus: {_course_date_label(snapshot.get('course_date') or '')}",
        f"Tempoh Kursus: 1 Hari - {duration_hours} Jam",
        f"No. Sijil: {certificate.certificate_number}",
    )
    for index, item in enumerate(footer_items):
        y = 127 - index * 23
        _draw_rosette(c, left - 13, y + 3, 5)
        c.drawString(left, y, item)


def _draw_logo(c: canvas.Canvas):
    backend_dir = Path(__file__).resolve().parent
    default_logo = backend_dir.parent / "voice_analyze_frontend" / "public" / "images" / "logo.png"
    logo_path = Path(os.getenv("CERTIFICATE_LOGO_PATH", str(default_logo)))
    width, height = landscape(A4)
    if logo_path.exists():
        c.drawImage(str(logo_path), width / 2 - 30, height - 82, 60, 60, preserveAspectRatio=True, mask="auto")
    _centered(c, "tarannum.ai", height - 102, "Helvetica-Bold", 15, EMERALD)


def _draw_qr(c: canvas.Canvas, url: str):
    qr = qrcode.QRCode(version=None, box_size=5, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    stream.seek(0)
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(stream), 704, 58, 78, 78, preserveAspectRatio=True, mask="auto")


def _draw_signature(c: canvas.Canvas, x: float, y: float, name: str, title_lines: list[str], image_path=None):
    if isinstance(image_path, ImageReader):
        c.drawImage(image_path, x - 65, y + 12, 130, 45, preserveAspectRatio=True, mask='auto')
    elif image_path and Path(image_path).exists():
        c.drawImage(str(image_path), x - 65, y + 12, 130, 45, preserveAspectRatio=True, mask="auto")
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


def render_certificate_pdf(db, certificate: Certificate) -> Path:
    """Render and persist a certificate PDF, then store its SHA-256 hash."""
    output_dir = Path(os.getenv("CERTIFICATE_OUTPUT_DIR", "data/private/certificates")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{certificate.certificate_number}.pdf"
    snapshot = certificate.snapshot_json or {}
    c = canvas.Canvas(str(output_path), pagesize=landscape(A4), pageCompression=1)
    width, height = landscape(A4)
    c.setTitle(certificate.certificate_number)
    c.setAuthor("Tarannum Technologies")
    _draw_border(c, certificate.certificate_type)
    _draw_logo(c)

    c.saveState()
    c.translate(width / 2, height / 2)
    c.rotate(25)
    c.setFillColor(PALE)
    c.setFont("Helvetica-Bold", 62)
    c.drawCentredString(0, -15, "CONTOH - SAH" if os.getenv("CERTIFICATE_SAMPLE_MODE") == "true" else "TARANNUM.AI")
    c.restoreState()

    is_attendance = certificate.certificate_type == "attendance"
    title = (
        "SIJIL KOMPETENSI AZAN" if certificate.certificate_type == "competency_azan" else "SIJIL KOMPETENSI TARANNUM"
    )
    if is_attendance:
        _draw_attendance_body(c, certificate, snapshot, width, height)
    else:
        _centered(c, title, height - 150, "Times-Bold", _fit_font(title, "Times-Bold", 29, width - 130), EMERALD)
        _centered(c, "Dengan ini diperakui bahawa", height - 181, "Times-Roman", 13, NAVY)
        student_name = (snapshot.get("student_name") or "").upper()
        _centered(c, student_name, height - 220, "Times-Bold", _fit_font(student_name, "Times-Bold", 27, width - 150), EMERALD)
        _centered(c, "telah menunjukkan kompetensi dalam", height - 250, "Times-Roman", 13, NAVY)
        competency = " • ".join(filter(None, [snapshot.get("reference_title"), snapshot.get("maqam")])).upper()
        _centered(c, competency, height - 283, "Times-Bold", _fit_font(competency, "Times-Bold", 19, width - 170), EMERALD)
        grade = (snapshot.get("final_grade") or "").upper()
        c.setFillColor(EMERALD)
        c.roundRect(width / 2 - 110, height - 327, 220, 31, 8, fill=1, stroke=0)
        _centered(c, f"TAHAP: {grade}", height - 317, "Times-Bold", 16, GOLD)
        _centered(c, "Disahkan oleh Qari Berautoriti", height - 346, "Times-Roman", 10.5, NAVY)

    if not is_attendance:
        c.setFillColor(NAVY)
        c.setFont("Helvetica", 8)
        c.drawString(52, 82, f"No. Sijil: {certificate.certificate_number}")
        c.drawString(52, 69, f"Tarikh Dikeluarkan: {certificate.issued_at.strftime('%d/%m/%Y')}")

    ceo_signature = os.getenv("CERTIFICATE_CEO_SIGNATURE_PATH")
    uploaded_ceo_signature = db.get(CEOSignature, 1)
    if uploaded_ceo_signature:
        ceo_signature = ImageReader(io.BytesIO(uploaded_ceo_signature.image_data))
    if is_attendance:
        _draw_signature(c, width / 2, 86, snapshot.get("ceo_name", ""), [snapshot.get("ceo_title", ""), snapshot.get("ceo_organization", "")], ceo_signature)
    else:
        qari_signature = db.query(QariSignature).filter(QariSignature.qari_id == certificate.qari_id, QariSignature.is_active.is_(True)).first()
        qari_signature_image = None
        if qari_signature:
            if qari_signature.image_data:
                qari_signature_image = ImageReader(io.BytesIO(qari_signature.image_data))
            elif qari_signature.storage_path and Path(qari_signature.storage_path).exists():
                qari_signature_image = qari_signature.storage_path
        qari_title = snapshot.get("qari_title") or (qari_signature.signer_title if qari_signature else None)
        _draw_signature(c, 255, 86, snapshot.get("qari_name", "Qari Berautoriti"), [qari_title or "Qari Berautoriti"], qari_signature_image)
        _draw_signature(c, 545, 86, snapshot.get("ceo_name", ""), [snapshot.get("ceo_title", ""), snapshot.get("ceo_organization", "")], ceo_signature)

    _draw_qr(c, snapshot.get("verification_url", "https://tarannum.ai"))
    c.setFont("Helvetica", 6.5)
    c.setFillColor(NAVY)
    c.drawCentredString(743, 49, certificate.certificate_number)
    c.showPage()
    c.save()

    digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
    certificate.document_path = str(output_path)
    certificate.document_hash = digest
    return output_path
