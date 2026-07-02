# Assessment Score Specification

Version: 1.0  
Date: 2026-07-02  
Last Updated: 2026-07-02

## Purpose

This document records the agreed Assessment Score model for Tarannum.ai Recording Mode.

The purpose is to make the scoring behaviour explainable, auditable, and easier to tune in the future. It also records the original scoring specification before the July 2026 adjustment so future contributors can understand why the scoring was changed.

## Scope

This document covers:

- Assessment Score in Recording Mode
- original scoring behaviour before the July 2026 adjustment
- updated tarannum-aware scoring behaviour
- score breakdown labels used by the frontend
- principles for future score tuning

This document does not define Practice Mode scoring. At this stage, Practice Mode should remain a guided training experience without a separate practice score.

## Product Context

Assessment Score is shown after a student records a complete attempt and the system compares the student recording with the selected qari reference.

The score must encourage learning. If the student's graph visibly improves and becomes closer to the qari reference, the score should normally show meaningful improvement too. If the score remains almost unchanged despite visible improvement, students may lose confidence in the system.

Assessment Score should therefore be strict enough to detect weak or wrong attempts, but not so strict that genuine pitch-contour and ayah-timing improvement is hidden.

## Original Assessment Score Before Adjustment

The original scoring model used a stricter similarity formula.

### Original Global Audio Feature Weights

The original global base score used these feature weights:

| Feature | Original Weight | Original Role |
|---|---:|---|
| MFCC | 50% | Main voice timbre and pronunciation-like similarity signal |
| Chroma | 25% | Pitch class and tonal similarity |
| Spectral Contrast | 15% | Spectral characteristics |
| Tonnetz | 5% | Tonal quality |
| Zero Crossing Rate | 5% | Rhythm or tempo proxy |

### Original Base And Pitch Blend

The original score blended:

| Component | Original Weight |
|---|---:|
| Base audio feature score | 50% |
| Pitch contour score | 50% |

When pitch was very low but base audio score was moderate, the fallback blend became:

| Component | Original Fallback Weight |
|---|---:|
| Base audio feature score | 70% |
| Pitch contour score | 30% |

### Original Mismatch Penalty

The original model applied a mismatch penalty when the difference between base score and pitch score reached 20 points or more.

| Original Rule | Value |
|---|---:|
| Mismatch threshold | 20 points |
| Maximum penalty | 18 points |

### Original Mid-Range Rescaling

The original model only applied mid-range rescaling when both base score and pitch score were at least 35.

| Original Rule | Value |
|---|---|
| Minimum base score | 35 |
| Minimum pitch score | 35 |
| Source range | 35-65 |
| Target range | 65-92 |

### Original Low-Score Gates

The original model used strict caps when pitch or base score was low:

| Condition | Original Cap |
|---|---:|
| pitch < 25 and base < 50 | min(15, 0.5 x max component) |
| pitch < 35 and base < 55 | min(20, 0.6 x max component) |
| pitch < 35 or base < 35 | min(30, 0.8 x max component) |

### Original Near-Perfect Reward

The original near-perfect reward required both base score and pitch score to be at least 45.

| Original Rule | Value |
|---|---:|
| Minimum base score | 45 |
| Minimum pitch score | 45 |
| Boost formula | 50 + (average expanded score - 45) x 1.5 |

### Original Segment Contribution

The original segment scoring blend favoured MFCC over pitch:

| Component | Original Segment Weight |
|---|---:|
| MFCC segment match | 60% |
| Pitch segment match | 40% |

The original final score used segment results as a light stabilizer:

| Component | Original Final Fusion Weight |
|---|---:|
| Pre-segment final score | 85% |
| Segment-based overall score | 15% |

## Problem Observed

Student attempts showed visible graph improvement across repeated recordings, but the final score remained almost unchanged around the low 30% range.

This created a product risk:

- students may think the system does not recognize improvement
- students may feel discouraged after repeated attempts
- the visible graph and final score may appear inconsistent
- the scoring model may over-penalize microphone, voice timbre, and minor audio-feature differences

The system should still reject poor recordings, silence, or wrong audio, but genuine tarannum improvement should move the score more visibly.

## Scoring Version 2: Graph-Only Baseline

As of the V2 scoring experiment, Assessment Score is simplified to graph-only scoring. The purpose is to restore user trust by making the final score follow what students can see on the graph.

V2 final score uses:

| Component | Weight | Meaning |
|---|---:|---|
| Pitch Contour | 60% | How closely the student's red graph follows the qari reference graph shape |
| Ayat Timing | 30% | How well the graph follows the reference timing and ayat changes |
| Graph Stability | 10% | How stable the student graph is, including spike control |

The following signals are kept as diagnostics only in V2 and should not affect the final score:

- MFCC
- Chroma
- Tonnetz
- Spectral Contrast
- Zero Crossing Rate
- Audio Clarity
- Mic Stability

Rationale:

