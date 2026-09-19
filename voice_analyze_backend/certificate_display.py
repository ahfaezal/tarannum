"""Presentation-only labels for issued certificates.

Keep immutable issuance snapshots intact while allowing an approved printed
course title to be shown consistently in PDFs and certificate verification.
"""

from uuid import UUID


MUAZZIN_COURSE_ID = UUID("11c98b50-8b68-4a03-89aa-8a468c7fc275")
MUAZZIN_CERTIFICATE_TITLE = "KURSUS AZAN TARANNUM HIJJAZ"


def certificate_display_snapshot(certificate) -> dict:
    snapshot = dict(certificate.snapshot_json or {})
    if certificate.certificate_type == "attendance" and certificate.course_id == MUAZZIN_COURSE_ID:
        snapshot["course_title"] = MUAZZIN_CERTIFICATE_TITLE
    return snapshot
