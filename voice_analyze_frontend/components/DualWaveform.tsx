import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Square, RotateCcw } from "lucide-react";
import { formatSegmentScore } from "../utils/scoreFormat";

interface Segment {
  start: number;
  end: number;
  score: number;
  accuracy: "high" | "medium" | "low";
}

interface DualWaveformProps {
  referenceUrl?: string | null;
  referenceBlob?: Blob | null;
  segments?: Segment[];
  onReferenceReady?: (ws: WaveSurfer) => void;
  height?: number;
  hideLabels?: boolean; // Option to hide the reference label
  hideControls?: boolean; // Option to hide the play/stop/restart controls
}

const DualWaveform: React.FC<DualWaveformProps> = ({
  referenceUrl,
  referenceBlob,
  segments = [],
  onReferenceReady,
  height = 100,
  hideLabels = false,
  hideControls = false,
}) => {
  const refContainerRef = useRef<HTMLDivElement>(null);
  const refWaveSurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const updateIntervalRef = useRef<number | null>(null);

  // Get color for segment based on accuracy
  const getSegmentColor = (accuracy: string): string => {
    switch (accuracy) {
      case "high":
        return "#10b981"; // green
      case "medium":
        return "#f59e0b"; // yellow
      case "low":
        return "#ef4444"; // red
      default:
        return "#94a3b8"; // gray
    }
  };

  // Initialize Reference Waveform
  useEffect(() => {
    if (!refContainerRef.current) return;

    const ws = WaveSurfer.create({
      container: refContainerRef.current,
      waveColor: "#94a3b8", // Gray color for unplayed portion
      progressColor: "#059669", // Green color for played portion
      cursorColor: "#333",
      barWidth: 2,
      barRadius: 3,
      height: height,
      normalize: true,
      minPxPerSec: 50,
      interact: true,
      // Use MediaElement backend - it renders waveform once and only updates progress overlay
      // The waveform is drawn ONCE when ready, then only the green progress overlay moves
      // No redrawing of the entire waveform during playback
      backend: "MediaElement",
    });

    refWaveSurferRef.current = ws;

    ws.on("ready", () => {
      const dur = ws.getDuration();
      setDuration(dur);

      // Ensure waveform is visible after loading
      if (refContainerRef.current) {
        refContainerRef.current.style.display = "block";
        refContainerRef.current.style.visibility = "visible";
      }

      // Add regions for error highlighting (if regions plugin is available)
      if (segments.length > 0 && dur > 0) {
        // Check if addRegion method exists (requires regions plugin)
        if (typeof (ws as any).addRegion === "function") {
          segments.forEach((segment) => {
            const startTime = segment.start * dur;
            const endTime = segment.end * dur;
            const color = getSegmentColor(segment.accuracy);

            try {
              (ws as any).addRegion({
                start: startTime,
                end: endTime,
                color: `${color}40`, // 40 = 25% opacity in hex
                drag: false,
                resize: false,
              });
            } catch (e) {
              console.warn("Failed to add region:", e);
            }
          });
        }
      }

      if (onReferenceReady) onReferenceReady(ws);
    });

    // Add progress update listener
    // IMPORTANT: MediaElement backend renders waveform ONCE, then only updates progress overlay
    // The waveform bars are drawn once when ready, then only the green progress overlay moves
    // We just track time for the progress bar below - NO waveform redrawing
    ws.on("timeupdate", (time: number) => {
      setCurrentTime(time);
      // Ensure waveform stays visible during playback
      if (refContainerRef.current) {
        refContainerRef.current.style.display = "block";
        refContainerRef.current.style.visibility = "visible";
      }
      // MediaElement backend automatically updates ONLY the green progress overlay
      // The underlying waveform bars are NOT redrawn - they stay static
      // WaveSurfer handles this efficiently internally
    });

    ws.on("play", () => {
      setIsPlaying(true);
      // Ensure waveform is visible when playing starts
      if (refContainerRef.current) {
        refContainerRef.current.style.display = "block";
        refContainerRef.current.style.visibility = "visible";
      }
    });
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      const dur = ws.getDuration();
      if (dur) setCurrentTime(dur);
    });

    let refBlobUrl: string | null = null;

    ws.on("error", (error) => {
      console.warn("Reference WaveSurfer error:", error);
    });

    if (referenceUrl) {
      ws.load(referenceUrl).catch((error) => {
        console.warn("Error loading reference URL:", error);
      });
    } else if (referenceBlob) {
      refBlobUrl = URL.createObjectURL(referenceBlob);
      ws.load(refBlobUrl).catch((error) => {
        console.warn("Error loading reference blob:", error);
        if (refBlobUrl) {
          URL.revokeObjectURL(refBlobUrl);
        }
      });
    }

    return () => {
      try {
        if (ws) {
          ws.stop();
          ws.destroy();
        }
      } catch (e) {
        console.warn("Error destroying reference WaveSurfer:", e);
      }
      if (refBlobUrl) {
        URL.revokeObjectURL(refBlobUrl);
      }
    };
  }, [referenceUrl, referenceBlob, height, segments, onReferenceReady]);

  // Update progress during playback
  // IMPORTANT: We ONLY track currentTime for the progress bar below
  // We do NOT call seekTo or any method that would redraw the waveform
  // MediaElement backend handles progress overlay automatically without redrawing
  useEffect(() => {
    if (isPlaying && refWaveSurferRef.current) {
      updateIntervalRef.current = window.setInterval(() => {
        if (refWaveSurferRef.current) {
          try {
            const time = refWaveSurferRef.current.getCurrentTime();
            setCurrentTime(time);

            // CRITICAL: Do NOT call seekTo() or any method that would redraw the waveform
            // MediaElement backend automatically updates ONLY the progress overlay
            // The waveform bars are drawn ONCE and stay static - only green overlay moves
          } catch (e: any) {
            // Specifically handle AbortError and ignore it
            if (
              e?.name !== "AbortError" &&
              e?.message !== "BodyStreamBuffer was aborted" &&
              e?.message !== "signal is aborted without reason"
            ) {
              // Only log non-AbortError errors
            }
          }
        }
      }, 100); // Update every 100ms for time display only (waveform is NOT redrawn)
    } else {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    }

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [isPlaying, duration]);

  const handlePlayPause = () => {
    if (refWaveSurferRef.current) {
      if (isPlaying) {
        refWaveSurferRef.current.pause();
      } else {
        refWaveSurferRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStop = () => {
    if (refWaveSurferRef.current) {
      refWaveSurferRef.current.stop();
      refWaveSurferRef.current.seekTo(0);
    }
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleRepeat = () => {
    if (refWaveSurferRef.current) {
      refWaveSurferRef.current.seekTo(0);
      refWaveSurferRef.current.play();
    }
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className='space-y-4'>
      {/* Reference Waveform */}
      <div>
        {!hideLabels && (
          <div className='text-xs font-medium text-emerald-700 mb-2 flex items-center gap-2'>
            <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
            Reference Audio
          </div>
        )}
        <div
          ref={refContainerRef}
          className='w-full'
          style={{
            minHeight: `${height}px`,
            height: `${height}px`,
            position: "relative", // Ensure progress bar is positioned correctly
            overflow: "visible", // Allow progress to be visible
            display: "block", // Always visible
            visibility: "visible", // Always visible
          }}
        />

        {/* Progress Bar Below Waveform - Visual indicator of playback progress */}
        {duration > 0 && (
          <div className='w-full mt-2'>
            <div className='w-full bg-slate-200 rounded-full h-1.5 overflow-hidden'>
              <div
                className='bg-emerald-600 h-full transition-all duration-100'
                style={{
                  width:
                    duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
                }}
                role='progressbar'
                aria-valuenow={
                  duration > 0 ? (currentTime / duration) * 100 : 0
                }
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Playback progress: ${Math.round(
                  (currentTime / duration) * 100
                )}%`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Student waveform removed - not used */}

      {/* Visual Segment Indicator */}
      {segments.length > 0 && duration > 0 && (
        <div className='space-y-2'>
          <div className='text-xs font-medium text-slate-600 mb-2'>
            Accuracy Segments:
          </div>
          <div className='relative w-full h-8 bg-slate-100 rounded-lg overflow-hidden'>
            {segments.map((segment, idx) => {
              const width = (segment.end - segment.start) * 100;
              const left = segment.start * 100;
              const color = getSegmentColor(segment.accuracy);

              return (
                <div
                  key={idx}
                  className='absolute h-full transition-all'
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: color,
                    opacity: 0.6,
                  }}
                  title={`Segment ${idx + 1}: ${formatSegmentScore(segment.score)}% (${
                    segment.accuracy
                  })`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {segments.length > 0 && (
        <div className='flex items-center justify-center gap-4 text-xs bg-slate-50 p-3 rounded-lg'>
          <div className='flex items-center gap-1.5'>
            <div className='w-3 h-3 rounded bg-green-500'></div>
            <span className='text-slate-600'>High (≥80%)</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <div className='w-3 h-3 rounded bg-yellow-500'></div>
            <span className='text-slate-600'>Medium (50-79%)</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <div className='w-3 h-3 rounded bg-red-500'></div>
            <span className='text-slate-600'>Low (&lt;50%)</span>
          </div>
        </div>
      )}

      {/* Controls - Hidden when hideControls is true */}
      {!hideControls && (
        <>
          <div className='flex items-center justify-center gap-2'>
            <button
              onClick={handlePlayPause}
              className='flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95'
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={18} fill='currentColor' />
              ) : (
                <Play size={18} fill='currentColor' />
              )}
            </button>
            <button
              onClick={handleStop}
              className='flex items-center justify-center w-10 h-10 rounded-full bg-slate-600 hover:bg-slate-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95'
              title='Stop'
            >
              <Square size={14} fill='currentColor' />
            </button>
            <button
              onClick={handleRepeat}
              className='flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95'
              title='Repeat'
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Time Display */}
          <div className='flex items-center justify-between text-xs text-slate-600 px-2'>
            <span>{formatTime(currentTime)}</span>
            <span className='text-slate-400'>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default DualWaveform;
