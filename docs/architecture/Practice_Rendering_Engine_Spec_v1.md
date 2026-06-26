# Practice Rendering Engine Specification

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-06-26

## Purpose

This specification defines the official rendering architecture for Training Studio practice experiences in Tarannum.ai.

Its purpose is to ensure that Practice Live, Recording Analysis, graph rendering, timing, and viewport behaviour are designed around one consistent model.

## Scope

This document covers:

- Practice Live rendering behaviour
- Recording Analysis rendering behaviour
- Reference Timeline ownership
- Reference Playhead behaviour
- Student Pitch Overlay behaviour
- Auto Follow and viewport behaviour
- rendering rules for desktop, tablet, and mobile experiences

This document does not describe the current code implementation. It defines the agreed architecture that implementation must follow.

## Rendering Philosophy

The rendering engine must support the learning relationship between qari and student.

In Practice Live, the qari leads. The student follows. Rendering must make the qari reference easier to follow, not reinterpret the session around the student.

Reference Audio is the Single Source of Truth. All Practice Live timing is derived from the Reference Timeline.

## Practice Live Architecture

Practice Live is an active guided-following mode.

The system plays the Reference Audio and renders the Reference Playhead using the Reference Timeline. The Reference Pitch Curve is displayed as the qari model. The Student Pitch Overlay is plotted against the same Reference Timeline while the student practices.

The Student Pitch Overlay does not create its own timeline during Practice Live. It is interpreted as the student's attempt to follow the qari at the current position in the Reference Timeline.

The Reference Playhead must not be delayed, clamped, or repositioned because of student input. If the student is silent, late, early, or unstable, the Reference Playhead still follows the Reference Timeline.

## Recording Analysis Architecture

Recording Analysis is a review and scoring mode.

In this mode, the system compares a completed student recording against the reference. The rendered analysis may show timing differences, alignment results, segment feedback, and score-related information.

Recording Analysis is not the same as Practice Live. It may use analysis-derived timing and comparison views where appropriate. It must not change the Practice Live rule that Reference Audio leads active practice.

## Rendering Components

### Reference Audio

The authoritative qari audio used for practice and comparison.

### Reference Timeline

The official time axis derived from the Reference Audio.

### Reference Playhead

The current position on the Reference Timeline. It guides the learner through the qari recitation.

### Reference Pitch Curve

The qari pitch contour plotted on the Reference Timeline.

### Student Pitch Overlay

The student's detected pitch plotted on the Reference Timeline during Practice Live.

### Viewport

The visible time window of the rendering engine.

### Auto Follow

The behaviour that moves the viewport according to the Reference Playhead.

### Follow Zone

The region after which the Reference Playhead remains visually centered while the graph moves beneath it.

## Rendering Rules

### Rule 1

Reference Audio is the Single Source of Truth.

### Rule 2

Reference Timeline is the official timeline.

### Rule 3

Reference Playhead uses the Reference Timeline.

### Rule 4

Student Pitch Overlay does not have its own timeline during Practice Live.

### Rule 5

Reference Playhead must not be controlled by Student input.

### Rule 6

Auto Follow follows the Reference Playhead.

### Rule 7

Viewport follows the Reference Playhead.

### Rule 8

After entering the Follow Zone, the Reference Playhead remains centered in the graph. The graph moves.

### Rule 9

All devices use the same rendering engine. Differences between desktop, tablet, and mobile are UI differences only.

## Device Behaviour

Desktop, tablet, and mobile experiences must share the same rendering rules.

Tablet and mobile layouts may adjust control density, graph height, text presentation, and interaction surfaces. They must not change timing ownership, Reference Playhead behaviour, Auto Follow rules, or the relationship between the Reference Timeline and Student Pitch Overlay.

## Implementation Expectations

Future implementation must preserve the following architecture:

- one Master Clock for Practice Live
- Reference Audio as the source of that Master Clock
- Reference Timeline as the shared time axis
- Reference Playhead independent from Student Pitch Overlay
- viewport movement based on Reference Playhead
- separate rendering behaviour for Practice Live and Recording Analysis

