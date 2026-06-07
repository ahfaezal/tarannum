/**
 * Shared scoring display utilities.
 * Ensures all segment and overall scores are shown as normalized 0-100%
 * and segment time ranges are displayed correctly (not as 0-6100% when in seconds).
 */

/** Clamp score to 0-100. Segment scores must never exceed 100%. */
export function clampSegmentScore(score: number): number {
  if (score === null || score === undefined || isNaN(score) || !isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Number(score)));
}

/**
 * Format a segment or overall score for display (Milestone 5).
 * Always show whole-number percentages for consistency across the app.
 * @returns String e.g. "85" — append "%" in UI for "85%".
 */
export function formatSegmentScore(score: number): string {
  const normalized = clampSegmentScore(score);
  return String(Math.round(normalized));
}

/**
 * Format score with percent sign for consistent display (e.g. "85%").
 */
export function formatScoreWithPercent(score: number): string {
  return `${formatSegmentScore(score)}%`;
}

/**
 * Format segment time range for display.
 * Backend may send start/end as normalized (0-1) or as seconds.
 * Avoids showing "0-6100%" when end is 61 seconds.
 * @returns e.g. "0-20%" (normalized) or "0.0s - 61.0s" (seconds)
 */
export function formatSegmentRange(seg: { start: number; end: number }): string {
  const start = Number(seg.start);
  const end = Number(seg.end);
  if (end > 1.5) {
    // Treat as seconds
    return `${start.toFixed(1)}s – ${end.toFixed(1)}s`;
  }
  // Normalized 0-1: show as percentage of clip
  return `${Math.round(start * 100)}–${Math.round(end * 100)}%`;
}
