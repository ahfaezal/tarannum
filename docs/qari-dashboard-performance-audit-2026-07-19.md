# Qari Dashboard Performance Audit

Version: 1.0  
Date: 2026-07-19  
Last Updated: 2026-07-19  
Status: Static code audit completed; production timing benchmark pending.

## Executive Summary

The Qari Dashboard is slow because the first screen requests more data than it needs and the backend performs database work that grows linearly with every student, progress record and recording session.

The main problem is not the Railway plan. It is the current request and query shape.

## Initial Page Load

The frontend starts these requests together:

1. Qari students;
2. Qari content;
3. commission statistics.

Only after those requests finish does it request referral information. A single global `loading` state prevents the dashboard shell from rendering until the essential and non-essential requests finish.

### Estimated database query growth

The students endpoint currently performs:

- one query for active Qari/student relationships;
- one User query per student;
- one latest-progress query per student;
- one all-progress statistics query per student.

This produces approximately `1 + (3 × N)` queries for `N` students before adding content, commission and referral work.

The content request is batch-oriented but loads every owned Reference and all related text segments, even though the initial dashboard shows only six content cards.

Commission statistics repeat active-student aggregation that overlaps with the students response. Referral information then introduces another serial network round trip.

## Student Detail Load

Opening one student triggers three requests:

1. full student details;
2. activity summary;
3. selected recordings.

The full-details endpoint performs several N+1 patterns:

- progress formatting can query Reference and QariContent for every progress row;
- every recording session can query AnalysisResult, Reference and StudentProgress separately;
- statistics query all progress records again after progress has already been loaded.

Approximate additional query growth is up to `2 × P + 3 × S`, where `P` is the number of progress records and `S` is the number of recording sessions, before fixed authorization and summary queries are counted.

The endpoint also includes full analysis structures such as pitch data, segments, regions, ayah timing and feedback for every session. The dashboard history list does not need most of this data, so response serialization and transfer size can become significant.

## Frontend Findings

- `QariDashboard.tsx` is approximately 1,633 lines and its production chunk is about 50 kB before gzip.
- A single global loading state blocks the whole initial experience.
- Initial failure of students or content causes the whole dashboard to fail.
- “Show More” limits rendering only; all records have already been fetched.
- Student details use one grouped loading state, so fast panels wait for the slowest request.
- Referral QR generation depends on an external QR service and should not be part of critical dashboard readiness.

## Database Index Findings

Single-column indexes exist for several foreign keys, but the frequent query shapes need composite indexes:

- active relationships by `(qari_id, is_active)`;
- latest student progress by `(student_id, created_at DESC)`;
- recording history by `(user_id, created_at DESC)`;
- analysis lookup by session identifier where not already uniquely covered.

Indexes must be verified against the production PostgreSQL query plan before and after migration.

## Severity and Priority

### P0 — Initial student query fan-out

Replace the per-student User, latest-progress and statistics queries with joined/batched queries. This is the largest predictable source of degradation as a Qari gains students.

### P0 — Student detail payload and query fan-out

Return a paginated summary list without full pitch and analysis data. Load detailed analysis only when a specific recording is opened.

### P1 — Progressive dashboard loading

Render the shell and essential student summary first. Give students, content, commission and referral independent loading and error states.

### P1 — Pagination

Implement server-side pagination for students, content, progress and recording history. Frontend slicing is not a performance control.

### P1 — Consolidated summary

Provide one lightweight Qari summary containing counts and referral identity. Avoid repeating active-student calculations across endpoints.

### P2 — Component decomposition

Split the dashboard into independently loaded Student Summary, Student List, Content, Referral, Commission and Student Detail modules.

### P2 — Caching

After query correction, cache non-critical aggregates briefly. Caching must not be used to hide N+1 queries.

## Recommended Target Architecture

Initial page:

1. render the Qari dashboard shell immediately;
2. request `/qari/dashboard-summary`;
3. request the first paginated student page;
4. lazy-load content, commission and referral panels.

Student selection:

1. show the student identity and summary;
2. request paginated recording summaries;
3. request progress and activity independently;
4. request full analysis only when a recording is opened.

## Acceptance Criteria

- Dashboard shell appears without waiting for all data panels.
- Initial student endpoint query count is effectively constant per page, not proportional to every returned student.
- Initial dashboard does not transfer full pitch arrays or recording analysis payloads.
- A failed optional panel does not blank the whole dashboard.
- Students, content and histories use server-side pagination.
- Production p50 and p95 API timings are captured before and after optimization.
- Authorization remains enforced by the backend for every Qari/student request.

## Protected Scope

This optimization must not change:

- Experimental Score V2.3;
- recording and scoring worker behaviour;
- R1/R2/R3 workflow;
- S3 retention and staging cleanup.