- students judge improvement primarily through the visible graph
- if the red graph gets closer to the green graph, the score should move accordingly
- audio-feature-heavy scoring was too difficult to explain and could reduce trust
- additional scoring elements should only be reintroduced one at a time after graph-only scoring is trusted

## Updated Tarannum-Aware Assessment Score

The following tarannum-aware audio-feature model is retained as historical reference and diagnostic context. It is not the current V2 final-score formula.

### Updated Global Audio Feature Weights

| Feature | Updated Weight | Updated Role |
|---|---:|---|
| MFCC | 25% | Pronunciation-like and timbre signal, reduced because it is device-sensitive |
| Chroma | 35% | Tonal and tarannum pattern signal |
| Spectral Contrast | 15% | Audio spectral match |
| Tonnetz | 10% | Tonal quality |
| Zero Crossing Rate | 15% | Rhythm or tempo proxy |

Rationale:

- MFCC remains useful, but it can be affected by microphone, room, device, and voice colour.
- Chroma and pitch-related signals are more aligned with tarannum contour learning.
- Rhythm and timing signals should have enough influence to reward better alignment.

### Updated Base And Pitch Blend

| Component | Updated Weight |
|---|---:|
| Base audio feature score | 40% |
| Pitch contour score | 60% |

When pitch is very low but base audio score is moderate, the fallback blend becomes:

| Component | Updated Fallback Weight |
|---|---:|
| Base audio feature score | 60% |
| Pitch contour score | 40% |

Rationale:

- visible graph improvement is mainly pitch-contour improvement
- pitch contour should affect the final score more clearly
- base audio features remain important but should not dominate the learning signal

### Updated Mismatch Penalty

| Updated Rule | Value |
|---|---:|
| Mismatch threshold | 30 points |
| Maximum penalty | 10 points |

Rationale:

- small or moderate mismatch should not lock the student near the same score
- large mismatch still reduces confidence in the result

### Updated Mid-Range Rescaling

| Updated Rule | Value |
|---|---|
| Minimum base score | 30 |
| Minimum pitch score | 30 |
| Source range | 30-65 |
| Target range | 52-88 |

Rationale:

- students with partial but visible improvement should escape the low-score band more easily
- the system should still avoid giving high scores to weak attempts

### Updated Low-Score Gates

| Condition | Updated Cap |
|---|---:|
| pitch < 15 and base < 35 | min(12, 0.5 x max component) |
| pitch < 25 and base < 40 | min(35, 0.9 x max component) |
| pitch < 35 and base < 45 | min(45, 1.05 x max component) |
| pitch < 35 or base < 35 | min(55, 1.15 x max component) |

Rationale:

- the strongest gate remains strict for clearly weak or wrong attempts
- moderate attempts are no longer capped too harshly
- visible improvement can move the score into a more motivating range

### Updated Near-Perfect Reward

| Updated Rule | Value |
|---|---:|
| Minimum base score | 40 |
| Minimum pitch score | 40 |
| Boost formula | 48 + (average expanded score - 40) x 1.35 |

Rationale:

- good attempts should receive more positive recognition earlier
- perfect or near-perfect scoring still requires strong alignment across components

### Updated Segment Contribution

The updated segment scoring blend gives more weight to pitch contour:

| Component | Updated Segment Weight |
|---|---:|
| MFCC segment match | 40% |
| Pitch segment match | 60% |

The updated final score gives more influence to segment-based consistency:

| Component | Updated Final Fusion Weight |
|---|---:|
| Pre-segment final score | 75% |
| Segment-based overall score | 25% |

Rationale:

- ayah segment timing is meaningful in tarannum training
- segment-level improvement should move the final score visibly
- segments should influence the score without completely dominating it

## Frontend Score Breakdown Labels

The frontend should avoid presenting the score as a full tajwid or pronunciation judgment.

Approved student-facing Score Breakdown labels:

| Label | Student Explanation | Technical Source |
|---|---|---|
| Pitch Contour | Alunan suara: naik, turun, mendatar, lenggok | Pitch contour similarity |
| Ayat Timing | Masa bacaan ayat: mula ayat, pertukaran ayat, panjang pendek bacaan | Segment or ayat consistency score |
| Tonal / Maqam Pattern | Corak nada: rasa maqam dan arah nada bacaan | Chroma score, with fallback to audio feature score |
| Audio Clarity | Kejelasan bacaan: suara jelas, sebutan dapat dikesan, corak audio kemas | MFCC score, with fallback to audio feature score |
| Mic Stability | Kualiti rakaman: signal mic stabil, bersih, tidak terlalu bising atau putus-putus | Spectral contrast, ZCR, and Tonnetz average, with fallback to audio feature score |

Avoid implying that the score fully verifies Quran correctness, tajwid correctness, or pronunciation correctness. Those require a more specialized correctness engine and teacher review.

Student-facing note:

> Graph menunjukkan bentuk pitch/alunan. Markah akhir turut mengambil kira timing ayat, corak tonal, kejelasan audio dan kestabilan mikrofon.

