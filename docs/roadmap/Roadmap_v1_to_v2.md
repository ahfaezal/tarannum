# Tarannum.ai Roadmap v1 to v2

Version: 1.0  
Status: Draft  
Date: 2026-06-26  
Last Updated: 2026-06-29
Scope: Product roadmap

## Section 1 — Purpose

This document keeps Tarannum.ai product development organized and focused.

Version 1.0 focuses on:

- foundation
- stability
- classroom experience
- home practice
- teacher workspace
- rendering engine
- basic dashboard capability

Version 2.0 focuses on:

- subscription and payment gateway maturity
- qari royalty workflow
- AI Coach
- Tanda Bimbingan / Annotation Layer
- Ghost Curve
- Teacher Broadcast
- Smart Classroom
- Learning Analytics
- Certification

The goal is to build the stable learning platform first, then add intelligent guidance and advanced teaching tools on top of it.

## Version 1.0 — Stable Learning Platform

Tarannum.ai v1.0 is a stable, consistent digital tarannum training platform that can be used in real classrooms.

Main components:

1. Practice Rendering Engine
2. Graph Rendering Specification
3. Experience Modes
4. Classroom Experience
5. Home Practice Experience
6. Teacher Workspace
7. Practice Live
8. Recording Analysis
9. Student Progress
10. Qari Dashboard
11. Admin Dashboard
12. Reference Library
13. Basic Speed Control
14. Ayah Selection
15. Score Mimic / Analysis
16. Payment and subscription foundation
17. Qari assignment and transfer foundation

## Version 2.0 — Intelligent Guided Learning

Tarannum.ai v2.0 adds intelligent guidance and teacher tools on top of the v1.0 foundation.

Main components:

1. AI Coach
2. Tanda Bimbingan / Annotation Layer
3. Ghost Curve
4. Teacher Annotation Tools
5. AI Annotation Suggestion
6. Teacher Broadcast
7. Smart Classroom
8. Learning Analytics
9. Qari Content Marketplace
10. Certification / SKM Integration
11. Personalised Training Plan
12. Progress Comparison
13. Teacher Feedback Bank
14. Qari royalty ledger and payout dashboard
15. Shared qari recitation bank expansion

## Section 4 — What Belongs in v1.0

Version 1.0 only accepts features that improve the stability and usefulness of the core learning experience.

Examples:

- UI Classroom Experience
- iPad landscape layout
- mobile practice layout
- graph stability
- Reference Playhead
- speed control
- zoom control
- ayah selector
- current/next ayah
- basic recording analysis
- basic dashboard
- ToyyibPay payment gateway foundation
- student subscription foundation
- qari assignment and 30-day transfer rule
- shared qari recitation bank foundation

v1.0 should make the core practice experience reliable before expanding into advanced guidance layers.

## Section 5 — What Must Wait Until v2.0

The following features must wait until v2.0, even if they are attractive:

- Tanda Bimbingan
- Annotation freehand
- Jawi annotation
- Ghost Curve
- AI Coach
- AI suggestion
- Teacher Broadcast
- Smart Classroom
- advanced certification workflow
- marketplace
- usage-based qari content royalty
- automated qari payout

Reason:

v1.0 must be stable before the wow factor is built.

## Section 6 — Development Rule

> If a feature does not improve the stability of Practice Live, Classroom Experience, Home Practice, or Teacher Workspace, it goes into the v2.0 backlog.

This rule protects focus. It prevents advanced features from weakening the core learning platform before it is ready.

## Section 7 — Immediate Next Sprint

Next Sprint:
Classroom Experience UI Implementation

Focus:

1. iPad landscape layout
2. remove large header
3. keep Live Pitch compact
4. maximize graph height
5. show current ayah and next ayah clearly
6. add ayah selector 1–8
7. add zoom +/-
8. add speed slow/fast
9. use one main Play Reference control
10. remove per-ayah play button
11. hide keyboard hints on iPad
12. compact control bar

## Section 8 - Payment, Subscription, and Royalty Track

The agreed first model is defined in:

- `docs/product/Subscription_Royalty_Model_v1.md`

Implementation order:

1. ToyyibPay payment gateway integration
2. student registration to email verification flow
3. qari confirmation or selection before trial activation
4. trial tracking by 7-day limit or 3 recording sessions
5. student subscription records
6. self-payment and organizer-paid entitlement support
7. successful payment callback handling
8. course/cohort enrollment and student invitation list
9. qari assignment history
10. 30-day student qari transfer lock after subscription activation
11. shared qari recitation bank requirement
12. royalty ledger
13. qari dashboard royalty visibility
14. admin royalty audit view
15. manual payout workflow

The first royalty implementation should be assignment-based and billing-cycle-based. Usage-based recitation royalties and automated payouts should wait until the core subscription and ledger system is stable.
