import React, { useMemo } from "react";
import { PitchPoint } from "../services/pitchExtractor";

interface LiveHzDisplayProps {
  pitchData: PitchPoint[];
  isFullScreen?: boolean; // Optional: larger display for full-screen mode
  currentTime?: number; // Current playback time for timeline
  referenceDuration?: number; // Total duration for timeline
  progressPercent?: number; // Progress percentage for progress bar
  formatTime?: (seconds: number) => string; // Time formatter function
  theme?: {
    bg: string;
    controlsBg: string;
    border: string;
    text: string;
    textMuted: string;
  }; // Theme classes for timeline styling
}

/**
 * Convert Hz to MIDI note number
 */
const hzToMidi = (hz: number): number => {
  return 12 * Math.log2(hz / 440) + 69;
};

/**
 * Convert MIDI note number to note name (e.g., "A3", "C#4")
 */
const midiToNoteName = (midi: number): string => {
  const notes = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const note = notes[midi % 12];
  const octave = Math.floor((midi - 12) / 12);
  return `${note}${octave}`;
};

const LiveHzDisplay: React.FC<LiveHzDisplayProps> = ({
  pitchData,
  isFullScreen = false,
  currentTime = 0,
  referenceDuration = 0,
  progressPercent = 0,
  formatTime,
  theme,
}) => {
  // Get the latest valid pitch (non-null frequency)
  const latestPitch = useMemo(() => {
    if (pitchData.length === 0) return null;

    // Find the last valid frequency (non-null)
    for (let i = pitchData.length - 1; i >= 0; i--) {
      if (
        pitchData[i].frequency !== null &&
        pitchData[i].frequency !== undefined
      ) {
        return pitchData[i].frequency;
      }
    }
    return null;
  }, [pitchData]);

  // Calculate MIDI note and note name if we have a valid pitch
  const midiNote = useMemo(() => {
    if (latestPitch === null) return null;
    return Math.round(hzToMidi(latestPitch));
  }, [latestPitch]);

  const noteName = useMemo(() => {
    if (midiNote === null) return null;
    return midiToNoteName(midiNote);
  }, [midiNote]);

  // Default time formatter
  const defaultFormatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const timeFormatter = formatTime || defaultFormatTime;

  // Size classes based on full-screen mode - Reduced sizes for better fit
  const containerClass = isFullScreen
    ? "mb-2 px-4 py-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-400/40 rounded-lg shadow-lg backdrop-blur-md"
    : "mb-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg shadow-sm";

  const labelClass = isFullScreen
    ? "text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1"
    : "text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1";

  const hzValueClass = isFullScreen
    ? "text-2xl font-bold text-blue-300 tabular-nums"
    : "text-3xl font-bold text-blue-700 tabular-nums";

  const hzUnitClass = isFullScreen
    ? "text-lg font-medium text-slate-300"
    : "text-lg font-medium text-slate-600";

  const noteValueClass = isFullScreen
    ? "text-xl font-bold text-purple-300"
    : "text-2xl font-bold text-purple-700";

  const dividerClass = isFullScreen
    ? "h-10 w-px bg-slate-400/50"
    : "h-12 w-px bg-slate-300";

  return (
    <div className={containerClass}>
      {/* Full-screen layout with flexbox: timeline left, Live Pitch right, aligned at bottom */}
      {isFullScreen && referenceDuration > 0 && theme ? (
        <div
          className='flex'
          style={{
            display: "flex",
            justifyContent: "space-evenly",
            alignItems: "flex-end",
          }}
        >
          {/* Timeline Section - Left side */}
          <div className={`flex items-center gap-2 min-w-0 ${theme.text}`}>
            <div className={`text-xs font-mono tabular-nums ${theme.text}`}>
              {timeFormatter(currentTime)} / {timeFormatter(referenceDuration)}
            </div>
            <div className='flex items-center gap-1.5'>
              <div
                className={`w-24 sm:w-32 md:w-40 h-1.5 ${theme.bg} rounded-full overflow-hidden border ${theme.border} backdrop-blur-sm`}
              >
                <div
                  className='h-full bg-blue-500 transition-all duration-100'
                  style={{ width: `${progressPercent}%` }}
                  role='progressbar'
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Playback progress: ${Math.round(
                    progressPercent
                  )}%`}
                />
              </div>
            </div>
          </div>

          {/* Live Pitch Display - Right side */}
          <div className='text-center'>
            <div className={labelClass}>Live Pitch</div>
            <div className='flex items-baseline gap-2'>
              <span className={hzValueClass}>
                {latestPitch !== null ? latestPitch.toFixed(1) : "---"}
              </span>
              <span className={hzUnitClass}>Hz</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Non-fullscreen layout */}
          {/* Timeline Section - Only shown in full-screen mode */}
          {isFullScreen && referenceDuration > 0 && theme && (
            <div
              className={`mb-3 flex items-center justify-between ${theme.text}`}
            >
              <div className='flex items-center gap-2'>
                <div className={`text-xs font-mono tabular-nums ${theme.text}`}>
                  {timeFormatter(currentTime)} /{" "}
                  {timeFormatter(referenceDuration)}
                </div>
                <div className='flex items-center gap-1.5'>
                  <div
                    className={`w-24 sm:w-32 md:w-40 h-1.5 ${theme.bg} rounded-full overflow-hidden border ${theme.border} backdrop-blur-sm`}
                  >
                    <div
                      className='h-full bg-blue-500 transition-all duration-100'
                      style={{ width: `${progressPercent}%` }}
                      role='progressbar'
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Playback progress: ${Math.round(
                        progressPercent
                      )}%`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Pitch Display */}
          <div className='flex items-center justify-center gap-3 sm:gap-6 flex-wrap'>
            <div className='text-center'>
              <div className={labelClass}>Live Pitch</div>
              <div className='flex items-baseline gap-2'>
                <span className={hzValueClass}>
                  {latestPitch !== null ? latestPitch.toFixed(1) : "---"}
                </span>
                <span className={hzUnitClass}>Hz</span>
              </div>
            </div>

            {noteName && <div className={dividerClass}></div>}

            {noteName && (
              <div className='text-center'>
                <div className={labelClass}>Note</div>
                <div className={noteValueClass}>{noteName}</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Pulse animation when pitch is detected - Smaller in full-screen */}
      {latestPitch !== null && (
        <div
          className={`${
            isFullScreen ? "mt-1" : "mt-2"
          } flex items-center justify-center gap-1.5`}
        >
          <div
            className={`${
              isFullScreen ? "w-2 h-2" : "w-2 h-2"
            } bg-green-500 rounded-full animate-pulse`}
          ></div>
          <span
            className={
              isFullScreen
                ? "text-[10px] text-slate-300"
                : "text-xs text-slate-500"
            }
          >
            Pitch detected
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveHzDisplay;
