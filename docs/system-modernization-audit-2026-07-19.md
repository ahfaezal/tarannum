# Tarannum.ai System Modernization Audit

Version: 1.0  
Date: 2026-07-19  
Last Updated: 2026-07-19  
Status: Audit completed; Admin restoration and Forgot Password implementation completed locally.

## Scope

This audit covers four agreed priorities before the deferred 20-iPad validation:

1. restore the Admin Dashboard;
2. add Forgot Password;
3. improve the Student and Qari dashboards;
4. refine the Recording and Scoring presentation without changing Score V2.3.

## Finding 1 — Admin Dashboard

The Admin implementation has not been removed. Protected frontend routes still exist for users, presets, monitoring and Qari content management. Backend endpoints also exist for users, Qaris, statistics, sessions, usage metrics, system health, processing status and storage metrics.

The immediate visibility defect is in `AppLayout`: the authenticated navigation contains Student and Qari items but no Admin items. As a result, an Admin can have valid routes and permissions without a usable dashboard entry point.

### Required implementation

- Add an Admin navigation group visible only to the `admin` role.
- Provide `/admin` as a lightweight Admin overview route.
- Preserve backend and frontend role checks; hiding a menu is not an authorization control.
- Load overview cards independently so one slow monitoring endpoint does not block the entire page.
- Retain the existing detailed routes and progressively reorganize them under the Admin shell.

## Finding 2 — Forgot Password

The Login page has no Forgot Password action. The authentication service and backend authentication endpoints contain registration, email verification, OTP resend, login and password-change functions, but no unauthenticated password-recovery workflow.

Implementation update (2026-07-19): the protected OTP recovery flow, Login link, recovery screens and dedicated password-reset challenge fields have been implemented locally. Production deployment and end-to-end email validation remain pending.

### Required implementation

Use the agreed cross-device OTP workflow:

`Login → Forgot Password → Email → OTP verification → New password → Login`

Security requirements:

- return the same public response whether or not an email is registered;
- expire recovery OTPs;
- limit attempts and resend frequency;
- store only secure password hashes;
- invalidate the recovery challenge after successful reset;
- log recovery events without logging OTPs or passwords.

## Finding 3 — Qari Dashboard Performance

The initial Qari Dashboard waits for students, content and commission data before leaving the global loading state, then requests referral information separately. The backend `get_qari_students` implementation performs additional User and latest StudentProgress queries inside a loop for every relationship. This N+1 pattern will become increasingly slow as the number of students grows.

Opening a student also waits for details, activity and selected recordings as a single group before the detail experience becomes usable.

### Required implementation

- Replace per-student queries with joined or batched queries.
- Add pagination and an explicit page size to the student list.
- Create a lightweight Qari summary response for the first screen.
- Render the dashboard shell immediately and load panels independently.
- Load referral, commission and content panels after the essential student summary.
- Load student details only when selected and allow each detail panel to resolve independently.
- Verify indexes for active Qari relationships, student progress ordering and reference ownership.

## Finding 4 — Student Dashboard Performance

The Student Progress page requests progress, statistics, activity and selected recordings together. The backend progress formatter queries Reference and QariContent repeatedly for each progress row. This is another N+1 pattern and duplicates data work across dashboard endpoints.

### Required implementation

- Batch-load Reference and QariContent metadata for progress rows.
- Add a lightweight student dashboard summary endpoint or consolidate duplicated aggregates.
- Render summary, history, activity and selected recordings as independent panels.
- Keep the initial history limited and paginate older records.
- Do not download recording audio until the user requests playback.

## Finding 5 — Recording and Scoring Presentation

Recording and Scoring are already separated from Training, and heavy result components are lazy-loaded. The production recording-to-scoring pipeline has passed the 10-iPad validation and must remain stable.

### Protected behaviour

- fullscreen recording;
- countdown and beep;
- muted Qari reference graph;
- ayah markers and Quran text;
- recording auto-stop;
- R1 automatic submission without Retake;
- R2/R3 review and Retake;
- asynchronous processing status;
- Experimental Score V2.3 and its assessment infographic.

### Permitted refinement

- simplify the recording setup hierarchy;
- improve iPad spacing and responsive layout;
- make queue and processing states clearer;
- add a clear next action after scoring;
- improve navigation between Recording, Training and Progress;
- ensure English is the default while preserving the language selector.

No scoring formula, worker concurrency or persistence change is included in this presentation phase.

## Approved Implementation Order

1. Restore the Admin navigation and lightweight Admin overview.
2. Implement the complete Forgot Password OTP workflow.
3. Remove Qari dashboard N+1 queries and introduce progressive loading.
4. Remove Student dashboard N+1 queries and introduce progressive loading.
5. Refine Recording and Scoring presentation only.
6. Run role-based QA, regression QA and a smaller multi-iPad production test.
7. Resume the 20-iPad validation when participant accounts are ready.

## Release Protection

The following production baseline remains frozen during this work:

- Experimental Score V2.3;
- asynchronous scoring;
- one scoring-worker replica with concurrency two;
- S3 staging cleanup and lifecycle fallback.
