# Tarannum.ai Subscription and Royalty Model

Version: 1.0  
Status: Draft  
Date: 2026-06-29  
Last Updated: 2026-06-29  
Scope: Product policy, subscription, qari royalty, student transfer, and qari content bank

## Section 1 - Purpose

This document records the agreed early product model for Tarannum.ai subscription, qari royalty, qari-student assignment, student transfer, and the shared qari recitation bank.

It should be used as the product reference before implementing:

- ToyyibPay payment gateway
- student subscription
- qari assignment
- qari dashboard
- student transfer
- royalty ledger
- qari payout
- certification enrollment
- shared recitation bank

This document defines the first practical model. It is intentionally simpler than a usage-based content marketplace so the system can launch with clear rules and low operational friction.

## Section 2 - Core Business Model

Tarannum.ai will use a student subscription model.

The working example is:

- student subscription: RM30 per month
- qari platform access: free
- qari royalty: 5% of the student's subscription, subject to the active qari and billing cycle rules

Qari are expected to promote Tarannum.ai, bring students into the system, upload their own tarannum recitations, and guide the students assigned to them.

The platform owner provides the system, payment flow, learning interface, certification infrastructure, and administrative governance.

## Section 3 - Qari Onboarding Assumption

The initial planning assumption is:

- 20 qari register with the system
- each qari brings around 25 students
- each qari uploads recitations for their own teaching use
- each qari must contribute at least 1 approved recitation to the shared Tarannum.ai recitation bank

This assumption is used to shape the initial subscription, royalty, and transfer rules.

## Section 4 - Qari Recitation Bank

Each qari must contribute at least 1 recitation that can be used by all registered students.

The purpose of the shared recitation bank is to:

- help students experience different qari styles
- increase the value of the student subscription
- encourage qari participation in a shared learning ecosystem
- allow students to explore other qari voices without changing their assigned qari
- create a foundation for future content marketplace features

The shared bank does not automatically change the student's assigned qari.

A student may practice with recitations from other qari through the bank, but the student's active qari and royalty assignment remain governed by the assignment and billing cycle rules.

## Section 5 - Recitation Categories

Tarannum.ai should distinguish between at least two content categories.

### Qari Teaching Recitations

These are recitations uploaded by a qari for students under that qari's guidance.

They may be used in classroom training, home practice, recording analysis, and certification preparation.

### Shared System Recitations

These are the mandatory or approved recitations contributed to the platform-level recitation bank.

They can be used by all registered students for exploration and practice.

For the first implementation, shared system recitations do not create separate usage-based royalties. They are treated as a required qari contribution to the Tarannum.ai ecosystem.

Usage-based content royalties may be considered in a future version, but they are not part of the initial model.

## Section 6 - Student and Qari Assignment

Every student must have one active qari assignment.

The active qari represents the qari currently responsible for the student inside the system.

The active qari is used for:

- qari dashboard visibility
- student list ownership
- monthly royalty eligibility
- learning relationship
- certification relationship when applicable

The system must keep assignment history. It must not only store the current qari.

Minimum assignment history fields should include:

- student id
- qari id
- assignment start date
- assignment end date
- assignment status
- transfer reason, if applicable
- created by
- created at

## Section 7 - Registration, Trial, and Subscription Activation

The agreed student onboarding flow is:

> Register -> Verify Email -> Confirm/Pilih Qari -> 7-day Trial or 3 recording sessions -> Subscribe RM30/month -> 30-day Qari Lock -> Royalty Ledger

The trial ends when the first of these limits is reached:

- 7 calendar days after trial activation
- 3 recording sessions used

The trial should allow the student to understand the value of Tarannum.ai without giving unlimited access to the most valuable analysis features.

Recommended trial access:

- student can log in after email verification
- student can confirm or choose a qari
- student can access limited learning content
- student can explore selected recitations
- student can use Practice Mode with reasonable limits
- student can use up to 3 recording sessions

After the trial ends, the student may still be allowed to log in, but access to full learning features should require subscription.

Royalty does not start during trial.

Royalty starts only after successful subscription payment.

The 30-day qari lock should begin from the first successful subscription activation, not merely from trial registration.

