# Graph Rendering Specification v1.0

Version: 1.0  
Status: Draft  
Date: 2026-06-26  
Last Updated: 2026-06-26  
Scope: Training Studio graph rendering

## 1. Title & Metadata

This document defines Graph Rendering Specification v1.0 for Tarannum.ai Training Studio.

It applies to graph rendering in Practice Live and Recording Analysis, including timing, viewport behaviour, rendering layers, device behaviour, and future graph-related overlays.

## 2. Purpose

This document establishes the official visual and technical rules for Tarannum.ai graph rendering.

The graph is not merely a pitch visualization. In Practice Live, it is the primary guidance medium that helps the student follow the qari. Its rendering behaviour must therefore protect the learning model defined by Tarannum.ai architecture.

The graph must make the Reference Timeline, Reference Playhead, Reference Pitch Curve, and Student Pitch Overlay understandable, stable, and consistent across devices.

## 3. Relationship With PRES

This document must comply with the Practice Rendering Engine Specification.

In Practice Live:

- Reference Audio is the Single Source of Truth.
- Reference Timeline is the official timeline.
- Reference Playhead is the primary guide.
- Student Pitch Overlay is plotted on the Reference Timeline.

Any future graph implementation must preserve these rules before optimizing layout, animation, or interaction.

## 4. Rendering Layers

The graph is rendered as a layered system. Each layer has a clear responsibility and must not take ownership of another layer's timing behaviour.

### Layer 1 — Timeline, Grid & Background

This layer provides the visual foundation of the graph.

It includes:

- background
- grid
- time axis
- pitch axis
- padding
- zoom base

This layer defines the graph's readable structure but does not own playback timing.

### Layer 2 — Reference Pitch Curve

This layer renders the qari/reference pitch curve.

The Reference Pitch Curve:

- is plotted using the Reference Timeline
- represents the qari model
- is not controlled by student input
- remains anchored to the Reference Timeline

### Layer 3 — Student Pitch Overlay

This layer renders the student's pitch.

During Practice Live, Student Pitch Overlay:

- is plotted using the Reference Timeline
- is attached to the Reference Playhead during live practice
- shows pitch movement and pitch differences on the Y-axis
- does not define a separate X-axis timeline

The student's difference is a pitch relationship, not a new timeline.

### Layer 4 — Reference Playhead

This layer renders the official playhead.

The Reference Playhead:

- follows the Reference Timeline
- remains centered after entering the Follow Zone
- is not controlled by Student Pitch Overlay
- acts as the primary visual guide in Practice Live

### Layer 5 — Future Overlays

Future overlays may be added without changing the timing ownership of the graph.

Examples:

- Ghost Curve
- AI Feedback Marker
- Mistake Marker
- Teacher Annotation
- Breath Marker
- Maqam Transition Marker

These overlays must be anchored to the appropriate timeline and must not redefine Practice Live timing rules.

## 5. Practice Live Rendering Rules

### Rule 1

Reference Timeline is the official X-axis.

### Rule 2

Student Pitch Overlay does not have its own timeline in Practice Live.

### Rule 3

Student Pitch Overlay uses timestamps from the Reference Timeline.

### Rule 4

Student Pitch Overlay only shows pitch differences on the Y-axis.

### Rule 5

Reference Playhead must not be controlled by Student Pitch Overlay.

### Rule 6

Auto Follow must follow Reference Playhead.

### Rule 7

Viewport must follow Reference Playhead.

### Rule 8

After the Follow Zone is reached, Reference Playhead remains centered in the graph.

### Rule 9

The graph moves; Reference Playhead remains fixed.

### Rule 10

Rendering behaviour must be the same on all devices. Differences are limited to size, layout, and density.

## 6. Recording Analysis Rendering Rules

Recording Analysis may use behaviour that differs from Practice Live because it is a review and scoring mode.

In Recording Analysis:

- student recording may have its own timeline
- DTW alignment may be used
- comparison may be performed through post-processing
- playback review may use the timeline mode most appropriate for analysis