This note is important because a graph that looks visually close may still lose marks in timing, tonal pattern, audio clarity, or mic stability. A graph that looks less smooth may still score better if the measurable timing and audio components are stronger.

## Ayat Feedback

The old student-facing `Segment Feedback` label should be renamed to `Ayat Feedback`.

Ayat Feedback should not be generated from score percentage only. It should use:

- ayat or segment score
- the main detected issue, when available

Example outputs:

| Example | Meaning |
|---|---|
| Ayat 1: 72% - Alunan baik, timing sedikit lambat | Score is acceptable, but the main issue is timing |
| Ayat 2: 65% - Mula ayat hampir tepat | Timing is close enough, but still has room to improve |
| Ayat 3: 58% - Pitch kurang stabil | Main detected issue is pitch stability |

Known issue codes may include:

| Issue Code | Student-Facing Meaning |
|---|---|
| pitch_too_high | Alunan cenderung terlalu tinggi |
| pitch_too_low | Alunan cenderung terlalu rendah |
| timing_too_slow | Timing sedikit lambat berbanding rujukan |
| timing_too_fast | Timing sedikit cepat berbanding rujukan |

## Segment Breakdown Visibility

The old `Segment Breakdown` panel showed raw timestamp ranges and progress bars. This should be hidden from the main student-facing result because students practise by ayat, not by arbitrary timestamp range.

Segment-level data may still remain in the backend response and may still be used internally for scoring, debugging, teacher tools, or future admin review. It should not be the primary explanation shown to students.

## Assessment Validity Gate

The assessment must not rely on pitch contour alone in future certification-grade scoring. A student can create a visible red wave or high pitch-contour score without actually reciting the expected ayat.

For V2 graph-only scoring, this gate is kept as diagnostic metadata only. It must not cap or boost the final score while the graph-only baseline is being tested.

The gate uses the same components shown in Score Breakdown:

| Signal | Role In Validity Gate |
|---|---|
| Pitch Contour | Confirms whether the visible melodic shape follows the reference |
| Ayat Timing | Confirms whether the attempt follows the ayat timing structure |
| Tonal / Maqam Pattern | Helps detect whether the tonal pattern resembles recitation, not just arbitrary sound |
| Audio Clarity | Helps detect whether the audio is clear enough to assess |
| Mic Stability | Helps explain recording quality; should warn more than punish unless combined with weak tonal/clarity signals |

Historical validity rules from the previous experiment:

| Condition | Action |
|---|---|
| Pitch Contour >= 70, Tonal / Maqam Pattern < 25, Audio Clarity < 30 | Previously marked as invalid/requires review and capped score at 45% |
| Tonal / Maqam Pattern < 28, Audio Clarity < 32, Mic Stability < 22 | Previously marked as review and capped score at 48% |
| Pitch Contour >= 90, Ayat Timing >= 55, Tonal / Maqam Pattern >= 25, Audio Clarity >= 30, and score < 60 | Previously treated as valid improvement and raised the minimum displayed score to 60% |

Rationale:

- high pitch contour alone is not enough proof of valid recitation
- however, these rules made scoring too complicated for the current training baseline
- future validity gates should be reintroduced only after V2 graph-only scoring is trusted

Student-facing messages should be non-accusatory. Preferred wording:

> Sistem mengesan pitch/alunan, tetapi corak audio tidak cukup menyerupai bacaan rujukan untuk assessment yang adil.

or:

> Rakaman dikesan kurang stabil sebagai bacaan ayat. Sila rakam semula dengan suara yang lebih jelas.

## Current Implementation Notes

Current implementation exposes diagnostic fields such as:

- scoringVersion
- pitch
- timing
- pronunciation, retained as a legacy compatibility key
- consistency
- audioMatch
- pitchContour
- ayatTiming
- graphStability
- tonalPattern
- audioClarity
- micStability
- featureScores
- assessmentValidity
- rawBase
- rawPitch
- segmentOverall
- finalAfterSegmentFusion
- weights
- ayat_feedback

The legacy `pronunciation` field should be treated as audio feature match, not a complete pronunciation or tajwid verdict.

## Future Tuning Principles

Future score changes should follow these rules:

1. Assessment Score remains Recording Mode only.
2. Practice Mode should not introduce a separate practice score unless a future product decision approves it.
3. The score should respond to visible graph improvement.
4. Pitch contour and ayah timing should be meaningful scoring signals.
5. Device-sensitive audio features should not dominate the score.
6. Silence, very weak signal, or clearly wrong recordings should remain strictly capped.
7. Score explanation shown to students must match the actual scoring behaviour.
8. Any scoring formula change must update this document and the Decision Log.

## Summary

The July 2026 adjustment changes Assessment Score from a stricter audio-feature-heavy model into a more tarannum-aware model.

The goal is not to make scoring artificially easy. The goal is to ensure that genuine improvement visible on the graph is reflected in the final score, while still protecting the system from weak, silent, or wrong recordings.