If a student subscribes before the trial ends, the subscription becomes active immediately and the 30-day qari lock begins from that activation.

## Section 8 - Bulk Course Enrollment and Organizer-Paid Subscription

Tarannum.ai must support cases where students do not pay subscription individually because the subscription value is included in a course or cohort fee collected by the platform owner, qari, or organizer.

Example:

- course fee collected: RM100 per student
- Tarannum.ai subscription component: RM30 per student
- number of students: 50
- total course collection: RM5,000
- total Tarannum.ai subscription entitlement value: RM1,500

In this case, students should not be required to pay RM30 again during registration.

The system should support bulk or cohort enrollment:

> Create Course/Cohort -> Add Student List -> Organizer Pays or Admin Marks Paid -> System Creates Subscription Entitlements -> Student Registers and Verifies Email -> Access Active

The key product distinction is:

- payment records who paid
- entitlement records who receives access
- assignment records which qari is responsible
- royalty ledger records who receives royalty

Payment may come from:

- student self-payment
- organizer bulk payment
- qari or course owner bulk payment
- admin manual activation
- sponsorship

For organizer-paid or course-paid subscriptions:

- student registration is still required
- email verification is still required
- student identity should match the invited email, IC number, or approved identifier
- subscription entitlement should activate without asking the student to pay again
- assigned qari should be set from the course or cohort
- 30-day qari lock should begin when the entitlement becomes active
- royalty should be calculated from the Tarannum.ai subscription component, not the full course fee

Using the RM100 course example, royalty is calculated from RM30, not RM100.

Example royalty:

- subscription component: RM30
- royalty rate: 5%
- royalty per student: RM1.50
- 50 students: RM75 royalty for the active qari for that billing cycle

Required records for this model:

- course or cohort
- organizer or payer
- student invitation list
- bulk payment or admin activation record
- subscription entitlement
- qari assignment
- royalty ledger entry

Student experience:

- student registers normally
- system detects a matching paid course/cohort entitlement
- student verifies email
- system activates access without self-payment
- student sees the assigned qari and course/cohort context

This model prevents double payment when the platform owner, qari, or organizer has already collected the subscription component inside a course fee.

## Section 9 - Student Transfer Rule

A student must remain with the original or current qari for at least 30 days after successful subscription activation before transferring to another qari. Trial days do not count toward the 30-day qari lock.

Transfer rules:

- student transfer is only allowed after 30 paid subscription days with the current qari
- transfer does not require approval from the original qari
- the original qari is informed indirectly when the student no longer appears in that qari's dashboard
- the system must record transfer history
- student should select a transfer reason
- student should not be allowed to repeatedly switch qari within the same lock period

This rule protects qari who promote the platform and bring students into the system while still giving students reasonable freedom after an initial learning period.

## Section 10 - Exploration Without Transfer

Students may try recitations from other qari through the shared recitation bank without transferring qari.

This is an important product rule.

It allows students to:

- compare styles
- practice with different voices
- discover other qari
- improve learning variety

It does not:

- move the student to another qari
- remove the student from the active qari dashboard
- change royalty allocation
- change certification qari

This separation reduces conflict because exploration is not treated as reassignment.

## Section 11 - Royalty Rule

The initial royalty model is assignment-based, not usage-based.

Royalty is paid to the active qari for the relevant billing cycle.

Working rule:

- student pays subscription or receives a paid entitlement through a course/cohort
- system records successful payment
- royalty percentage is calculated from the subscription amount
- royalty is assigned to the qari active for that billing cycle
- if transfer is requested after the 30-day lock, the new qari becomes eligible from the next applicable cycle based on the system's billing rule

The current recommended rule is:

> Royalty follows the active qari for the billing cycle, not every recitation the student plays.

This keeps the initial model simple, understandable, and easier to audit.

## Section 12 - Billing Cycle Treatment

For the first version, qari royalty should be calculated by billing cycle.

Example:

- subscription amount: RM30
- royalty rate: 5%
- qari royalty: RM1.50 for that student and billing cycle

If a student transfers after the allowed 30-day period, the transfer should not create complicated daily prorating in the first version.

