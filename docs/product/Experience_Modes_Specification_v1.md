# Experience Modes Specification v1.0

Version: 1.0  
Status: Draft  
Date: 2026-06-26  
Last Updated: 2026-06-26  
Scope: Tarannum.ai user experience modes

## Purpose

Tarannum.ai has different learning experiences based on user context and device context.

The core principle is:

> The learning experience adapts to the user, not the user to the device.

This document defines three product experience modes:

1. Teacher Workspace
2. Classroom Experience
3. Home Practice Experience

These modes are product experience definitions. They are not code implementation notes.

## Relationship With Existing Documentation

This specification must remain aligned with:

- `docs/architecture/Practice_Rendering_Engine_Spec_v1.md`
- `docs/architecture/Graph_Rendering_Specification_v1.md`
- `docs/standards/Glossary.md`
- `docs/standards/Development_Principles.md`
- `docs/decisions/Decision_Log.md`

In all modes, Practice Live must remain qari-led and must follow the Reference Timeline principles defined in the architecture documents.

## Section 1 — Experience Philosophy

Tarannum.ai is not one screen forced onto every device.

Tarannum.ai uses experience modes:

- desktop and laptop for teacher and administrator work
- iPad landscape for the primary classroom experience
- phone for personal practice at home

In every experience mode, Practice Live must remain qari-led:

- Reference Audio is the Single Source of Truth.
- Reference Timeline is the official timeline.
- Reference Playhead is the primary guide.
- Student Pitch Overlay is plotted using Reference Timeline.

The experience may change by device, but the learning architecture must not change.

## Section 2 — Teacher Workspace

### Target Context

- Desktop
- Laptop
- Qari
- Admin
- Teacher
- Developer/testing use

### Status

Secondary Experience.

### Objective

Provide a full workspace for teachers, qari, administrators, and developers.

### Design Principle

Information Rich.

### Main Priorities

1. Management
2. Analysis
3. Content preparation
4. Student monitoring
5. Advanced controls

### Should Display

- Full Training Studio
- Reference library
- Upload reference
- Segment editor
- Student progress
- Score analysis
- Recording analysis
- Advanced graph tools
- Playback speed
- Zoom controls
- Admin/Qari tools where relevant

### Should Avoid

- over-simplifying desktop layout
- hiding important teacher/admin functions
- forcing mobile-style controls on desktop

## Section 3 — Classroom Experience

### Target Context

- iPad landscape
- Physical class
- Group training
- Student follows qari in real time

### Status

Primary Experience.

### Objective

Provide the best training experience in class.

### Design Principle

Learning First.

### Main Priorities

1. Graph
2. Current ayah
3. Next ayah
4. Ayah selection
5. Playback controls

### Locked Layout Direction

Classroom Experience uses the agreed layout direction:

1. Live Pitch compact display
2. Large graph as main learning surface
3. Current ayah panel
4. Next ayah panel
5. Ayah selector 1–8
6. Compact playback control bar
7. Zoom control with `+` and `-`
8. Speed control with slow/fast buttons
9. Exit button

### Important UI Decisions

- Large header is removed.
- Only Live Pitch is kept at the top.
- The graph is maximized because it is the main learning surface.
- Current ayah must be fully visible.
- Next ayah must be fully visible.
- Play buttons on each ayah panel are not required.
- Ayah selection is handled through number buttons 1–8.
- After an ayah is selected, the main Play button plays the selected ayah.
- Reference is not a function button; it is a label/information that the main Play button plays the reference.
- Keyboard shortcut hints do not need to be displayed on iPad.
- Control bar must be compact and must not cover ayah text.
- Reference Playhead must remain the primary guide.

### Should Display

- Live Pitch
- Time progress
- Pitch detected status
- Zoom 100% with `+` and `-`
- Fullscreen icon if needed
- Reference Pitch Curve
- Student Pitch Overlay
- Reference Playhead
- Current ayah
- Next ayah
- Ayah selector 1–8
- Start Practice
- Previous/Restart segment if required
- Play Reference / Pause
- Stop
- Restart
- Slow button
- Speed value
- Fast button
- Exit

