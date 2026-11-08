# Tarannum Kids Agentic Learning Architecture

Version: 1.1
Date: 2026-11-07
Last Updated: 2026-11-08
Status: Locked

## Purpose

This document is the official architecture reference for the Tarannum Kids agentic learning system. It defines how learning packages are prepared, assessed, completed and acted upon by the learning agent.

This architecture is isolated to Tarannum Kids. It does not authorize changes to the Tarannum.ai production experience, scoring formula or production data flow.

## Central Identity And Data Contract

Tarannum.ai is the system of record for account registration, authentication and the central student identity. Tarannum Kids, IQRA, Tarannum practice and the learning agent use the same immutable `users.id` for a student.

Production learning records are stored in the approved central AWS database. The products share identity and authorised student history, but their data remains logically separated through product-specific tables, backend APIs, feature flags and role-based access controls.

- the iPad application must never connect directly to the database;
- all student reads and writes pass through authenticated backend APIs;
- IQRA attempts, package execution, agent decisions and human overrides reference the central student identifier;
- Tarannum Kids must not rewrite Tarannum assessment evidence or account records;
- agent output is advisory and auditable, and never replaces original assessment evidence;
- staging uses an isolated database and must not contain or mutate production student records.

## Core Principle

> Admin defines the curriculum, package content, assessment standard and permitted actions. Assessment engines produce evidence. The learning agent analyses the completed package evidence and manages the next learning action within the approved boundaries.

## Learning Package Definition

A learning package is the smallest complete learning scope that the agent may evaluate before deciding the student's next action.

Tarannum Kids supports two official package forms.

### Page Package

- One page of an approved IQRA or learning book equals one package.
- The package contains all letters, words, phrases or exercises assigned to that page.
- A package is not complete until its required learning units and valid attempts satisfy the Admin-defined completion rules.

### Surah Package

- One complete surah equals one package.
- The package may contain Quran reading assessment, Tarannum practice, Tarannum recording assessment, or an Admin-approved combination.
- Ayah-level results remain available as evidence, but the agent makes the package-level decision only after the complete required surah scope has been attempted.

## Admin Authority

Admin is the curriculum authority and package publisher. For each package, Admin controls:

- package name, level and type;
- source book, page or surah;
- learning units and their sequence;
- required reference audio or learning guide;
- assessment engines to be used;
- minimum completion and pass requirements;
- minimum valid attempt count;
- whether units must be completed in order;
- package completion conditions;
- packages that may be opened next;
- permitted remedial packages;
- permitted agent actions;
- whether parent or teacher approval is required for a transition.

The agent must not create or alter authoritative curriculum content, lower a pass requirement, or open content outside the package graph approved by Admin.

## Assessment Evidence

Assessment is separate from the agent's decision-making role.

The approved evidence sources are:

- Azure Speech for pronunciation-related and fluency evidence;
- FastConformer for connected-recitation content and completeness evidence;
- Tarannum scoring for pitch contour, timing and melodic-pattern evidence;
- valid attempt history, practice duration and repeated-error patterns;
- package completion status and unit-level outcomes.

Raw engine results must be retained as auditable evidence. The agent may interpret this evidence but must not rewrite raw scores or fabricate missing evidence.

## Package Completion Gate

The agent may perform its full package review only when the system confirms that:

1. all mandatory units in the package have been attempted;
2. the attempts meet validity requirements;
3. the minimum required evidence exists;
4. the package completion rule defined by Admin has been evaluated.

Time spent merely viewing a screen or leaving a microphone open does not count as valid learning activity.

## Agent Operating Cycle

The official agent cycle is:

1. The student completes a Page Package or Surah Package.
2. The system gathers assessment evidence and historical learning context.
3. The agent evaluates mastery, recurring weaknesses, consistency and evidence confidence.
4. The agent creates a bounded next-learning plan.
5. The agent performs an action permitted by Admin.
6. The system records the decision, reason, evidence and outcome.
7. The next completed package is evaluated again.

