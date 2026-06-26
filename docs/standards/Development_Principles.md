# Tarannum.ai Development Principles

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-06-26

## Purpose

These principles guide future development of Training Studio and its rendering experience.

They are architecture standards, not implementation notes.

## Principles

### 1. Do Not Duplicate State

Timing, playback, and rendering state must have clear ownership. Duplicate state creates drift, inconsistent UI, and unclear debugging paths.

### 2. Use One Master Clock

Each rendering mode must have one Master Clock.

For Practice Live, the Master Clock is derived from Reference Audio.

### 3. Keep Practice Live And Recording Analysis Separate

Practice Live is a guided-following experience. Recording Analysis is a review and scoring experience.

They may share visual components, but they must not share assumptions that make the student control the Practice Live reference.

### 4. Use Consistent Terminology

Use official terms from the Glossary.

Avoid informal or color-based names in architecture discussions. Prefer terms such as Reference Playhead, Reference Pitch Curve, and Student Pitch Overlay.

### 5. Protect The Reference Timeline

Reference Timeline is the official time axis during Practice Live.

Student input may be plotted against it, but must not redefine it.

### 6. Auto Follow Must Follow The Reference Playhead

Auto Follow exists to help the student follow the qari. It must follow the Reference Playhead, not the Student Pitch Overlay.

### 7. Device Differences Are UI Differences

Desktop, tablet, and mobile experiences may have different layout and control density. They must use the same rendering rules.

### 8. Rendering Engine Changes Must Follow The Specification

All changes to timing, graph rendering, viewport behaviour, Practice Live, or Recording Analysis must comply with the Practice Rendering Engine Specification.

### 9. Record Architecture Decisions

Any change that alters timing ownership, mode behaviour, terminology, or rendering philosophy must be recorded in the Decision Log.

### 10. Prefer Clarity Over Cleverness

Training Studio is a learning environment. Behaviour should be predictable, explainable, and aligned with the qari-led practice model.

