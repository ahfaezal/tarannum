import React from "react";
import { AyahTiming } from "../types";

interface FullScreenAyahTextDisplayProps {
  ayatTiming: AyahTiming[];
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  theme?: {
    text: string;
    textMuted: string;
    bg: string;
    border: string;
  };
  compact?: boolean;
}

/**
 * Enhanced Quranic Text Display for Full-Screen Mode
 * Shows current verse (highlighted) and next verse (preview)
 * Large, clear text optimized for practice
 */
const FullScreenAyahTextDisplay: React.FC<FullScreenAyahTextDisplayProps> = ({
  ayatTiming,
  currentTime,
  duration,
  onSeek,
  theme = {
    text: "text-slate-300",
    textMuted: "text-slate-400",
    bg: "bg-slate-900",
    border: "border-slate-700",
  },
  compact = false,
}) => {
  if (!ayatTiming || ayatTiming.length === 0) {
    return null;
  }

  // Find the current active segment
  const activeSegmentIndex = ayatTiming.findIndex(
    (ayah) => currentTime >= ayah.start && currentTime < ayah.end
  );

  // Get current verse and next verse
  const currentVerse =
    activeSegmentIndex >= 0 ? ayatTiming[activeSegmentIndex] : null;
  const nextVerse =
    activeSegmentIndex >= 0 && activeSegmentIndex < ayatTiming.length - 1
      ? ayatTiming[activeSegmentIndex + 1]
      : null;

  // If no current verse found, show first verse as preview
  const displayCurrentVerse = currentVerse || ayatTiming[0];
  const displayNextVerse = nextVerse || (activeSegmentIndex < 0 && ayatTiming.length > 0 ? ayatTiming[0] : null);

  const handleVerseClick = (ayah: AyahTiming) => {
    if (onSeek) {
      onSeek(ayah.start);
    }
  };

  return (
    <div
      className={`w-full flex-shrink-0 px-3 sm:px-6 ${compact ? "py-1 mt-1 max-h-none overflow-visible" : "py-3 sm:py-4 mt-2 sm:mt-3 max-h-[30vh] overflow-y-auto"} ${theme.bg} border-t ${theme.border}`}
      role="region"
      aria-label="Quranic text display"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto">
        {/* Current Verse - Large and Highlighted */}
        <div className={compact ? "mb-1" : "mb-3 sm:mb-4"}>
          <div
            className={`${compact ? "text-lg sm:text-xl lg:text-2xl py-1.5 px-3 sm:px-5 leading-normal" : "text-2xl sm:text-3xl lg:text-4xl py-3 sm:py-4 px-3 sm:px-6 leading-relaxed"} font-medium ${theme.text} text-center rounded-lg bg-emerald-900/30 border-2 border-emerald-500/50 shadow-lg`}
            style={{
              fontFamily:
                'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif',
              direction: "rtl",
              unicodeBidi: "embed",
            }}
            dir="rtl"
          >
            {displayCurrentVerse?.text && displayCurrentVerse.text.trim() ? (
              <span>{displayCurrentVerse.text}</span>
            ) : (
              <span className={theme.textMuted}>
                [{displayCurrentVerse?.start.toFixed(1)}s -{" "}
                {displayCurrentVerse?.end.toFixed(1)}s]
              </span>
            )}
          </div>
        </div>

        {/* Next Verse - Preview (Smaller) */}
        {displayNextVerse && displayNextVerse !== displayCurrentVerse && (
          <div className={compact ? "mt-1" : "mt-2 sm:mt-3"}>
            <div
              className={`${compact ? "text-base sm:text-lg lg:text-xl py-1.5 px-3 sm:px-4 leading-normal" : "text-xl sm:text-2xl lg:text-3xl py-2.5 sm:py-3 px-3 sm:px-5 leading-relaxed"} font-medium ${theme.textMuted} text-center rounded-lg bg-slate-800/30 border border-slate-600/30`}
              style={{
                fontFamily:
                  'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif',
                direction: "rtl",
                unicodeBidi: "embed",
              }}
              dir="rtl"
              onClick={() => handleVerseClick(displayNextVerse)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleVerseClick(displayNextVerse);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {displayNextVerse.text && displayNextVerse.text.trim() ? (
                <span>{displayNextVerse.text}</span>
              ) : (
                <span className={theme.textMuted}>
                  [{displayNextVerse.start.toFixed(1)}s -{" "}
                  {displayNextVerse.end.toFixed(1)}s]
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FullScreenAyahTextDisplay;

