import React from "react";
import { AyahTiming } from "../types";

interface AyahTextDisplayProps {
  ayatTiming: AyahTiming[];
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
}

const AyahTextDisplay: React.FC<AyahTextDisplayProps> = ({
  ayatTiming,
  currentTime,
  duration,
  onSeek,
}) => {
  // Don't return null - always show if timing data exists
  // Even if text is empty, show time segments for practice guidance
  if (!ayatTiming || ayatTiming.length === 0) {
    return null;
  }

  // Sort segments by 'start' field to ensure chronological order
  const sortedAyatTiming = [...ayatTiming].sort((a, b) => (a.start || 0) - (b.start || 0));

  // Debug: Log segment information
  if (sortedAyatTiming.length > 0) {
    const segmentsWithText = sortedAyatTiming.filter(
      (a) => a.text && a.text.trim()
    ).length;
    const totalDuration = sortedAyatTiming[sortedAyatTiming.length - 1]?.end || 0;
    console.log(
      `[AyahTextDisplay] Rendering ${
        sortedAyatTiming.length
      } segments (${segmentsWithText} with text, ${
        sortedAyatTiming.length - segmentsWithText
      } empty), duration: ${totalDuration.toFixed(2)}s (sorted by start)`
    );
    console.log(`[AyahTextDisplay] All segments (sorted):`, sortedAyatTiming);
  } else {
    console.warn(`[AyahTextDisplay] No segments to render!`);
  }

  // Find the current active segment
  const activeSegmentIndex = sortedAyatTiming.findIndex(
    (ayah) => currentTime >= ayah.start && currentTime < ayah.end
  );

  const handleSegmentClick = (ayah: AyahTiming) => {
    if (onSeek) {
      onSeek(ayah.start);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, ayah: AyahTiming) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSegmentClick(ayah);
    }
  };

  return (
    <div
      className='mt-4 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200'
      role='region'
      aria-label='Quranic text with timing'
      dir='rtl' // RTL direction for the container to enable right-to-left row flow
    >
      <h4
        className='text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider'
        id='ayah-text-heading'
        dir='ltr' // Title in LTR (English)
      >
        Quranic Text
      </h4>
      <div
        className='flex flex-wrap gap-2 items-center justify-center'
        role='group'
        aria-labelledby='ayah-text-heading'
        dir='rtl' // RTL direction so each row flows right-to-left
        style={{
          direction: "rtl", // Explicit RTL for button layout - rows flow right-to-left
          flexDirection: "row", // Row direction (RTL will reverse the visual order)
        }}
      >
        {sortedAyatTiming.map((ayah, index) => {
          const isActive = index === activeSegmentIndex;
          const isPast = currentTime >= ayah.end;
          const isFuture = currentTime < ayah.start;
          const hasText = ayah.text && ayah.text.trim() !== "";

          return (
            <button
              key={`segment-${ayah.start}-${ayah.end}-${index}`}
              onClick={() => handleSegmentClick(ayah)}
              onKeyDown={(e) => handleKeyDown(e, ayah)}
              className={`
                min-h-[44px] px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg text-base sm:text-lg font-medium transition-all duration-300 ease-in-out
                border-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 touch-manipulation
                ${
                  isActive
                    ? "bg-emerald-100 border-emerald-400 text-emerald-800 shadow-md scale-105 font-semibold"
                    : isPast
                    ? "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
                }
                ${!hasText ? "opacity-60" : ""}
              `}
              style={{
                direction: "rtl", // Right-to-left for Arabic text
                fontFamily:
                  'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif',
                unicodeBidi: "embed", // Ensure proper Arabic text rendering
              }}
              aria-label={`${
                hasText ? ayah.text : `Segment ${index + 1}`
              }. Time range: ${ayah.start.toFixed(1)} to ${ayah.end.toFixed(
                1
              )} seconds. ${
                isActive ? "Currently playing" : "Click to seek to this segment"
              }`}
              aria-pressed={isActive}
              title={`Click to seek to ${ayah.start.toFixed(
                1
              )}s - ${ayah.end.toFixed(1)}s`}
            >
              {hasText ? (
                <span dir='rtl'>{ayah.text}</span>
              ) : (
                <span dir='ltr'>
                  [{ayah.start.toFixed(1)}s - {ayah.end.toFixed(1)}s]
                </span>
              )}
            </button>
          );
        })}
      </div>
      {activeSegmentIndex >= 0 && (
        <div
          className='mt-3 text-xs text-slate-500 text-center'
          role='status'
          aria-live='polite'
          aria-atomic='true'
          dir='ltr' // Time display in LTR
        >
          <span className='font-medium'>
            {sortedAyatTiming[activeSegmentIndex].start.toFixed(1)}s -{" "}
            {sortedAyatTiming[activeSegmentIndex].end.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
};

export default AyahTextDisplay;
