# Tarannum Kids API contract

## Daily access decision

`GET /api/platform/kids/daily-access`

Authenticated response:

```json
{
  "localDate": "2026-09-24",
  "creditedSeconds": 2140,
  "requiredSeconds": 3600,
  "unlockGranted": false,
  "unlockExpiresAt": null
}
```

At 3,600 credited seconds before 23:30 Asia/Kuala_Lumpur, `unlockGranted` becomes true and `unlockExpiresAt` is the current local date at 23:30 with `+08:00` offset.

## Server rules

1. Calculate the current date and 06:00–23:30 access window in `Asia/Kuala_Lumpur`.
2. Count only verified `practice_stopped` events belonging to the authenticated student and current local day.
3. Reuse duration caps in `student_activity_analytics_service.sum_practice_seconds`.
4. Never accept credited seconds or an unlock flag from the iPad.
5. Deny by default outside the access window, on authentication failure, or when data cannot be verified.
6. Return `Cache-Control: no-store` and audit every locked-to-unlocked decision.

## Follow-up endpoints

- `POST /api/platform/kids/devices/register` binds an installation key to the child profile.
- `GET /api/platform/kids/assignments/today` returns parent-assigned practice items.
- `POST /api/platform/kids/device-heartbeat` reports app health without transmitting Screen Time usage data.

Family Controls usage data must remain on the device and may only support the parental-control feature.

## Admin learning-package foundation

The Admin package API is the source of truth for the locked Tarannum Kids
Agentic Learning Architecture v1. A package represents either one page from
an IQRA book or one complete surah. Published package versions are immutable;
an administrator must create a new draft version to revise content or rules.

All endpoints below require an authenticated administrator:

- `GET /api/admin/kids/packages` lists every version. Use `?status=draft`,
  `published`, or `archived` to filter the result.
- `GET /api/admin/kids/packages/{package_id}` returns one package, its ordered
  learning units, and its configured transitions.
- `POST /api/admin/kids/packages` creates version 1 as a draft.
- `PUT /api/admin/kids/packages/{package_id}` edits a draft only.
- `POST /api/admin/kids/packages/{package_id}/versions` clones an existing
  version into the next draft version.
- `PUT /api/admin/kids/packages/{package_id}/transitions` replaces the draft's
  controlled agent transitions.
- `POST /api/admin/kids/packages/{package_id}/publish` publishes the draft and
  archives the previously published version with the same `package_key`.
- `POST /api/admin/kids/packages/{package_id}/archive` archives a version.

### Package definition

```json
{
  "package_key": "iqra-3-page-18",
  "title": "IQRA 3 - Muka Surat 18",
  "package_type": "page",
  "level": "IQRA 3",
  "source_metadata": {
    "book_title": "IQRA 3",
    "page_number": 18
  },
  "assessment_engines": ["azure_speech", "fastconformer"],
  "completion_rules": {
    "required_unit_pass_rate": 1.0,
    "minimum_valid_attempts_per_unit": 1,
    "require_in_sequence": true
  },
  "allowed_agent_actions": [
    "advance",
    "retain",
    "remedial",
    "foundation",
    "human_review",
    "notify_parent",
    "notify_teacher"
  ],
  "units": [
    {
      "unit_key": "line-1",
      "sequence": 1,
      "title": "Baris 1",
      "instruction": "Baca semua perkataan secara bersambung.",
      "activity_type": "iqra_reading",
      "reference_text": "...",
      "required": true,
      "assessment_config": {}
    }
  ]
}
```

For a `page` package, `source_metadata.book_title` and a positive
`source_metadata.page_number` are mandatory. A `surah` package requires
`source_metadata.surah_name`.

Supported unit activities are `iqra_reading`, `tarannum_listen`,
`tarannum_practice`, and `tarannum_record`. Supported assessment engines are
`azure_speech`, `fastconformer`, and `tarannum`.

### Controlled agent transitions

A draft may define `advance`, `remedial`, and `foundation` transitions to
another package. `retain` is an allowed agent decision that keeps the learner
in the current package, so it does not require a self-transition record.

```json
[
  {
    "to_package_id": "00000000-0000-0000-0000-000000000000",
    "outcome": "advance",
    "priority": 10,
    "conditions": {
      "minimum_completed_packages": 1,
      "minimum_mastery_score": 80
    },
    "requires_human_approval": false,
    "is_active": true
  }
]
```

### Central-student package assignment

The Admin assignment workspace uses the existing Tarannum.ai student account;
it never creates a second Kids identity.

- `GET /api/admin/kids/students` lists active central student accounts and
  supports a `search` query.
- `GET /api/admin/kids/assignments` lists assignments and their latest package
  run. It supports optional `student_id` and `status` filters.
- `POST /api/admin/kids/assignments` assigns one published package to one
  active student. A second active assignment for the same student and package
  is rejected.

```json
{
  "student_id": "00000000-0000-0000-0000-000000000000",
  "package_id": "00000000-0000-0000-0000-000000000000",
  "reason": "Pakej permulaan IQRA 3"
}
```

### Student package execution

The iPad uses the central Tarannum student token. It cannot submit arbitrary
scores or declare a package complete. A unit result must reference an existing
server-owned IQRA attempt or completed Tarannum scoring job belonging to the
same student.

- `GET /api/kids/learning/assignments/active` returns active assignments,
  ordered units and any resumable run.
- `POST /api/kids/learning/assignments/{assignment_id}/runs` creates or resumes
  the single in-progress run for that assignment.
- `PUT /api/kids/learning/runs/{run_id}/units/{unit_id}` links verified evidence
  to a unit and derives its pass state, scores, engine result and credited time
  from the source record.
- `POST /api/kids/learning/runs/{run_id}/complete` evaluates the Admin-authored
  rules on the server. It only closes the assignment when every required gate
  is satisfied.

For IQRA evidence:

```json
{
  "evidence": {
    "evidence_type": "iqra_attempt",
    "evidence_id": "00000000-0000-0000-0000-000000000000"
  },
  "client_activity_seconds": 15
}
```

The completion snapshot includes required, attempted and passed counts,
missing or failed unit keys, actual pass rate, and `eligible_for_agent`. Agent
execution must only accept a completed run whose immutable evaluation has
`eligible_for_agent: true`.

This phase activates Admin-managed assignment, iPad run execution and the
server completion gate. Bounded agent decisions, parent/teacher reports, and
the OpenAI explanation layer remain separate later phases. Existing IQRA
scoring, Azure Speech, FastConformer, and Tarannum assessment behaviour remain
unchanged.

### Closed-staging seed

`voice_analyze_backend/seed_kids_staging_package.py` creates one idempotent
IQRA 3 demonstration package for end-to-end Admin testing. The script refuses
to run unless `RAILWAY_ENVIRONMENT_NAME` or `ENVIRONMENT` is exactly
`staging`. It must never be used to populate production content; final content
must be reviewed and published through the Admin workspace.
