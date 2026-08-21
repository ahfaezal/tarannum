# Tarannum.ai Official Certification System v1

## Locked certificate types

1. `competency_tarannum` — competency in a Surah/Tarannum pair, approved by the owner Qari and signed by the Qari plus CEO.
2. `competency_azan` — competency in an Azan/Tarannum pair, approved by the owner Qari and signed by the Qari plus CEO.
3. `attendance` — attendance and participation in an organized course, issued after verified attendance and 60 minutes of valid recording practice; signed by the CEO only.

## Attendance eligibility

The organizer verifies attendance. Neither the organizer nor Qari configures a recording count.

```text
required_recording_count = ceil(3600 / canonical_reference_duration_seconds)
```

A recording is credited when it belongs to the course reference, was created from the course start through its completion deadline, has audio storage, is at least 80% of the canonical reference duration, and is not a duplicate checksum.

The attendance certificate is issued automatically when:

```text
attendance_status == attended
AND valid_recording_count >= required_recording_count
```

## Competency eligibility

An AI score of at least 75 permits submission to the owner Qari. It does not issue a certificate automatically.

| AI score | Suggested grade |
|---:|---|
| 85–100 | Mumtaz |
| 80–84.99 | Jayyid Jiddan |
| 75–79.99 | Jayyid |

The Qari listens to the recording and chooses the final grade or rejects/requests resubmission. Approval requires an active uploaded Qari signature. The approved recording and its progress data are then marked immutable.

## Certificate integrity

- Prefixes: `TRN`, `AZN`, and `KHD`.
- Each certificate has a random verification token and public `/verify/:token` page.
- Issuance snapshots the participant, course/reference, grade, Qari, CEO, date, and verification URL.
- Lifecycle events and audit records are append-only.
- Revoked or replaced certificates retain their record and verification status.
- PDF output is deterministic and includes a working QR code and SHA-256 document hash.

## Configuration

```text
CERTIFICATE_CEO_NAME
CERTIFICATE_CEO_TITLE
CERTIFICATE_CEO_ORGANIZATION
CERTIFICATE_CEO_SIGNATURE_PATH
CERTIFICATE_LOGO_PATH
CERTIFICATE_OUTPUT_DIR
CERTIFICATE_SIGNATURE_DIR
CERTIFICATE_VERIFY_BASE_URL
CERTIFICATE_SAMPLE_MODE
```

Production must provide the official CEO signature asset through `CERTIFICATE_CEO_SIGNATURE_PATH`. Qari signatures are uploaded through the protected Qari certification workspace.

## Deployment

Install backend requirements and run:

```text
python migrations/add_official_certification_system.py
```

The migration is additive and idempotent. It creates only the new certification tables.