### Should Avoid

- large header
- keyboard shortcut hints
- developer-only controls
- per-ayah play buttons beside ayah panels
- control bar covering ayah text
- Student Pitch Overlay controlling viewport
- any layout that makes graph too small

## Section 4 — Home Practice Experience

### Target Context

- Android
- iPhone
- Mobile browser
- Student personal practice at home

### Status

Secondary Experience.

### Objective

Provide personal practice that is simple, focused, and not overwhelming.

### Design Principle

Simplicity First.

### Main Priorities

1. Ayah
2. Graph
3. Playback
4. Practice repetition

### Should Display

- Current ayah
- Simple graph
- Live pitch
- Start Practice
- Play/Pause
- Stop
- Restart
- Basic speed if space allows
- Minimal progress indicator

### Should Avoid

- full desktop graph controls
- large legends
- dense grid
- keyboard shortcuts
- developer controls
- too many buttons in one row
- layout that requires frequent zooming or pinching

### Mobile Portrait Direction

- Ayah should be highly readable.
- Graph should be compact but meaningful.
- Controls should be large and touch-friendly.

### Mobile Landscape Direction

- Graph becomes the focus.
- Ayah may become a compact strip.
- Controls should be icon-first.
- Avoid overlapping browser UI and control bar.

## Section 5 — Feature Matrix

| Feature | Teacher Workspace | Classroom Experience | Home Practice Experience |
| --- | --- | --- | --- |
| Full graph | Full | Essential | Optional |
| Live pitch | Full | Essential | Essential |
| Reference Playhead | Essential | Essential | Essential |
| Student Pitch Overlay | Full | Essential | Essential |
| Current ayah | Full | Essential | Essential |
| Next ayah | Full | Essential | Optional |
| Ayah selector | Full | Essential | Optional |
| Speed control | Full | Essential | Optional |
| Zoom control | Full | Essential | Hidden |
| Upload reference | Full | Hidden | Not shown |
| Segment editor | Full | Hidden | Not shown |
| Student progress | Full | Optional | Hidden |
| Score analysis | Full | Optional | Optional |
| Recording analysis | Full | Optional | Optional |
| Teacher/Qari tools | Full | Hidden | Not shown |
| Keyboard shortcuts | Optional | Hidden | Hidden |
| Annotation / Tanda Bimbingan | Future | Future | Future |

## Section 6 — Future Experience Layer

### Annotation / Tanda Bimbingan

Annotation Layer is a future layer above the graph.

It may be used by qari or teachers to place:

- arrow
- circle
- highlight
- text
- Jawi letters
- tarannum terms
- markers such as Mad, Ghunnah, Jawab, Qarar, Naik, Turun, Tahan, Ulang

Principles:

- Annotation must snap to Reference Timeline.
- Annotation must not change Reference Playhead.
- Annotation must not control viewport.
- Annotation must be a teacher guidance tool, not visual noise.
- Annotation is more suitable for Teacher Workspace and Classroom Experience.
- Home Practice only displays annotation prepared by the teacher.

## Section 7 — Implementation Order

Recommended work order:

1. Finalize documentation.
2. Implement Classroom Experience layout.
3. Validate iPad landscape.
4. Improve Home Practice Experience.
5. Polish Teacher Workspace.
6. Add Annotation / Tanda Bimbingan as future teacher tool.

## Section 8 — Acceptance Criteria

This document is complete when:

1. Three experience modes are clearly defined.
2. Classroom Experience is defined as the Primary Experience.
3. Teacher Workspace and Home Practice Experience are defined as Secondary Experiences.
4. Classroom Experience layout is aligned with the locked mockup direction.
5. Ayah buttons 1–8 and the main Play button are clearly described.
6. Per-ayah play buttons are not included.
7. Zoom `+` and `-` are included.
8. Speed slow/fast is included.
9. Annotation / Tanda Bimbingan is included as a Future Layer.
10. This document does not conflict with PRES or Graph Rendering Specification.