## Permitted Agent Outcomes

Subject to Admin configuration, the agent may:

- advance the student to an approved next package;
- keep the student in the current package;
- assign an approved remedial package;
- assign targeted repetition of approved content;
- recommend returning to a specific foundation package, including IQRA 1 where justified;
- notify a parent or teacher of progress or persistent difficulty;
- escalate an uncertain or conflicting result for human review.

## Confidence And Human Oversight

The agent must not make a high-impact progression or regression decision when evidence confidence is low.

Low-confidence conditions include:

- disagreement between assessment engines;
- incomplete or corrupted audio;
- unstable microphone or environmental noise;
- too few valid attempts;
- unusually inconsistent results;
- a recommendation outside the Admin-approved pathway.

In these cases, the agent must request another valid attempt or escalate to a teacher or parent. Parent and teacher views must show the recommendation, supporting evidence and decision history.

## Remediation Before Major Regression

The agent should normally assign focused remediation before returning a student to a substantially earlier level. A return to IQRA 1 or another foundation stage should require repeated evidence across the thresholds set by Admin, unless a teacher explicitly intervenes.

## Auditability

Every package-level agent action must record:

- student and package identifiers;
- package version;
- completion timestamp;
- assessment-engine results used;
- evidence-confidence status;
- detected strengths and weaknesses;
- selected action;
- explanation for the action;
- applicable Admin rules;
- whether human review was required;
- subsequent learning outcome when available.

This history is the official basis for parent, teacher and Admin reporting.

## Execution And Decision Records

The package lifecycle is persisted as separate, auditable records:

- a package assignment identifies the student, package version, source and reason;
- a package run defines one bounded execution of that assignment;
- unit results retain score summaries and references to raw evidence without copying or rewriting the source assessment;
- an agent decision records the evidence and rules snapshots, confidence, explanation, outcome, provider and policy version;
- a learning plan identifies the approved target package and proposed action;
- a human override records who accepted, rejected or replaced the decision and why.

Historical runs and decisions are append-only audit evidence. A new evaluation creates a new decision; it does not overwrite an earlier decision.

## Cost And Service Controls

External assessment services must operate with controlled cost boundaries:

- Azure usage is limited to the assessment functions required by the package;
- FastConformer uses scale-to-zero when idle and bounded replica limits;
- retries are limited and observable;
- service failure must not fabricate a score or silently approve a package;
- fallback behaviour must be recorded in the audit trail.

## Separation From Tarannum.ai

Tarannum Kids package rules, IQRA assessment logic, agent decisions and external-engine configuration are product-specific. They must remain behind Tarannum Kids boundaries and feature flags.

No change under this architecture may alter Tarannum.ai production behaviour unless a separate architecture decision is proposed, reviewed and approved.

## Locked Decisions

The following decisions are locked for Version 1.0:

1. Azure and FastConformer remain part of the Tarannum Kids evidence pipeline.
2. The learning agent performs its full decision cycle after one package is completed.
3. One approved book page may be one package.
4. One complete surah may be one package.
5. Admin creates, configures, sequences and publishes packages.
6. The agent acts only inside Admin-approved curriculum and action boundaries.
7. Assessment evidence and agent decisions remain separate and auditable.
8. Major regression should normally follow targeted remediation and sufficient evidence.
9. Parent or teacher oversight remains available for uncertain or high-impact decisions.
10. Tarannum.ai production is not changed by this architecture.
11. Tarannum.ai owns registration, authentication and the central `users.id` used by every learning module.
12. Production Kids and IQRA records reside in the approved central AWS database but remain logically isolated from Tarannum through tables, APIs, feature flags and access controls.
13. Package evidence, agent decisions, learning plans and human overrides are stored as separate auditable records.

## Change Control

Any change to package definition, Admin authority, agent autonomy, assessment evidence, progression rules or Tarannum.ai separation must:

1. update this document;
2. create a new approved entry in the Decision Log;
3. identify the new architecture version;
4. pass staging validation before production activation.
