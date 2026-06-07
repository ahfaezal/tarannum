import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, RotateCcw } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { PitchData, AyahTiming } from "../types";
import AyahTextDisplay from "./AyahTextDisplay";
import { formatSegmentScore } from "../utils/scoreFormat";

interface Segment {
  start: number;
  end: number;
  score: number;
  accuracy: "high" | "medium" | "low";
}

interface PitchComparisonProps {
  referenceUrl?: string | null;
  referenceBlob?: Blob | null;
  studentBlob?: Blob | null;
  segments?: Segment[];
  pitchData?: {
    reference: PitchData[];
    student: PitchData[];
    errorPoints?: number[];
  };
  ayatTiming?: AyahTiming[];
  onReferenceReady?: (ws: WaveSurfer) => void;
  onStudentReady?: (ws: WaveSurfer) => void;
  height?: number;
}

const PitchComparison: React.FC<PitchComparisonProps> = ({
  referenceUrl,
  referenceBlob,
  studentBlob,
  segments = [],
  pitchData,
  ayatTiming = [],
  onReferenceReady,
  onStudentReady,
  height = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refWaveSurferRef = useRef<WaveSurfer | null>(null);
  const studentWaveSurferRef = useRef<WaveSurfer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const updateIntervalRef = useRef<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    segment?: Segment;
    pitchDiff?: number;
  } | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // Utility functions
  const hzToMidi = (freq: number): number => {
    return 69 + 12 * Math.log2(freq / 440);
  };

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
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[Math.round(midi) % 12];
    return `${note}${octave}`;
  };

  const centsDifference = (f1: number, f2: number): number => {
    if (f1 <= 0 || f2 <= 0) return Infinity;
    return 1200 * Math.log2(f2 / f1);
  };

  // Smooth interpolation using multi-pass smoothing for smoother, curvilinear results
  // Enhanced for tarannum training to match requirement for very smooth melodic flow
  const smoothCurve = (
    points: Array<{ time: number; pitch: number | null }>,
    tension: number = 0.8,
    passes: number = 2 // Multiple passes for smoother curves
  ): Array<{ x: number; y: number }> => {
    if (points.length < 2) {
      return points
        .filter((p) => p.pitch !== null)
        .map((p) => ({ x: p.time, y: p.pitch! }));
    }

    // Filter valid points first
    let currentPoints = points.filter((p) => p.pitch !== null && p.pitch > 0);
    if (currentPoints.length < 2) {
      return currentPoints.map((p) => ({ x: p.time, y: p.pitch! }));
    }

    // Apply multiple passes of smoothing for smoother, more curvilinear result
    for (let pass = 0; pass < passes; pass++) {
      const smoothed: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < currentPoints.length; i++) {
        const p = currentPoints[i];

        // Keep first and last points unchanged
        if (i === 0 || i === currentPoints.length - 1) {
          smoothed.push({ x: p.time, y: p.pitch! });
        } else {
          const prev = currentPoints[i - 1];
          const next = currentPoints[i + 1];

          // Enhanced smoothing: average with neighbors using tension
          // Higher tension (0.8) = more weight on neighbor average = smoother curves
          const smoothedY =
            p.pitch! * (1 - tension) +
            ((prev.pitch! + next.pitch!) / 2) * tension;
          smoothed.push({ x: p.time, y: smoothedY });
        }
      }

      // Update current points for next pass
      currentPoints = smoothed.map((p) => ({ time: p.x, pitch: p.y }));
    }

    return currentPoints.map((p) => ({ x: p.time, y: p.pitch! }));
  };

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        const containerWidth = container.clientWidth;
        // Set actual canvas size (not just CSS)
        canvas.width = containerWidth;
        canvas.height = height;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [height]);

  // Draw pitch curves on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pitchData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 50;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Clear canvas with dark grey background
    ctx.fillStyle = "#1e293b"; // Dark grey
    ctx.fillRect(0, 0, width, height);

    // Get pitch data
    const refPitch = pitchData.reference || [];
    const studentPitch = pitchData.student || [];
    const errorPoints = pitchData.errorPoints || [];

    if (refPitch.length === 0 && studentPitch.length === 0) return;

    // Helper function to get pitch value (supports both old 'pitch' and new 'f_hz' format)
    const getPitchValue = (p: PitchData): number | null => {
      if (p.f_hz !== undefined && p.f_hz !== null && p.f_hz > 0) {
        return p.f_hz;
      }
      // Backward compatibility: use 'pitch' field if f_hz not available
      if (p.pitch !== undefined && p.pitch > 0) {
        return p.pitch;
      }
      return null;
    };

    // Find pitch range (only from voiced frames)
    const allPitches = [...refPitch, ...studentPitch]
      .map((p) => getPitchValue(p))
      .filter((p): p is number => p !== null && p > 0);

    if (allPitches.length === 0) {
      // No pitch data to display
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No pitch data available", width / 2, height / 2);
      return;
    }

    const minPitch = Math.min(...allPitches);
    const maxPitch = Math.max(...allPitches);
    const pitchRange = maxPitch - minPitch || 1;

    // Find time range
    const allTimes = [...refPitch, ...studentPitch].map((p) => p.time);
    const dataMaxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
    const timelineDuration = duration > 0 ? duration : Math.max(dataMaxTime, 1);

    // Draw grid lines
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (graphHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw pitch scale labels (LOW to HIGH) on left with MIDI notes
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const pitch = maxPitch - (pitchRange / 5) * i;
      const y = padding + (graphHeight / 5) * i;
      const midi = hzToMidi(pitch);
      const noteName = midiToNoteName(midi);
      // Show both Hz and MIDI note
      ctx.fillText(`${Math.round(pitch)}Hz`, padding - 10, y - 6);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(noteName, padding - 10, y + 4);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "11px sans-serif";
    }

    // Draw time scale labels on bottom
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const time = (timelineDuration / 5) * i;
      const x = padding + (graphWidth / 5) * i;
      ctx.fillText(`${time.toFixed(1)}s`, x, height - padding + 20);
    }

    // Draw region bands (colored backgrounds based on segment accuracy)
    if (segments && segments.length > 0) {
      segments.forEach((seg, index) => {
        // Convert segment start/end from normalized (0-1) to actual time if needed
        const segStart =
          seg.start < 1 && timelineDuration > 1
            ? seg.start * timelineDuration
            : seg.start;
        const segEnd =
          seg.end <= 1 && timelineDuration > 1
            ? seg.end * timelineDuration
            : seg.end;
        const x1 = padding + (segStart / timelineDuration) * graphWidth;
        const x2 = padding + (segEnd / timelineDuration) * graphWidth;
        const regionWidth = x2 - x1;

        // Color based on accuracy
        let color: string;
        let borderColor: string;
        if (seg.accuracy === "high") {
          color = "rgba(16, 185, 129, 0.15)"; // Green with transparency
          borderColor = "rgba(16, 185, 129, 0.4)";
        } else if (seg.accuracy === "medium") {
          color = "rgba(251, 191, 36, 0.15)"; // Yellow/Amber with transparency
          borderColor = "rgba(251, 191, 36, 0.4)";
        } else {
          color = "rgba(239, 68, 68, 0.15)"; // Red with transparency
          borderColor = "rgba(239, 68, 68, 0.4)";
        }

        // Highlight hovered region
        const isHovered = hoveredRegion === index;
        if (isHovered) {
          ctx.fillStyle = color.replace("0.15", "0.25"); // More opaque on hover
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2;
        } else {
          ctx.fillStyle = color;
        }

        ctx.fillRect(x1, padding, regionWidth, graphHeight);

        // Draw border on hover
        if (isHovered) {
          ctx.strokeRect(x1, padding, regionWidth, graphHeight);
        }

        // Draw score badge on hover
        if (isHovered) {
          const badgeX = x1 + regionWidth / 2;
          const badgeY = padding + 15;
          const badgeWidth = 50;
          const badgeHeight = 16;
          const cornerRadius = 4;

          // Badge background with rounded corners
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)"; // Dark slate
          ctx.beginPath();
          ctx.moveTo(
            badgeX - badgeWidth / 2 + cornerRadius,
            badgeY - badgeHeight / 2
          );
          ctx.lineTo(
            badgeX + badgeWidth / 2 - cornerRadius,
            badgeY - badgeHeight / 2
          );
          ctx.quadraticCurveTo(
            badgeX + badgeWidth / 2,
            badgeY - badgeHeight / 2,
            badgeX + badgeWidth / 2,
            badgeY - badgeHeight / 2 + cornerRadius
          );
          ctx.lineTo(
            badgeX + badgeWidth / 2,
            badgeY + badgeHeight / 2 - cornerRadius
          );
          ctx.quadraticCurveTo(
            badgeX + badgeWidth / 2,
            badgeY + badgeHeight / 2,
            badgeX + badgeWidth / 2 - cornerRadius,
            badgeY + badgeHeight / 2
          );
          ctx.lineTo(
            badgeX - badgeWidth / 2 + cornerRadius,
            badgeY + badgeHeight / 2
          );
          ctx.quadraticCurveTo(
            badgeX - badgeWidth / 2,
            badgeY + badgeHeight / 2,
            badgeX - badgeWidth / 2,
            badgeY + badgeHeight / 2 - cornerRadius
          );
          ctx.lineTo(
            badgeX - badgeWidth / 2,
            badgeY - badgeHeight / 2 + cornerRadius
          );
          ctx.quadraticCurveTo(
            badgeX - badgeWidth / 2,
            badgeY - badgeHeight / 2,
            badgeX - badgeWidth / 2 + cornerRadius,
            badgeY - badgeHeight / 2
          );
          ctx.closePath();
          ctx.fill();

          // Score text
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${formatSegmentScore(seg.score)}%`, badgeX, badgeY);
        }
      });
    }

    // Draw reference pitch curve (Green) with smooth interpolation
    if (refPitch.length > 0) {
      // Prepare points for smoothing
      const refPoints = refPitch.map((p) => ({
        time: p.time,
        pitch: getPitchValue(p),
      }));

      // Smooth the curve - Enhanced multi-pass smoothing for tarannum training (0.8 tension, 2 passes for very smooth curves)
      const smoothedRef = smoothCurve(refPoints, 0.8, 2);

      // Draw high-confidence segments (solid line)
      ctx.strokeStyle = "#10b981"; // Green
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();

      let firstPoint = true;
      smoothedRef.forEach((point, idx) => {
        const originalPoint = refPitch[idx];
        const confidence = originalPoint?.confidence ?? 1.0;

        if (point.y > 0 && confidence > 0.5) {
          const x = padding + (point.x / timelineDuration) * graphWidth;
          const y =
            padding +
            graphHeight -
            ((point.y - minPitch) / pitchRange) * graphHeight;

          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Draw low-confidence segments (dashed line)
      ctx.strokeStyle = "#10b981";
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      firstPoint = true;
      smoothedRef.forEach((point, idx) => {
        const originalPoint = refPitch[idx];
        const confidence = originalPoint?.confidence ?? 1.0;

        if (point.y > 0 && confidence <= 0.5 && confidence > 0) {
          const x = padding + (point.x / timelineDuration) * graphWidth;
          const y =
            padding +
            graphHeight -
            ((point.y - minPitch) / pitchRange) * graphHeight;

          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);
    }

    // Draw student pitch curve (Red) with smooth interpolation
    if (studentPitch.length > 0) {
      // Prepare points for smoothing
      const studentPoints = studentPitch.map((p) => ({
        time: p.time,
        pitch: getPitchValue(p),
      }));

      // Smooth the curve - Enhanced multi-pass smoothing for tarannum training (0.8 tension, 2 passes for very smooth curves)
      const smoothedStudent = smoothCurve(studentPoints, 0.8, 2);

      // Draw high-confidence segments (solid line)
      ctx.strokeStyle = "#ef4444"; // Red
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();

      let firstPoint = true;
      smoothedStudent.forEach((point, idx) => {
        const originalPoint = studentPitch[idx];
        const confidence = originalPoint?.confidence ?? 1.0;

        if (point.y > 0 && confidence > 0.5) {
          const x = padding + (point.x / timelineDuration) * graphWidth;
          const y =
            padding +
            graphHeight -
            ((point.y - minPitch) / pitchRange) * graphHeight;

          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Draw low-confidence segments (dashed line)
      ctx.strokeStyle = "#ef4444";
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      firstPoint = true;
      smoothedStudent.forEach((point, idx) => {
        const originalPoint = studentPitch[idx];
        const confidence = originalPoint?.confidence ?? 1.0;

        if (point.y > 0 && confidence <= 0.5 && confidence > 0) {
          const x = padding + (point.x / timelineDuration) * graphWidth;
          const y =
            padding +
            graphHeight -
            ((point.y - minPitch) / pitchRange) * graphHeight;

          if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);

      // Calculate and draw mismatch markers (squares) where cents difference > 150
      // Need to recalculate smoothedRef here since it's in a different scope
      const refPointsForMismatch = refPitch.map((p) => ({
        time: p.time,
        pitch: getPitchValue(p),
      }));
      // Enhanced multi-pass smoothing for mismatch calculation consistency (0.8 tension, 2 passes)
      const smoothedRefForMismatch = smoothCurve(refPointsForMismatch, 0.8, 2);

      ctx.fillStyle = "#dc2626"; // Dark red for mismatch markers
      const mismatchMarkers: Array<{ x: number; y: number }> = [];

      // Find time-aligned points and calculate cents difference
      smoothedStudent.forEach((studentPoint) => {
        const studentPitchValue = studentPoint.y;
        if (studentPitchValue <= 0) return;

        // Find closest reference point at similar time
        const studentTime = studentPoint.x;
        const closestRef = smoothedRefForMismatch.find((refPoint) => {
          const refTime = refPoint.x;
          return Math.abs(refTime - studentTime) < 0.05; // 50ms tolerance
        });

        if (closestRef && closestRef.y > 0) {
          const refPitchValue = closestRef.y;
          const centsDiff = Math.abs(
            centsDifference(refPitchValue, studentPitchValue)
          );

          // Mark if difference > 150 cents (~1.25 semitones)
          if (centsDiff > 150) {
            const x = padding + (studentTime / timelineDuration) * graphWidth;
            const y =
              padding +
              graphHeight -
              ((studentPitchValue - minPitch) / pitchRange) * graphHeight;
            mismatchMarkers.push({ x, y });
          }
        }
      });

      // Draw mismatch markers as squares
      mismatchMarkers.forEach(({ x, y }) => {
        ctx.fillRect(x - 3, y - 3, 6, 6);
      });

      // Draw error points (red dots) at error time points
      ctx.fillStyle = "#ef4444";
      errorPoints.forEach((time) => {
        // Find corresponding reference point at this time
        const refPoint = refPitch.find((p) => {
          const pitchValue = getPitchValue(p);
          return (
            Math.abs(p.time - time) < 0.1 &&
            pitchValue !== null &&
            pitchValue > 0
          );
        });
        if (refPoint) {
          const pitchValue = getPitchValue(refPoint);
          if (pitchValue !== null) {
            const x = padding + (time / timelineDuration) * graphWidth;
            const y =
              padding +
              graphHeight -
              ((pitchValue - minPitch) / pitchRange) * graphHeight;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    // Draw current time indicator (yellow vertical line)
    if (currentTime > 0 && timelineDuration > 0) {
      ctx.strokeStyle = "#fbbf24"; // Yellow
      ctx.lineWidth = 2;
      const x = padding + (currentTime / timelineDuration) * graphWidth;
      if (x >= padding && x <= width - padding) {
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
      }
    }
  }, [pitchData, currentTime, height, segments, hoveredRegion]);

  // Handle seek to a specific time (used by canvas click and ayah text click)
  const handleSeek = (seekTime: number) => {
    if (!pitchData) return;

    // Calculate max time from pitch data
    const allTimes = [...pitchData.reference, ...pitchData.student].map(
      (p) => p.time
    );
    const dataMaxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
    const timelineDuration = duration > 0 ? duration : Math.max(dataMaxTime, 1);

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(timelineDuration, seekTime));
    const seekProgress = timelineDuration > 0 ? clampedTime / timelineDuration : 0;

    // Seek both audio players
    try {
      if (refWaveSurferRef.current) {
        refWaveSurferRef.current.seekTo(seekProgress);
      }
    } catch (e) {
      // Ignore errors if instance is destroyed
    }
    try {
      if (studentWaveSurferRef.current) {
        studentWaveSurferRef.current.seekTo(seekProgress);
      }
    } catch (e) {
      // Ignore errors if instance is destroyed
    }

    setCurrentTime(clampedTime);
  };

  // Handle canvas click for seeking (including region clicks)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pitchData) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 50;
    const graphWidth = canvas.width - padding * 2;

    // Calculate time from x position
    const allTimes = [...pitchData.reference, ...pitchData.student].map(
      (p) => p.time
    );
    const dataMaxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
    const timelineDuration = duration > 0 ? duration : Math.max(dataMaxTime, 1);
    const clickedTime = ((x - padding) / graphWidth) * timelineDuration;

    // If clicking on a region, seek to region start for better UX
    if (segments && segments.length > 0) {
      // Convert segment start/end from normalized (0-1) to actual time if needed
      const clickedSegment = segments.find((seg) => {
        const segStart =
          seg.start < 1 && timelineDuration > 1
            ? seg.start * timelineDuration
            : seg.start;
        const segEnd =
          seg.end <= 1 && timelineDuration > 1
            ? seg.end * timelineDuration
            : seg.end;
        return clickedTime >= segStart && clickedTime <= segEnd;
      });
      if (clickedSegment) {
        // Convert to actual time and seek to segment start
        const segStartTime =
          clickedSegment.start < 1 && timelineDuration > 1
            ? clickedSegment.start * timelineDuration
            : clickedSegment.start;
        handleSeek(segStartTime);
        return;
      }
    }

    // Otherwise, seek to exact clicked time
    handleSeek(clickedTime);
  };

  // Calculate pitch difference at a given time
  const calculatePitchDifference = (time: number): number | undefined => {
    if (!pitchData) return undefined;

    const refPitch = pitchData.reference || [];
    const studentPitch = pitchData.student || [];

    // Find closest reference pitch point
    const refPoint = refPitch.reduce((closest, p) => {
      if (!p.f_hz || p.f_hz <= 0) return closest;
      if (!closest) return p;
      return Math.abs(p.time - time) < Math.abs(closest.time - time)
        ? p
        : closest;
    }, null as PitchData | null);

    // Find closest student pitch point
    const studentPoint = studentPitch.reduce((closest, p) => {
      if (!p.f_hz || p.f_hz <= 0) return closest;
      if (!closest) return p;
      return Math.abs(p.time - time) < Math.abs(closest.time - time)
        ? p
        : closest;
    }, null as PitchData | null);

    if (refPoint && refPoint.f_hz && studentPoint && studentPoint.f_hz) {
      // Calculate cents difference
      const centsDiff = 1200 * Math.log2(studentPoint.f_hz / refPoint.f_hz);
      return Math.abs(centsDiff);
    }

    return undefined;
  };

  // Handle canvas hover for tooltip
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !segments || segments.length === 0) {
      setHoverInfo(null);
      setHoveredRegion(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padding = 50;
    const graphWidth = canvas.width - padding * 2;

    // Calculate time from x position
    const allTimes = pitchData
      ? [...pitchData.reference, ...pitchData.student].map((p) => p.time)
      : [];
    const dataMaxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;
    const timelineDuration = duration > 0 ? duration : Math.max(dataMaxTime, 1);
    const hoverTime = ((x - padding) / graphWidth) * timelineDuration;

    // Convert segment start/end from normalized (0-1) to actual time (seconds)
    // Segments come with start/end as 0.0-1.0 (0%-100%), need to convert to seconds
    const segmentIndex = segments.findIndex((seg) => {
      // Check if segment.start/end are normalized (0-1) or already in seconds
      // If timelineDuration > 1 and seg.start < 1, likely normalized
      const segStart =
        seg.start < 1 && timelineDuration > 1
          ? seg.start * timelineDuration
          : seg.start;
      const segEnd =
        seg.end <= 1 && timelineDuration > 1
          ? seg.end * timelineDuration
          : seg.end;
      return hoverTime >= segStart && hoverTime <= segEnd;
    });
    const segment = segmentIndex >= 0 ? segments[segmentIndex] : null;

    if (segment) {
      // Convert segment times to actual seconds for pitch calculation
      const segStartTime =
        segment.start < 1 && timelineDuration > 1
          ? segment.start * timelineDuration
          : segment.start;
      const segEndTime =
        segment.end <= 1 && timelineDuration > 1
          ? segment.end * timelineDuration
          : segment.end;
      const segmentMidTime = (segStartTime + segEndTime) / 2;
      const pitchDiff = calculatePitchDifference(segmentMidTime);

      // Create segment with actual time values for display
      const segmentWithTime = {
        ...segment,
        start: segStartTime,
        end: segEndTime,
      };

      setHoverInfo({
        x: e.clientX,
        y: e.clientY,
        segment: segmentWithTime,
        pitchDiff,
      });
      setHoveredRegion(segmentIndex);
    } else {
      setHoverInfo(null);
      setHoveredRegion(null);
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoverInfo(null);
    setHoveredRegion(null);
  };

  // Initialize WaveSurfer instances for playback
  useEffect(() => {
    if (!containerRef.current) return;

    let refBlobUrl: string | null = null;
    let studentBlobUrl: string | null = null;

    // Reference waveform (hidden, just for playback)
    const refWs = WaveSurfer.create({
      container: containerRef.current,
      height: 0,
      interact: false,
    });
    refWaveSurferRef.current = refWs;

    // Handle errors gracefully
    refWs.on("error", (error: any) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error?.name !== "AbortError") {
        console.warn("Reference WaveSurfer error:", error);
      }
    });

    if (referenceUrl) {
      refWs.load(referenceUrl).catch((error: any) => {
        // Ignore AbortError - it's expected during component cleanup
        if (error?.name !== "AbortError") {
          console.warn("Error loading reference URL:", error);
        }
      });
    } else if (referenceBlob) {
      refBlobUrl = URL.createObjectURL(referenceBlob);
      refWs.load(refBlobUrl).catch((error: any) => {
        // Ignore AbortError - it's expected during component cleanup
        if (error?.name !== "AbortError") {
          console.warn("Error loading reference blob:", error);
        }
        if (refBlobUrl) {
          URL.revokeObjectURL(refBlobUrl);
          refBlobUrl = null;
        }
      });
    }

    refWs.on("ready", () => {
      const dur = refWs.getDuration();
      if (duration === 0) setDuration(dur);
      if (onReferenceReady) onReferenceReady(refWs);
    });

    // Stop playback when audio finishes
    refWs.on("finish", () => {
      setIsPlaying(false);
      if (studentWaveSurferRef.current) {
        studentWaveSurferRef.current.pause();
      }
    });

    // Student waveform (hidden, just for playback)
    let studentWs: WaveSurfer | null = null;
    if (studentBlob) {
      studentWs = WaveSurfer.create({
        container: containerRef.current,
        height: 0,
        interact: false,
      });
      studentWaveSurferRef.current = studentWs;

      studentWs.on("error", (error: any) => {
        // Ignore AbortError - it's expected during component cleanup
        if (error?.name !== "AbortError") {
          console.warn("Student WaveSurfer error:", error);
        }
      });

      studentBlobUrl = URL.createObjectURL(studentBlob);
      studentWs.load(studentBlobUrl).catch((error: any) => {
        // Ignore AbortError - it's expected during component cleanup
        if (error?.name !== "AbortError") {
          console.warn("Error loading student blob:", error);
        }
        if (studentBlobUrl) {
          URL.revokeObjectURL(studentBlobUrl);
          studentBlobUrl = null;
        }
      });

      studentWs.on("ready", () => {
        if (onStudentReady) onStudentReady(studentWs!);
      });

      // Stop playback when audio finishes
      studentWs.on("finish", () => {
        setIsPlaying(false);
        if (refWaveSurferRef.current) {
          refWaveSurferRef.current.pause();
        }
      });
    }

    return () => {
      // Stop and destroy WaveSurfer instances
      try {
        if (refWs) {
          refWs.stop();
          refWs.destroy();
        }
      } catch (e: any) {
        // Ignore AbortError - it's expected during cleanup
        if (e?.name !== "AbortError") {
          console.warn("Error destroying reference WaveSurfer:", e);
        }
      }

      try {
        if (studentWs) {
          studentWs.stop();
          studentWs.destroy();
        }
      } catch (e: any) {
        // Ignore AbortError - it's expected during cleanup
        if (e?.name !== "AbortError") {
          console.warn("Error destroying student WaveSurfer:", e);
        }
      }

      // Clean up blob URLs
      if (refBlobUrl) {
        URL.revokeObjectURL(refBlobUrl);
      }
      if (studentBlobUrl) {
        URL.revokeObjectURL(studentBlobUrl);
      }
    };
  }, [
    referenceUrl,
    referenceBlob,
    studentBlob,
    onReferenceReady,
    onStudentReady,
    duration,
  ]);

  // Synchronized playback
  useEffect(() => {
    if (isPlaying) {
      updateIntervalRef.current = window.setInterval(() => {
        if (refWaveSurferRef.current) {
          const time = refWaveSurferRef.current.getCurrentTime();
          const dur = refWaveSurferRef.current.getDuration();

          // Check if playback has finished
          if (dur > 0 && time >= dur - 0.1) {
            setIsPlaying(false);
            if (refWaveSurferRef.current) {
              refWaveSurferRef.current.pause();
            }
            if (studentWaveSurferRef.current) {
              studentWaveSurferRef.current.pause();
            }
            setCurrentTime(dur);
            return;
          }

          setCurrentTime(time);

          if (studentWaveSurferRef.current && duration > 0) {
            const progress = time / duration;
            if (!isNaN(progress) && progress >= 0 && progress <= 1) {
              studentWaveSurferRef.current.seekTo(progress);
            }
          }
        }
      }, 100);
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
    if (refWaveSurferRef.current && studentWaveSurferRef.current) {
      if (isPlaying) {
        refWaveSurferRef.current.pause();
        studentWaveSurferRef.current.pause();
        setAnnouncement("Playback paused");
      } else {
        refWaveSurferRef.current.play();
        studentWaveSurferRef.current.play();
        setAnnouncement("Playback started");
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // Only handle when focus is on container

    switch (e.key) {
      case " ":
      case "Enter":
        e.preventDefault();
        if (e.target === playButtonRef.current) {
          handlePlayPause();
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (duration > 0) {
          const newTime = Math.max(0, currentTime - 5); // Seek back 5 seconds
          handleSeek(newTime);
          setAnnouncement(`Seeked to ${formatTime(newTime)}`);
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        if (duration > 0) {
          const newTime = Math.min(duration, currentTime + 5); // Seek forward 5 seconds
          handleSeek(newTime);
          setAnnouncement(`Seeked to ${formatTime(newTime)}`);
        }
        break;
      case "Home":
        e.preventDefault();
        handleSeek(0);
        setAnnouncement("Seeked to start");
        break;
      case "End":
        e.preventDefault();
        if (duration > 0) {
          handleSeek(duration);
          setAnnouncement("Seeked to end");
        }
        break;
    }
  };

  // Clear announcement after it's been read
  useEffect(() => {
    if (announcement) {
      const timer = setTimeout(() => setAnnouncement(""), 1000);
      return () => clearTimeout(timer);
    }
  }, [announcement]);

  const handleStop = () => {
    if (refWaveSurferRef.current) {
      refWaveSurferRef.current.stop();
      refWaveSurferRef.current.seekTo(0);
    }
    if (studentWaveSurferRef.current) {
      studentWaveSurferRef.current.stop();
      studentWaveSurferRef.current.seekTo(0);
    }
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleRepeat = () => {
    if (refWaveSurferRef.current) {
      refWaveSurferRef.current.seekTo(0);
      refWaveSurferRef.current.play();
    }
    if (studentWaveSurferRef.current) {
      studentWaveSurferRef.current.seekTo(0);
      studentWaveSurferRef.current.play();
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

  // Error handling: Check if required data is available
  if (
    !pitchData ||
    ((!pitchData.reference || pitchData.reference.length === 0) &&
      (!pitchData.student || pitchData.student.length === 0))
  ) {
    return (
      <div className='space-y-4' role='alert' aria-live='polite'>
        <div className='bg-amber-50 border border-amber-200 rounded-lg p-4'>
          <h3 className='text-sm font-semibold text-amber-800 mb-2'>
            Pitch Data Unavailable
          </h3>
          <p className='text-xs text-amber-700'>
            Pitch analysis data is not available. Please ensure both reference
            and student audio recordings are available and try analyzing again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className='space-y-4'
      onKeyDown={handleKeyDown}
      role='application'
      aria-label='Pitch comparison visualization'
    >
      {/* Screen reader announcements */}
      <div
        role='status'
        aria-live='polite'
        aria-atomic='true'
        className='absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0'
        style={{ clip: "rect(0, 0, 0, 0)", clipPath: "inset(50%)" }}
      >
        {announcement}
      </div>
      {/* Pitch Graph */}
      <div
        className='bg-slate-900 rounded-lg p-4'
        role='region'
        aria-label='Pitch visualization'
      >
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-4 text-xs'>
            <div className='flex items-center gap-1.5'>
              <div className='w-3 h-3 rounded-full bg-green-500'></div>
              <span className='text-slate-300'>Reference</span>
            </div>
            <div className='flex items-center gap-1.5'>
              <div className='w-3 h-3 rounded-full bg-red-500'></div>
              <span className='text-slate-300'>Student</span>
            </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{
            cursor: hoveredRegion !== null ? "pointer" : "default",
            width: "100%",
            display: "block",
          }}
          height={height}
          className='rounded'
          role='img'
          aria-label={`Pitch comparison graph showing reference and student pitch curves. Current time: ${formatTime(
            currentTime
          )} of ${formatTime(duration)}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              // Seek to clicked position (middle of canvas for keyboard users)
              if (duration > 0) {
                handleSeek(duration / 2);
              }
            }
          }}
        />

        {/* Axis Labels */}
        <div className='flex justify-between mt-2 text-xs text-slate-400'>
          <div className='flex items-center gap-2'>
            <span>← Duration of each sound</span>
          </div>
          <div className='flex flex-col items-center'>
            <span>↑</span>
            <span>Pitch</span>
          </div>
        </div>

        {/* Enhanced Tooltip */}
        {hoverInfo && hoverInfo.segment && (
          <div
            ref={tooltipRef}
            className='fixed z-50 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-2xl text-xs pointer-events-none border border-slate-700 max-w-xs'
            style={{
              left: `${hoverInfo.x + 15}px`,
              top: `${hoverInfo.y - 50}px`,
              transform: "translateX(0)",
            }}
          >
            <div className='font-bold mb-2 text-sm border-b border-slate-700 pb-1'>
              Segment Analysis
            </div>

            {/* Score and Accuracy */}
            <div className='flex items-center gap-2 mb-2'>
              <span
                className={`px-2.5 py-1 rounded font-semibold ${
                  hoverInfo.segment.accuracy === "high"
                    ? "bg-emerald-500 text-white"
                    : hoverInfo.segment.accuracy === "medium"
                    ? "bg-amber-400 text-slate-900"
                    : "bg-red-400 text-white"
                }`}
              >
                {formatSegmentScore(hoverInfo.segment.score)}%
              </span>
              <span className='text-slate-300 text-xs'>
                {hoverInfo.segment.accuracy === "high"
                  ? "High"
                  : hoverInfo.segment.accuracy === "medium"
                  ? "Medium"
                  : "Low"}{" "}
                Accuracy
              </span>
            </div>

            {/* Time Range */}
            <div className='text-slate-400 mb-2 text-[10px]'>
              <span className='font-medium text-slate-300'>Time:</span>{" "}
              {hoverInfo.segment.start.toFixed(1)}s -{" "}
              {hoverInfo.segment.end.toFixed(1)}s
              <span className='text-slate-500 ml-1'>
                ({(hoverInfo.segment.end - hoverInfo.segment.start).toFixed(1)}
                s)
              </span>
            </div>

            {/* Pitch Difference */}
            {hoverInfo.pitchDiff !== undefined && (
              <div className='text-slate-400 mb-2 text-[10px] border-t border-slate-700 pt-2'>
                <span className='font-medium text-slate-300'>
                  Pitch Deviation:
                </span>{" "}
                <span
                  className={
                    hoverInfo.pitchDiff > 150
                      ? "text-red-400"
                      : hoverInfo.pitchDiff > 50
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }
                >
                  {hoverInfo.pitchDiff.toFixed(0)} cents
                </span>
                {hoverInfo.pitchDiff > 150 && (
                  <span className='text-red-400 ml-1'>⚠️ Significant</span>
                )}
              </div>
            )}

            {/* Click hint */}
            <div className='text-slate-500 text-[9px] mt-2 pt-2 border-t border-slate-700 italic'>
              Click to seek to segment start
            </div>
          </div>
        )}
      </div>

      {/* Ayah Text Display */}
      {ayatTiming && ayatTiming.length > 0 ? (
        <AyahTextDisplay
          ayatTiming={ayatTiming}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
        />
      ) : (
        <div className='mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200'>
          <p className='text-xs text-slate-500 text-center'>
            Ayah timing data not available
          </p>
        </div>
      )}

      {/* Controls */}
      <div
        className='flex items-center justify-center gap-2'
        role='toolbar'
        aria-label='Playback controls'
      >
        <button
          ref={playButtonRef}
          onClick={handlePlayPause}
          className='flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2'
          aria-label={isPlaying ? "Pause playback" : "Play playback"}
          aria-pressed={isPlaying}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? (
            <Pause size={18} fill='currentColor' aria-hidden='true' />
          ) : (
            <Play size={18} fill='currentColor' aria-hidden='true' />
          )}
        </button>
        <button
          onClick={handleStop}
          className='flex items-center justify-center w-10 h-10 rounded-full bg-slate-600 hover:bg-slate-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2'
          aria-label='Stop playback and return to start'
          title='Stop'
        >
          <Square size={14} fill='currentColor' aria-hidden='true' />
        </button>
        <button
          onClick={handleRepeat}
          className='flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2'
          aria-label='Repeat from beginning'
          title='Repeat'
        >
          <RotateCcw size={16} aria-hidden='true' />
        </button>
      </div>

      {/* Time Display */}
      <div
        className='flex items-center justify-between text-xs text-slate-600 px-2'
        role='timer'
        aria-label={`Current playback time: ${formatTime(
          currentTime
        )} of ${formatTime(duration)}`}
        aria-live='polite'
      >
        <span aria-hidden='true'>{formatTime(currentTime)}</span>
        <span className='text-slate-400' aria-hidden='true'>
          /
        </span>
        <span aria-hidden='true'>{formatTime(duration)}</span>
      </div>

      {/* Hidden container for WaveSurfer */}
      <div ref={containerRef} className='hidden'></div>
    </div>
  );
};

export default PitchComparison;
