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
      className={`w-full px-3 sm:px-6 py-3 sm:py-4 ${theme.bg} border-t ${theme.border} mt-2 sm:mt-3 max-h-[30vh] overflow-y-auto`}
      role="region"
      aria-label="Quranic text display"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto">
        {/* Current Verse - Large and Highlighted */}
        <div className="mb-3 sm:mb-4">
          <div
            className={`text-2xl sm:text-3xl lg:text-4xl font-medium ${theme.text} leading-relaxed text-center py-3 sm:py-4 px-3 sm:px-6 rounded-lg bg-emerald-900/30 border-2 border-emerald-500/50 shadow-lg`}
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
          <div className="mt-2 sm:mt-3">
            <div
              className={`text-xl sm:text-2xl lg:text-3xl font-medium ${theme.textMuted} leading-relaxed text-center py-2.5 sm:py-3 px-3 sm:px-5 rounded-lg bg-slate-800/30 border border-slate-600/30`}
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

