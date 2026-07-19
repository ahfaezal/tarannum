# Qari Dashboard Product Specification

Version: 1.0  
Date: 2026-07-19  
Last Updated: 2026-07-19  
Status: Approved for implementation.

## Purpose

The Qari Dashboard is a coaching and content-management workspace. It must remain usable when a Qari manages hundreds of students and must prioritize actionable statistics over long data lists.

## Navigation

The Qari workspace contains:

1. Overview;
2. Students;
3. Coaching Insights;
4. Content Library;
5. Invite Students;
6. Live Training Leaderboard;
7. Royalty.

## Overview

The Overview displays only:

- Total Students;
- Active Students in the last seven days;
- Assessments in the last 30 days;
- cohort Average Score or Cohort Improvement;
- Performance Distribution infographic;
- 30-day Assessment Activity trend;
- Coaching Priorities;
- up to five students requiring attention.

Referral details, QR code, complete student lists, complete content lists and long weak-ayah lists do not belong on the Overview.

## Students

The Students page uses a compact, server-paginated table. The initial page size is 25.

Supported controls:

- search by name or email;
- Active, Inactive, Improving, Declining and No Assessment filters;
- sorting by activity, latest score and assessment count;
- paginated result count;
- explicit student-detail action.

Student details load by panel. Full pitch and analysis data are requested only when an individual recording is opened.

## Invite Students

Referral Code is not displayed as a separate dashboard panel. Invite Students consolidates:

- registration QR code;
- registration link;
- Copy Link;
- Download QR;
- registration and email-verification status where available.

The referral code may remain an internal identifier.

## Content Library Visibility

Every Qari content item has one visibility status:

- `draft` — being prepared and unavailable to students or the public;
- `students_only` — available only to students assigned to the Qari;
- `public_demo` — eligible for public Demo/Main Page use after Admin approval;
- `inactive` — unavailable to students and the public.

A Qari may request `public_demo`, but Admin approval is required before public publication. Approval confirms recording quality, metadata, voice-use permission and public suitability.

Student content selection must return only references allowed for that student. This protects learning focus and prevents the complete library from appearing by default.

## Live Training Leaderboard

Live Training Leaderboard is a motivational classroom display, not a separate assessment workflow, official competition or certification result.

Each live board defines:

- Qari owner;
- title;
- one selected reference;
- selected participating students;
- start and end time;
- active, scheduled, completed or cancelled status.

The Qari selects participating students before opening the board. Students continue using the normal Training and Recording & Assessment pages; no special student link, challenge recording or additional scoring request is required.

The leaderboard reads ordinary completed scoring results that match the selected students, reference and session window. Students may submit unlimited normal attempts while the board is active, and only each student's highest completed Experimental Score V2.3 is retained.

Tie resolution is internal and deterministic: the earlier achievement of the same highest score ranks first.

The fullscreen Qari display shows only:

- first place and score;
- second place and score;
- third place and score.

It does not display `Your Position` or `Next Target`. It displays a LIVE indicator, session time remaining, last refresh time and subtle gold, silver and bronze styling. Results refresh every 20 seconds through a compact endpoint and never run scoring again.

The score remains labelled experimental and must not be represented as a tajwid certification or official ranking outside the practice challenge.

## Royalty Earned

User-facing Qari terminology uses `Royalty Earned`, not `Commission Rate`.

The Royalty area distinguishes:

- Royalty Earned — confirmed payable amount;
- Estimated Royalty — optional unconfirmed amount;
- Royalty History — auditable period entries.

Existing internal database names may remain temporarily for compatibility, but API and user-interface migration must be explicit and versioned.

## Performance Requirements

- Overview renders its shell immediately.
- Optional panels load independently.
- Student and content lists use server-side pagination.
- No initial response includes complete pitch arrays or all recording analysis data.
- Live Training Leaderboard reads a compact result query and does not trigger scoring.
- A failed optional panel does not blank the Qari workspace.

## Protected Behaviour

This product change does not modify:

- Experimental Score V2.3 formula;
- asynchronous scoring;
- worker concurrency;
- R1/R2/R3 workflow;
- S3 staging cleanup.
