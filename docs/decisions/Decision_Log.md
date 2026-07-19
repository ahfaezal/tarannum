# Tarannum.ai Decision Log

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-07-19

## Purpose

This log records approved architecture decisions for Tarannum.ai.

Each decision should be treated as part of the project's Single Source of Truth until superseded by a later approved decision.

## Decision 001

Title: Reference Audio is the Single Source of Truth.

Status: Approved.

Date: 2026-06-26

Reference Audio is the authoritative source for Practice Live timing and rendering behaviour.

## Decision 002

Title: Practice Live uses Reference Timeline.

Status: Approved.

Date: 2026-06-26

Practice Live uses the Reference Timeline as the official time axis for the training session.

## Decision 003

Title: Reference Playhead remains centered after entering the Follow Zone.

Status: Approved.

Date: 2026-06-26

After entering the Follow Zone, the Reference Playhead remains visually centered in the graph and the graph moves beneath it.

## Decision 004

Title: Student Pitch Overlay is plotted using Reference Timeline during Practice Live.

Status: Approved.

Date: 2026-06-26

Student Pitch Overlay does not define its own timeline during Practice Live. It is plotted against the Reference Timeline.

## Decision 005

Title: Practice Live and Recording Analysis are separate rendering modes.

Status: Approved.

Date: 2026-06-26

Practice Live and Recording Analysis may share visual components, but they are distinct rendering modes with different purposes and timing rules.

## Decision 006

Title: Initial qari royalty uses active qari billing cycle assignment.

Status: Approved.

Date: 2026-06-29

The initial subscription royalty model is assignment-based, not usage-based. Royalty follows the student's active qari for the billing cycle. Students may explore the shared qari recitation bank without changing qari assignment or royalty allocation. Detailed policy is defined in `docs/product/Subscription_Royalty_Model_v1.md`.

## Decision 007

Title: Student qari transfer requires a 30-day lock period.

Status: Approved.

Date: 2026-06-29

A student must remain with the current assigned qari for at least 30 days before transferring to another qari. Transfer after the lock period does not require approval from the original qari, but the system must record transfer history and update qari dashboard visibility.

## Decision 008

Title: Each active qari contributes to the shared recitation bank.

Status: Approved.

Date: 2026-06-29

Each active qari must contribute at least one approved recitation to the shared Tarannum.ai recitation bank. This allows all registered students to explore different qari voices without changing their active qari assignment.

## Decision 009

Title: Student trial ends after 7 days or 3 recording sessions.

Status: Approved.

Date: 2026-06-29

Student onboarding uses the flow: register, verify email, confirm or choose qari, trial, subscription, 30-day qari lock, and royalty ledger. The trial ends when either 7 calendar days pass or 3 recording sessions are used, whichever happens first. Royalty begins only after successful subscription payment.

## Decision 010

Title: Course or cohort payment may activate student subscription entitlement.

Status: Approved.

Date: 2026-06-29

Tarannum.ai must support organizer-paid or course-paid subscription entitlement. If a course fee includes the Tarannum.ai subscription component, students should not be required to pay again during registration. Payment source, access entitlement, qari assignment, and royalty ledger must be recorded separately. Royalty is calculated from the Tarannum.ai subscription component, not the full course fee.

## Decision 011

Title: Assessment Score uses a tarannum-aware scoring model.

Status: Approved.

Date: 2026-07-02

Assessment Score is used for Recording Mode, not Practice Mode. The scoring model should reward visible improvement in pitch contour and ayah-segment timing while still protecting against silent, weak, or wrong recordings. The July 2026 adjustment reduces over-reliance on MFCC and other device-sensitive audio features, increases the effect of pitch contour and segment consistency, and updates frontend score labels to avoid implying a full tajwid or Quran correctness judgment. Detailed original and updated scoring specifications are defined in `docs/architecture/Assessment_Score_Specification_v1.md`.

## Decision 012

Title: Production scoring uses an asynchronous queue with controlled worker concurrency.

Status: Approved.

Date: 2026-07-19

Production scoring runs asynchronously so recording submissions remain responsive while CPU-intensive analysis is processed separately. The validated pilot baseline is one scoring-worker replica with concurrency two. A 10-iPad concurrent production test completed 10/10 jobs without retries or worker failures, with per-job processing times between 24.0 and 29.3 seconds.

This configuration remains frozen until the planned 20-iPad validation or until evidence from production identifies a defect. Increasing CPU, replica count or worker concurrency must be supported by a controlled load test and must not weaken job integrity, observability or S3 cleanup.

## Decision 013

Title: Temporary scoring uploads are deleted after terminal processing.

Status: Approved.

Date: 2026-07-19

Audio uploaded under the S3 `scoring-jobs/` staging prefix is temporary processing data. The scoring worker deletes each staging object after the job reaches a terminal state. The S3 lifecycle rule remains a fallback for abandoned objects, and the worker IAM policy is restricted to the required staging-object operations. Permanent participant audio and score artifacts are not governed by this staging cleanup decision.