The recommended approach is:

- current billing cycle royalty remains with the current active qari
- transfer takes effect for the next billing cycle or next eligible assignment period
- future royalty goes to the new active qari

This avoids small prorated amounts, disputes over partial days, and complex operational reconciliation.

## Section 13 - Why This Model Is Considered Fair

This model is considered fair because:

- qari who bring students into the platform get at least a 30-day protected period
- students are not permanently locked to one qari
- transfer does not require qari approval, avoiding personal conflict
- all qari face the same transfer rule
- all qari contribute at least one shared recitation
- students can explore other qari without disrupting assignment
- royalty is easy to explain
- the system can audit assignment and billing history

The product position is:

> If one qari may lose a student after the allowed period, another qari may also experience the same rule. The rule is equal for all qari.

## Section 14 - Certification Relationship

Tarannum.ai is planned as a tarannum skill certification platform.

Certificates may be signed or endorsed by:

- the system owner
- the qari associated with the student's certification pathway or qari voice

Certification should not depend only on the student's current global qari assignment.

The recommended model is certification enrollment.

A certification enrollment should record:

- student id
- certification program id
- certifying qari id
- enrollment start date
- enrollment status
- completion date
- certificate issue date

For certification, qari assignment should be more controlled than casual practice.

If a student wants to transfer qari during a certification pathway, the system should support a clear transfer record. Depending on future policy, certification transfer may require admin handling even if normal qari transfer does not require qari approval.

## Section 15 - Operational Rules

Recommended operational rules:

- qari must upload required recitation content before becoming fully active
- shared bank recitations should be approved by admin before publication
- trial usage should be tracked by start date and recording session count
- trial expiry should be based on whichever limit is reached first: 7 days or 3 recording sessions
- course/cohort entitlement should prevent students from paying twice
- bulk payments should clearly separate course fee from Tarannum.ai subscription component
- subscription entitlement should support self-paid and organizer-paid sources
- student transfer should be visible in audit history
- qari dashboard should show only currently assigned students
- admin dashboard should show assignment history and transfer history
- royalty should be calculated into a ledger before payout
- payout should not be made directly from raw payment events without ledger records
- refunds and failed payments must not generate payable royalty

## Section 16 - Royalty Ledger Requirement

The system should use a royalty ledger.

The ledger should record:

- payment id
- payment source
- entitlement id
- course or cohort id, if applicable
- student id
- qari id
- billing cycle
- subscription amount
- royalty rate
- royalty amount
- royalty status
- created date
- payout id, if paid
- reversal reason, if reversed

Possible statuses:

- pending
- payable
- paid
- reversed
- cancelled

This is needed so royalty can be audited, corrected, and reported reliably.

## Section 17 - Out of Scope for Initial Version

The following are not part of the first royalty implementation:

- usage-based royalty per recitation play
- royalty split between recruiting qari and teaching qari
- automated qari payout
- marketplace pricing per qari content
- student bidding or ranking marketplace
- qari-to-qari approval flow for transfer

These may be considered later after the subscription, assignment, transfer, and ledger systems are stable.

## Section 18 - Implementation Summary

The agreed initial model is:

1. Qari bring students into Tarannum.ai.
2. Students subscribe to the system.
3. Qari use the platform for free.
4. Each qari uploads their own recitations.
5. Each qari contributes at least 1 approved recitation to the shared recitation bank.
6. Student registers, verifies email, and confirms or chooses a qari.
7. Student receives a trial that ends after 7 days or 3 recording sessions, whichever comes first.
8. Student subscribes at RM30/month after or during trial, unless covered by a course/cohort entitlement.
9. Bulk course enrollment can activate student subscription entitlement without student self-payment.
10. The 30-day qari lock begins after successful subscription or entitlement activation.
11. Student can explore other qari recitations without transferring qari.
12. Student can transfer qari after the 30-day lock.
13. Transfer does not require approval from the original qari.
14. Royalty follows the active qari for the billing cycle.
15. Royalty is calculated from the Tarannum.ai subscription component, not the full course fee.
16. Royalty is recorded in a ledger before payout.
17. Certification should use certification enrollment with a certifying qari.
