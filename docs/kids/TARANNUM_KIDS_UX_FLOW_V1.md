# Tarannum Kids UX Flow v1

Status: **Locked baseline for implementation**
Scope: iPad student experience, agent transition, parent/teacher reporting.

## Design principles

1. One primary action per screen.
2. The child always knows where they are, what to do, and what happens next.
3. IQRA, Tarannum and Agent remain visually distinct but share one design system.
4. Assessment evidence and original scores are never changed by the agent.
5. Agent decisions appear only after one Admin-defined package is complete.
6. Parent/teacher override and audit reasons remain visible.

## End-to-end screen flow

| No. | Screen | Purpose | Primary action |
|---|---|---|---|
| 01 | Device setup | Configure child/test device and permissions | Continue |
| 02 | Student login | Sign in using the central Tarannum.ai account | Log in |
| 03 | Home dashboard | Show daily target, active package, agent status and Tarannum activity | Continue active package |
| 04 | Package overview | Explain package goal, units, progress and pass conditions | Start/continue package |
| 05 | Unit preparation | Show reading guide, microphone status and countdown | Start reading |
| 06 | Live practice | Guide the child through words, phrases or Tarannum graph | Finish and assess |
| 07 | Unit result | Show completeness and clarity without overstating precision | Retry or next unit |
| 08 | Package completed | Summarise every required unit | Ask agent to evaluate |
| 09 | Agent transition | Explain advance/retain/remedial/foundation decision and reason | Open recommended package |
| 10 | Parent/teacher report | Show evidence, trend, agent rationale and override controls | Approve/override |

## Dashboard hierarchy

1. Identity and daily 60-minute progress.
2. Active package and current unit.
3. Pending agent decision, if any.
4. IQRA learning entry.
5. Tarannum Listen / Practice / Record activities.
6. Latest assessment summary.

## Package lifecycle

`Assigned → In progress → Required units completed → Agent evaluates → Learning plan created → Next package assigned`

The transition screen must appear before the child begins the next package. It contains:

- completed package name;
- evidence confidence;
- agent outcome;
- plain-language reason;
- recommended next package;
- human-review warning when required;
- one button to continue.

## Visual states

- Green: passed, clear or ready.
- Yellow: warning or needs attention.
- Orange: repeat/remedial action.
- Red: incomplete/failed critical condition.
- Blue: detected by supporting engine, awaiting clarity assessment.
- Grey: not attempted/not detected.

## Implementation order

1. Agent transition screen and package-completion handoff.
2. Package overview driven by active assignment data.
3. Dashboard simplification and active-package priority.
4. Parent/teacher report and controlled override.
5. Admin package preview matching the student experience.
