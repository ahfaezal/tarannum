# Tarannum.ai Project Documentation

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-06-26

## Purpose

This `/docs` folder is the official architecture documentation space for Tarannum.ai.

It exists to provide a Single Source of Truth for future product, design, and engineering decisions. Before changes are made to Training Studio or its practice rendering behaviour, contributors should read and align with these documents.

This documentation is not a code walkthrough. It describes the agreed architecture, vocabulary, philosophy, and development standards that should guide implementation.

## How To Use This Documentation

Developers should use these documents before planning or implementing changes. Product and design contributors should use them to keep the learning experience consistent with the purpose of Tarannum.ai.

When a proposed change affects Practice Live, Recording Analysis, graph rendering, timing behaviour, or terminology, the change must be checked against the Practice Rendering Engine Specification and Decision Log.

If the architecture changes, update the relevant document and record the decision in the Decision Log before implementation begins.

## Recommended Reading Order

1. [Philosophy](philosophy/Philosophy.md)
2. [Practice Rendering Engine Specification](architecture/Practice_Rendering_Engine_Spec_v1.md)
3. [Development Principles](standards/Development_Principles.md)
4. [Glossary](standards/Glossary.md)
5. [Decision Log](decisions/Decision_Log.md)

## Documentation Structure

- `philosophy/` explains why Tarannum.ai exists and what learning experience it protects.
- `architecture/` defines the agreed rendering architecture for Practice Live and Recording Analysis.
- `standards/` defines shared language and development principles.
- `decisions/` records approved architecture decisions.

## Maintenance

All documents must include:

- a clear title
- version number
- date
- Last Updated date
- professional Markdown formatting
- architecture-level guidance that does not depend on the current implementation

