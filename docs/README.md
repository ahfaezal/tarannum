# Tarannum.ai Project Documentation

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-07-19

## Purpose

This `/docs` folder is the official architecture documentation space for Tarannum.ai.

It exists to provide a Single Source of Truth for future product, design, and engineering decisions. Before changes are made to Training Studio or its practice rendering behaviour, contributors should read and align with these documents.

This documentation is not a code walkthrough. It describes the agreed architecture, vocabulary, philosophy, and development standards that should guide implementation.

## How To Use This Documentation

Developers should use these documents before planning or implementing changes. Product and design contributors should use them to keep the learning experience consistent with the purpose of Tarannum.ai.

When a proposed change affects Practice Live, Recording Analysis, graph rendering, timing behaviour, or terminology, the change must be checked against the Practice Rendering Engine Specification and Decision Log.

When a proposed change affects Recording Mode scoring, score labels, or score explanation, the change must be checked against the Assessment Score Specification.

If the architecture changes, update the relevant document and record the decision in the Decision Log before implementation begins.

## Recommended Reading Order

1. [Philosophy](philosophy/Philosophy.md)
2. [Practice Rendering Engine Specification](architecture/Practice_Rendering_Engine_Spec_v1.md)
3. [Assessment Score Specification](architecture/Assessment_Score_Specification_v1.md)
4. [Development Principles](standards/Development_Principles.md)
5. [Glossary](standards/Glossary.md)
6. [Experience Modes Specification](product/Experience_Modes_Specification_v1.md)
7. [Subscription and Royalty Model](product/Subscription_Royalty_Model_v1.md)
8. [Decision Log](decisions/Decision_Log.md)
9. [20 iPad Production Test](20-ipad-production-test.md)
10. [System Modernization Audit — 2026-07-19](system-modernization-audit-2026-07-19.md)

## Documentation Structure

- `philosophy/` explains why Tarannum.ai exists and what learning experience it protects.
- `architecture/` defines the agreed rendering architecture for Practice Live, Recording Analysis, graph rendering, and assessment scoring.
- `product/` defines product experience modes, subscription policy, qari royalty, and business rules.
- `standards/` defines shared language and development principles.
- `decisions/` records approved architecture decisions.
- `20-ipad-production-test.md` records the production load-test procedure, validated baseline and readiness criteria for classroom deployment.
- `system-modernization-audit-2026-07-19.md` records the approved Admin, password recovery, dashboard-performance and Recording/Scoring modernization scope.

## Maintenance

All documents must include:

- a clear title
- version number
- date
- Last Updated date
- professional Markdown formatting
- architecture-level guidance that does not depend on the current implementation
