import React, { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Target, RotateCcw, X } from "lucide-react";
import { formatSegmentScore, formatSegmentRange } from "../utils/scoreFormat";

interface Segment {
  start: number;
  end: number;
  score: number;
  accuracy: "high" | "medium" | "low";
}

interface SegmentPracticeProps {
  referenceUrl: string;
  studentBlob: Blob;
  segments: Segment[];
  onSegmentComplete?: (segmentIndex: number) => void;
}

const SegmentPractice: React.FC<SegmentPracticeProps> = ({
  referenceUrl,
  studentBlob,
  segments,
  onSegmentComplete,
}) => {
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(
    null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const refWaveSurferRef = useRef<WaveSurfer | null>(null);
  const studentWaveSurferRef = useRef<WaveSurfer | null>(null);
  const refContainerRef = useRef<HTMLDivElement>(null);
  const studentContainerRef = useRef<HTMLDivElement>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  // Initialize reference waveform
  useEffect(() => {
    if (!refContainerRef.current || !referenceUrl) return;

    const ws = WaveSurfer.create({
      container: refContainerRef.current,
      waveColor: "#94a3b8",
      progressColor: "#059669",
      height: 60,
      normalize: true,
      interact: false,
    });

    refWaveSurferRef.current = ws;

    ws.on("error", (error: any) => {
      // Ignore AbortError - it's expected during component cleanup
      if (
        error?.name !== "AbortError" &&
        error?.message !== "signal is aborted without reason"
      ) {
        console.warn("Reference WaveSurfer error in SegmentPractice:", error);
      }
    });

    ws.on("ready", () => {
      if (studentWaveSurferRef.current) {
        setIsReady(true);
      }
    });

    ws.load(referenceUrl).catch((error) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error.name !== "AbortError") {
        console.warn("Error loading reference in SegmentPractice:", error);
      }
    });
    return () => {
      try {
        if (ws) {
          ws.stop();
          ws.destroy();
        }
      } catch (e: any) {
        // Ignore AbortError - it's expected during cleanup
        if (e?.name !== "AbortError") {
          console.warn(
            "Error destroying reference WaveSurfer in SegmentPractice:",
            e
          );
        }
      }
    };
  }, [referenceUrl]);

  // Initialize student waveform
  useEffect(() => {
    if (!studentContainerRef.current || !studentBlob) return;

    const ws = WaveSurfer.create({
      container: studentContainerRef.current,
      waveColor: "#94a3b8",
      progressColor: "#3b82f6",
      height: 60,
      normalize: true,
      interact: false,
    });

    studentWaveSurferRef.current = ws;

    ws.on("error", (error: any) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error?.name !== "AbortError") {
        console.warn("Student WaveSurfer error in SegmentPractice:", error);
      }
    });

    ws.on("ready", () => {
      if (refWaveSurferRef.current) {
        setIsReady(true);
      }
    });

    const blobUrl = URL.createObjectURL(studentBlob);
    ws.load(blobUrl).catch((error) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error?.name !== "AbortError") {
        console.warn("Error loading student blob in SegmentPractice:", error);
      }
      URL.revokeObjectURL(blobUrl);
    });

    return () => {
      try {
        if (ws) {
          ws.stop();
          ws.destroy();
        }
      } catch (e: any) {
        // Ignore AbortError - it's expected during cleanup
        if (e?.name !== "AbortError") {
          console.warn(
            "Error destroying student WaveSurfer in SegmentPractice:",
            e
          );
        }
      }
      URL.revokeObjectURL(blobUrl);
    };
  }, [studentBlob]);

  // Find the lowest scoring segment
  const getLowestSegment = (): number => {
    if (segments.length === 0) return -1;
    let lowestIndex = 0;
    let lowestScore = segments[0].score;

    segments.forEach((seg, idx) => {
      if (seg.score < lowestScore) {
        lowestScore = seg.score;
        lowestIndex = idx;
      }
    });

    return lowestIndex;
  };

  const startSegmentPractice = (segmentIndex: number) => {
    if (
      !isReady ||
      !refWaveSurferRef.current ||
      !studentWaveSurferRef.current
    ) {
      console.warn("Waveforms not ready yet");
      return;
    }

    // Clear any existing timeout
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }

    setCurrentSegmentIndex(segmentIndex);
    const segment = segments[segmentIndex];

    const refDuration = refWaveSurferRef.current.getDuration();
    const studentDuration = studentWaveSurferRef.current.getDuration();

    if (refDuration > 0 && studentDuration > 0) {
      // Detect if segments are normalized (0-1) or absolute (seconds)
      // If start/end values are > 1, they're likely in seconds (absolute)
      // If start/end values are <= 1, they're likely normalized (0-1)
      const isNormalized = segment.start <= 1 && segment.end <= 1;
      
      let normalizedStart: number;
      let normalizedEnd: number;
      let segmentDuration: number;

      if (isNormalized) {
        // Segments are already normalized (0-1)
        normalizedStart = segment.start;
        normalizedEnd = segment.end;
        segmentDuration = (segment.end - segment.start) * refDuration;
      } else {
        // Segments are in absolute seconds - convert to normalized
        normalizedStart = segment.start / refDuration;
        normalizedEnd = segment.end / refDuration;
        segmentDuration = segment.end - segment.start;
        
        // Clamp to valid range
        normalizedStart = Math.max(0, Math.min(1, normalizedStart));
        normalizedEnd = Math.max(normalizedStart, Math.min(1, normalizedEnd));
      }

      // Seek to segment start (using normalized values)
      refWaveSurferRef.current.seekTo(normalizedStart);
      studentWaveSurferRef.current.seekTo(normalizedStart);

      // Play segment
      refWaveSurferRef.current.play();
      studentWaveSurferRef.current.play();
      setIsPlaying(true);

      // Stop at segment end
      stopTimeoutRef.current = window.setTimeout(() => {
        refWaveSurferRef.current?.pause();
        studentWaveSurferRef.current?.pause();
        setIsPlaying(false);
        if (onSegmentComplete) {
          onSegmentComplete(segmentIndex);
        }
      }, segmentDuration * 1000);
    }
  };

  const stopSegmentPractice = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (refWaveSurferRef.current) refWaveSurferRef.current.pause();
    if (studentWaveSurferRef.current) studentWaveSurferRef.current.pause();
    setIsPlaying(false);
    setCurrentSegmentIndex(null);
  };

  const handlePracticeLowest = () => {
    const lowestIdx = getLowestSegment();
    if (lowestIdx >= 0) {
      startSegmentPractice(lowestIdx);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
    };
  }, []);

  if (segments.length === 0) return null;

  return (
    <div className='space-y-2'>
      {/* Hidden waveform containers for playback */}
      <div className='hidden'>
        <div ref={refContainerRef}></div>
        <div ref={studentContainerRef}></div>
      </div>
      <div className='bg-amber-50 border border-amber-200 rounded-lg p-3'>
        <h3 className='font-semibold text-amber-800 mb-2 flex items-center gap-2'>
          <Target size={18} />
          Adaptive Learning - Practice Low-Score Segments
        </h3>
        <p className='text-sm text-amber-700 mb-4'>
          Focus on segments that need improvement. Practice them individually to
          master the recitation.
        </p>

        <button
          onClick={handlePracticeLowest}
          disabled={isPlaying || !isReady}
          className='px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all'
        >
          {!isReady ? "Loading..." : "Practice Lowest Score Segment"}
        </button>
      </div>

      {/* Segment List */}
      <div className='space-y-2'>
        <h4 className='font-medium text-slate-700 text-sm'>All Segments:</h4>
        {segments.map((segment, idx) => {
          const isActive = currentSegmentIndex === idx;
          const color =
            segment.accuracy === "high"
              ? "green"
              : segment.accuracy === "medium"
              ? "yellow"
              : "red";
          const bgColor =
            segment.accuracy === "high"
              ? "bg-green-50"
              : segment.accuracy === "medium"
              ? "bg-yellow-50"
              : "bg-red-50";
          const borderColor =
            segment.accuracy === "high"
              ? "border-green-300"
              : segment.accuracy === "medium"
              ? "border-yellow-300"
              : "border-red-300";
          const displayScore = formatSegmentScore(segment.score);
          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${bgColor} ${borderColor} ${
                isActive ? "ring-2 ring-blue-500" : ""
              } flex items-center justify-between transition-all`}
            >
              <div className='flex items-center gap-3'>
                <div className={`w-3 h-3 rounded-full bg-${color}-500`}></div>
                <div>
                  <div className='font-medium text-slate-700 text-sm'>
                    Segment {idx + 1} ({formatSegmentRange(segment)})
                  </div>
                  <div className='text-xs text-slate-500'>
                    Score: {displayScore}% | {segment.accuracy.toUpperCase()}{" "}
                    accuracy
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  isActive ? stopSegmentPractice() : startSegmentPractice(idx)
                }
                disabled={(isPlaying && !isActive) || !isReady}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-all ${
                  isActive
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                {isActive ? (
                  <span className='flex items-center gap-1'>
                    <X size={14} /> Stop
                  </span>
                ) : (
                  <span className='flex items-center gap-1'>
                    <Play size={14} fill='currentColor' /> Practice
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {currentSegmentIndex !== null && (
        <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
          <div className='flex items-center justify-between'>
            <span className='font-medium text-blue-800 flex items-center gap-2'>
              <Target size={16} />
              Practicing Segment {currentSegmentIndex + 1} (
              {formatSegmentScore(segments[currentSegmentIndex].score)}% accuracy)
            </span>
            <button
              onClick={stopSegmentPractice}
              className='text-sm text-blue-600 hover:text-blue-800 font-medium'
            >
              Stop Practice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SegmentPractice;
