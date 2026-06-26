# Tarannum.ai Philosophy

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-06-26

## Philosophy

Tarannum.ai is not merely a voice analysis application.

Tarannum.ai is a training platform that recreates the experience of a student learning directly from a qari.

The purpose of the platform is to help a learner listen, follow, repeat, compare, and improve with discipline. The system must support the natural learning relationship between teacher and student.

In Practice Live:

> The student follows the qari.

Not:

> The qari follows the student.

Therefore, Reference Audio is the Single Source of Truth.

## Learning Model

Tarannum training depends on guided imitation. The qari provides the authoritative recitation, pacing, melodic movement, and timing. The student learns by aligning their recitation to that reference.

The platform should make the reference easy to follow. It should not allow the student performance to redefine the reference timing during Practice Live.

## Product Direction

Every Practice Live experience should answer one question:

Is the student being helped to follow the qari more clearly?

If a feature makes the qari harder to follow, confuses the source of timing, or makes the student appear to control the reference, it conflicts with the philosophy of Tarannum.ai.

## Architectural Consequence

Because the qari leads the practice experience:

- Reference Audio is authoritative.
- Reference Timeline is the official timeline.
- Reference Playhead represents where the learner is in the qari recitation.
- Student Pitch Overlay is interpreted against the Reference Timeline during Practice Live.

This philosophy applies before implementation details, UI layout, or rendering optimizations.