Recording Analysis must not change the principles of Practice Live. Practice Live remains a qari-led, Reference Timeline-driven experience.

## 7. Device Rendering Rules

### Desktop

Desktop rendering may use a wider graph surface and fuller controls.

The graph may show more detail, more controls, and wider viewport context while preserving the same rendering behaviour as other devices.

### iPad / Tablet

Tablet rendering must preserve timing accuracy and center-lock behaviour.

Requirements:

- Reference Playhead remains center-locked after the Follow Zone.
- Graph scroll is smooth.
- DevicePixelRatio is handled correctly.
- All pan and Auto Follow math uses display width, not backing canvas width.

### Mobile Portrait

Mobile portrait rendering should be simplified.

Requirements:

- graph remains readable
- ayah display may appear above the graph
- controls use compact layout
- behaviour remains identical to desktop and tablet rendering

### Mobile Landscape

Mobile landscape rendering should prioritize the graph.

Requirements:

- graph becomes the focus
- ayah display may become a single-line strip
- controls should be icon-first
- behaviour remains identical to desktop and tablet rendering

## 8. Canvas & DevicePixelRatio Rule

If canvas rendering uses DevicePixelRatio:

- `canvas.width` is backing-store pixel width.
- `displayWidth = canvas.width / dpr` is the logical drawing width.
- `canvas.height` is backing-store pixel height.
- `displayHeight = canvas.height / dpr` is the logical drawing height.

All visual calculations must use `displayWidth` and `displayHeight`, including:

- pan
- center lock
- cursor position
- viewport movement
- mouse coordinate mapping
- touch coordinate mapping
- Auto Follow

Do not mix backing-store pixels and CSS/display pixels in the same formula.

## 9. Auto Follow & Center Lock

Before Reference Playhead reaches the Follow Zone, it may move from the left side of the viewport toward the center.

After Reference Playhead reaches the Follow Zone:

- Reference Playhead remains centered
- graph content moves left
- viewport follows Reference Playhead
- Auto Follow is controlled by Reference Playhead
- Student Pitch Overlay does not move the viewport

This behaviour must be consistent across desktop, tablet, and mobile.

## 10. Anti-Patterns

The following behaviours are not allowed:

- making latest student pitch time the Master Clock in Practice Live
- clamping Reference Playhead to Student Pitch Overlay
- using Student Pitch Overlay to move Auto Follow in Practice Live
- mixing Practice Live behaviour with Recording Analysis behaviour
- using backing canvas width for pan or center calculation
- hardcoding behaviour that works only on desktop but drifts on iPad
- allowing viewport ownership to move away from Reference Playhead during Practice Live

## 11. Implementation Notes For Future Patch

These notes describe future patch direction only. They are not implementation in this document.

### Patch 0A

Fix DevicePixelRatio and display width consistency.

All pan, center lock, viewport, coordinate mapping, and Auto Follow calculations should use logical display dimensions.

### Patch 0B

Add a Practice Live rendering mode so Reference Playhead and Auto Follow use Reference Timeline.

This mode should make Reference Playhead independent from Student Pitch Overlay.

### Patch 0C

Separate graph rendering behaviour between Practice Live and Recording Analysis.

Shared components may remain, but timing ownership and viewport behaviour must be mode-aware.

### Patch 1

Improve fullscreen graph controls and speed control.

Control improvements must not change the timing rules defined in this specification.

## 12. Acceptance Criteria

The graph complies with this specification when:

1. Reference Playhead follows Reference Timeline.
2. Reference Playhead is not controlled by Student Pitch Overlay.
3. Student Pitch Overlay is attached to Reference Timeline in Practice Live.
4. After the Follow Zone, Reference Playhead remains centered.
5. The graph moves, not the playhead.
6. iPad does not show playhead drift.
7. Desktop, iPad, and mobile use the same behaviour.
8. Recording Analysis does not break Practice Live.

