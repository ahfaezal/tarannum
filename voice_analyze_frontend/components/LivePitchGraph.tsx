import React, { useEffect, useRef, useState } from "react";
import { PitchPoint } from "../services/pitchExtractor";
import { PitchData, PitchMarker } from "../types";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";

interface LivePitchGraphProps {
  referencePitch: PitchData[]; // Pre-extracted from backend (accurate)
  studentPitch: PitchPoint[]; // Real-time from frontend (growing array)
  isRecording: boolean;
  isPlaying: boolean;
  currentTime: number; // Current playback/recording time
  referenceDuration?: number; // Actual audio duration (for accurate graph scaling)
  height?: number;
  isFullScreen?: boolean; // Full-screen training mode (hides controls, simplifies UI)
  markers?: PitchMarker[]; // Training markers for unclear/unstable segments
  onMarkerClick?: (time: number) => void; // Callback when marker is clicked
  fixedYAxis?: boolean; // Lock Y-axis to fixed range (60-600 Hz) when true
  minFreq?: number; // Minimum frequency for fixed Y-axis (default: 60 Hz)
  maxFreq?: number; // Maximum frequency for fixed Y-axis (default: 600 Hz)
  zoomLevel?: number; // External zoom level control (optional)
  onZoomChange?: (zoom: number) => void; // Callback when zoom changes externally
}

const LivePitchGraph: React.FC<LivePitchGraphProps> = ({
  referencePitch,
  studentPitch,
  isRecording,
  isPlaying,
  currentTime,
  referenceDuration,
  height = 300,
  isFullScreen = false,
  markers = [],
  onMarkerClick,
  fixedYAxis = false,
  minFreq = 60,
  maxFreq = 600, // Locked to 600 Hz maximum for better visibility on tablets/iPads
  zoomLevel, // External zoom control (optional)
  onZoomChange, // External zoom change callback (optional)
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Zoom and pan state - use external zoomLevel if provided, otherwise use internal state
  const [internalZoomLevel, setInternalZoomLevel] = useState(1.0); // 1.0 = 100%, 2.0 = 200%, etc.
  const effectiveZoomLevel = zoomLevel !== undefined ? zoomLevel : internalZoomLevel;

  // Update internal zoom when external zoom changes
  useEffect(() => {
    if (zoomLevel !== undefined) {
      setInternalZoomLevel(zoomLevel);
    }
  }, [zoomLevel]);
  const [panOffset, setPanOffset] = useState(0); // Horizontal pan offset in pixels
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, pan: 0 });
  const zoomCenterRef = useRef(0.5); // Zoom center point (0-1)

  // Auto-follow state
  const [autoFollow, setAutoFollow] = useState(true); // Auto-follow enabled by default
  const [manualPanActive, setManualPanActive] = useState(false); // Track if user manually panned
  const manualPanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // In full-screen mode, lock auto-follow and disable manual pan
  // Note: Don't reset zoom - allow users to zoom in fullscreen mode
  useEffect(() => {
    if (isFullScreen) {
      setAutoFollow(true);
      setManualPanActive(false);
      // Don't reset zoom - allow zooming in fullscreen mode
      // Only reset pan offset
      setPanOffset(0);
    }
  }, [isFullScreen]);

  // Force canvas resize when entering fullscreen mode
  useEffect(() => {
    if (!isFullScreen) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Use multiple attempts to ensure proper sizing
    const resizeWithDelay = (attempt: number = 0) => {
      requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        // Use multiple methods to get dimensions with fallbacks
        const displayWidth =
          rect.width || container.offsetWidth || container.clientWidth || 800;
        const displayHeight =
          height ||
          rect.height ||
          container.offsetHeight ||
          container.clientHeight ||
          400;

        if (displayWidth > 0 && displayHeight > 0) {
          canvas.width = displayWidth * dpr;
          canvas.height = displayHeight * dpr;
          canvas.style.width = displayWidth + "px";
          canvas.style.height = displayHeight + "px";

          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Reset transform first to avoid cumulative scaling
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
          }

          // Force a redraw after resize by dispatching a custom event
          // This ensures the draw effect picks up the new dimensions
          window.dispatchEvent(new Event("resize"));
        } else if (attempt < 10) {
          // Retry if dimensions are still 0 (up to 10 attempts)
          setTimeout(() => resizeWithDelay(attempt + 1), 50);
        }
      });
    };

    // Immediate resize
    resizeWithDelay();

    // Delayed resize to catch any layout changes
    const timeoutId1 = setTimeout(() => resizeWithDelay(), 50);
    const timeoutId2 = setTimeout(() => resizeWithDelay(), 100);
    const timeoutId3 = setTimeout(() => resizeWithDelay(), 200);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [isFullScreen, height]);

  // Resize canvas to match container - Fixed for fullscreen mode with device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      // Use device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      // Use multiple methods to get dimensions with fallbacks
      const displayWidth =
        rect.width || container.offsetWidth || container.clientWidth || 800;
      const displayHeight =
        height ||
        rect.height ||
        container.offsetHeight ||
        container.clientHeight ||
        400;

      if (displayWidth > 0 && displayHeight > 0) {
        // Set actual size in memory (scaled for device pixel ratio)
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;

        // Scale the canvas back down using CSS
        canvas.style.width = displayWidth + "px";
        canvas.style.height = displayHeight + "px";

        // Scale the drawing context so everything draws at the correct size
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Reset transform first to avoid cumulative scaling
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
      }
    };

    // Initial resize with a small delay to ensure container is ready
    const timeoutId = setTimeout(() => {
      resizeCanvas();
    }, 0);

    // Also use requestAnimationFrame for immediate resize
    requestAnimationFrame(() => {
      resizeCanvas();
    });

    window.addEventListener("resize", resizeCanvas);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [height, isFullScreen]); // Add isFullScreen to dependencies

  // Zoom handlers - use external callback if provided, otherwise use internal state
  const handleZoomIn = () => {
    const newZoom = Math.min(4.0, effectiveZoomLevel + 0.25);
    if (onZoomChange) {
      onZoomChange(newZoom);
    } else {
      setInternalZoomLevel(newZoom);
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.5, effectiveZoomLevel - 0.25);
    // Reset pan if zooming out too far
    if (newZoom <= 1.0) {
      setPanOffset(0);
    }
    if (onZoomChange) {
      onZoomChange(newZoom);
    } else {
      setInternalZoomLevel(newZoom);
    }
  };

  const handleZoomReset = () => {
    if (onZoomChange) {
      onZoomChange(1.0);
    } else {
      setInternalZoomLevel(1.0);
    }
    setPanOffset(0);
  };

  const handleZoomFit = () => {
    // Fit to show all data
    const refMaxTime =
      referencePitch.length > 0
        ? Math.max(...referencePitch.map((p) => p.time))
        : 0;
    const audioDuration =
      referenceDuration && referenceDuration > 0
        ? referenceDuration
        : refMaxTime;
    const baseMaxTime = Math.max(audioDuration, currentTime || 0, 10);

    // Calculate optimal zoom to fit all data
    const canvas = canvasRef.current;
    if (canvas) {
      const padding = 60;
      const graphWidth = canvas.width - padding * 2;
      // Calculate zoom to show full duration with some padding
      const optimalZoom = Math.max(
        0.5,
        Math.min(2.0, (graphWidth / baseMaxTime) * 10)
      );
      if (onZoomChange) {
        onZoomChange(optimalZoom);
      } else {
        setInternalZoomLevel(optimalZoom);
      }
      setPanOffset(0);
    }
  };

  // Mouse wheel zoom - handles both regular and fullscreen modes
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      // Get canvas bounds for calculations
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // CRITICAL: First check if mouse coordinates are within THIS component's canvas bounds
      // This is the primary check to ensure each graph only processes events over its own area
      const tolerance = isFullScreen ? 100 : 10;
      const isMouseOverThisCanvas =
        mouseX >= rect.left - tolerance &&
        mouseX <= rect.right + tolerance &&
        mouseY >= rect.top - tolerance &&
        mouseY <= rect.bottom + tolerance;

      if (!isMouseOverThisCanvas) {
        // Mouse is not over this canvas, ignore the event
        // This prevents regular mode handler from processing fullscreen events and vice versa
        return;
      }

      // Secondary check: Verify event target is within this component's DOM tree
      // This provides additional protection against event bubbling issues
      const eventTarget = e.target;
      const isEventTargetDocumentOrWindow = eventTarget === document || eventTarget === window;
      const isEventInThisComponent = isEventTargetDocumentOrWindow ||
                                     (eventTarget instanceof Node && canvas.contains(eventTarget)) ||
                                     (eventTarget instanceof Node && container && container.contains(eventTarget));

      // If event target is document/window, rely on mouse position check (already passed above)
      // Otherwise, ensure event target is within this component
      if (!isEventTargetDocumentOrWindow && !isEventInThisComponent) {
        // Event target is not from this component's DOM tree, ignore it
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const relativeX = mouseX - rect.left;
      const padding = 60;
      const graphWidth = rect.width - padding * 2;

      // Calculate current state
      const refMaxTime =
        referencePitch.length > 0
          ? Math.max(...referencePitch.map((p) => p.time))
          : 0;
      const audioDuration =
        referenceDuration && referenceDuration > 0
          ? referenceDuration
          : refMaxTime;
      const baseMaxTime = Math.max(audioDuration, currentTime || 0, 10);

      const currentVisibleRange = baseMaxTime / effectiveZoomLevel;
      const pixelsPerSecond = graphWidth / currentVisibleRange;
      const panTime = panOffset / pixelsPerSecond;
      const centerTime = baseMaxTime / 2;
      const startTime = centerTime - currentVisibleRange / 2 + panTime;
      const currentMinVisibleTime = Math.max(
        0,
        Math.min(startTime, baseMaxTime - currentVisibleRange)
      );

      // Calculate time at mouse position
      const mouseXInGraph = relativeX - padding;
      const mouseTime =
        currentMinVisibleTime +
        (mouseXInGraph / graphWidth) * currentVisibleRange;

      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.5, Math.min(4.0, effectiveZoomLevel + delta));
      if (newZoom !== effectiveZoomLevel) {
        // Adjust pan to keep mouse position fixed
        const newVisibleRange = baseMaxTime / newZoom;
        const newPixelsPerSecond = graphWidth / newVisibleRange;
        const newCenterTime = mouseTime;
        const newPanTime = newCenterTime - baseMaxTime / 2;
        const maxPanTime = baseMaxTime - newVisibleRange;
        const clampedPanTime = Math.max(
          -maxPanTime / 2,
          Math.min(maxPanTime / 2, newPanTime)
        );
        setPanOffset(clampedPanTime * newPixelsPerSecond);

        // Update zoom using external callback or internal state
        if (onZoomChange) {
          onZoomChange(newZoom);
        } else {
          setInternalZoomLevel(newZoom);
        }
      }
    };

    // Attach event listeners with appropriate phase
    const targetElement = container || canvas;

    if (isFullScreen) {
      // In fullscreen mode, use capture phase to catch events before regular mode handler
      // This ensures fullscreen zoom takes priority
      targetElement.addEventListener("wheel", handleWheel, { passive: false, capture: true });
      canvas.addEventListener("wheel", handleWheel, { passive: false, capture: true });
      return () => {
        targetElement.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
        canvas.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
      };
    } else {
      // In regular mode, use bubble phase (default)
      targetElement.addEventListener("wheel", handleWheel, { passive: false });
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        targetElement.removeEventListener("wheel", handleWheel);
        canvas.removeEventListener("wheel", handleWheel);
      };
    }
  }, [effectiveZoomLevel, panOffset, referencePitch, referenceDuration, currentTime, onZoomChange, isFullScreen]);

  // Auto-follow: Auto-pan during playback/recording
  // Behaviour: auto-pan only until the tracking line reaches the center of the visible window.
  // After that, the viewport stays fixed (graph no longer scrolls under the fixed tracking line).
  useEffect(() => {
    // Only auto-pan if auto-follow is enabled and user hasn't manually panned
    if (!autoFollow || manualPanActive || (!isPlaying && !isRecording)) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || currentTime <= 0) return;

    // During live recording/practice, use the latest red-point time so
    // auto-follow scrolling stays locked to the red line (same as blue cursor).
    const liveTime =
      isRecording && studentPitch.length > 0
        ? studentPitch[studentPitch.length - 1].time
        : currentTime;

    const refMaxTime =
      referencePitch.length > 0
        ? Math.max(...referencePitch.map((p) => p.time))
        : 0;
    const audioDuration =
      referenceDuration && referenceDuration > 0
        ? referenceDuration
        : refMaxTime;
    const baseMaxTime = Math.max(audioDuration, liveTime || 0, 10);

    const padding = 60;
    const graphWidth = canvas.width - padding * 2;
    const visibleTimeRange = baseMaxTime / effectiveZoomLevel;

    const desiredCenterTime = Math.min(liveTime, audioDuration);

    const currentCenterTime = baseMaxTime / 2;
    const panTimeNeeded = desiredCenterTime - currentCenterTime;

    // Allow pan so center can reach audioDuration (graph finishes at tracking line)
    const maxPanTime = Math.max(0, baseMaxTime - visibleTimeRange);
    const maxRightPan = Math.max(maxPanTime / 2, audioDuration - baseMaxTime / 2);
    const clampedPanTime = Math.max(
      -maxPanTime / 2,
      Math.min(maxRightPan, panTimeNeeded)
    );

    // Convert to pixels
    const pixelsPerSecond = graphWidth / visibleTimeRange;
    const newPanOffset = clampedPanTime * pixelsPerSecond;

    setPanOffset((prev) => {
      const diff = Math.abs(newPanOffset - prev);
      if (diff < 1) return newPanOffset;
      // During live recording/practice, snap viewport instantly so
      // the blue cursor and red line tip stay aligned at center.
      // During playback, use smooth interpolation for polished feel.
      if (isRecording) return newPanOffset;
      return prev + (newPanOffset - prev) * 0.15;
    });
  }, [
    currentTime,
    isPlaying,
    isRecording,
    effectiveZoomLevel,
    referenceDuration,
    referencePitch,
    studentPitch,
    autoFollow,
    manualPanActive,
  ]);

  // Mouse drag for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || effectiveZoomLevel <= 1.0) return;

    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setDragStart({ x: e.clientX, pan: panOffset });
      setManualPanActive(true); // User is manually panning
      setAutoFollow(false); // Disable auto-follow during manual pan

      // Clear any existing timeout
      if (manualPanTimeoutRef.current) {
        clearTimeout(manualPanTimeoutRef.current);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStart.x;
        const padding = 60;
        const graphWidth = canvas.width - padding * 2;

        // Calculate max pan based on zoom level
        // When zoomed in, we can pan more
        const visibleTimeRange = (referenceDuration || 10) / effectiveZoomLevel;
        const pixelsPerSecond = graphWidth / visibleTimeRange;
        const maxPanTime = (referenceDuration || 10) - visibleTimeRange;
        const maxPan = maxPanTime * pixelsPerSecond;

        setPanOffset(
          Math.max(-maxPan, Math.min(maxPan, dragStart.pan + deltaX))
        );
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Re-enable auto-follow after a delay (user can manually pan again if needed)
      if (manualPanTimeoutRef.current) {
        clearTimeout(manualPanTimeoutRef.current);
      }
      manualPanTimeoutRef.current = setTimeout(() => {
        setManualPanActive(false);
        setAutoFollow(true);
      }, 2000); // Re-enable after 2 seconds of no manual panning
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (manualPanTimeoutRef.current) {
        clearTimeout(manualPanTimeoutRef.current);
      }
    };
  }, [isDragging, dragStart, effectiveZoomLevel, panOffset, referenceDuration]);

  // Smooth reference pitch data using multi-pass tension-based interpolation
  // Enhanced for tarannum training to match requirement for very smooth melodic flow
  const smoothReferencePitch = (
    pitchData: PitchData[],
    tension: number = 0.8,
    passes: number = 2
  ): PitchData[] => {
    if (pitchData.length < 2) return pitchData;

    // Start with a copy of the original data
    let currentPoints = [...pitchData];

    // Apply multiple passes of smoothing for smoother, more curvilinear result
    for (let pass = 0; pass < passes; pass++) {
      const smoothed: PitchData[] = [];

      for (let i = 0; i < currentPoints.length; i++) {
        const p = currentPoints[i];
        const f_hz = p.f_hz ?? p.pitch ?? null;

        // Keep null points as-is
        if (f_hz === null || f_hz <= 0) {
          smoothed.push({ ...p });
          continue;
        }

        // Keep first and last points unchanged
        if (i === 0 || i === currentPoints.length - 1) {
          smoothed.push({ ...p });
        } else {
          const prev = currentPoints[i - 1];
          const next = currentPoints[i + 1];
          const prevFreq = prev.f_hz ?? prev.pitch ?? null;
          const nextFreq = next.f_hz ?? next.pitch ?? null;

          if (
            prevFreq !== null &&
            prevFreq > 0 &&
            nextFreq !== null &&
            nextFreq > 0
          ) {
            // Enhanced smoothing: average with neighbors using tension
            // Higher tension (0.8) = more weight on neighbor average = smoother curves
            const smoothedFreq =
              f_hz * (1 - tension) + ((prevFreq + nextFreq) / 2) * tension;
            smoothed.push({
              ...p,
              f_hz: smoothedFreq,
              pitch: smoothedFreq, // Keep for backward compatibility
              midi: smoothedFreq
                ? 69 + 12 * Math.log2(smoothedFreq / 440)
                : null,
            });
          } else {
            // If neighbors are invalid, keep current point unchanged
            smoothed.push({ ...p });
          }
        }
      }


      // Update current points for next pass
      currentPoints = smoothed;
    }

    return currentPoints;
  };

  // Draw graph with continuous animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      // Check if canvas has valid dimensions - don't draw if not ready
      if (canvas.width === 0 || canvas.height === 0) {
        return;
      }

      // Get display dimensions (accounting for device pixel ratio)
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.width / dpr;
      const displayHeight = canvas.height / dpr;

      // Ensure we have valid display dimensions
      if (
        displayWidth <= 0 ||
        displayHeight <= 0 ||
        !isFinite(displayWidth) ||
        !isFinite(displayHeight)
      ) {
        return;
      }

      // Clear canvas using actual canvas dimensions
      // Use save/restore to avoid flickering
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Get time range - use actual audio duration if provided, otherwise use max pitch time
      const refMaxTime =
        referencePitch.length > 0
          ? Math.max(...referencePitch.map((p) => p.time))
          : 0;

      const studentMaxTime =
        studentPitch.length > 0
          ? Math.max(...studentPitch.map((p) => p.time))
          : 0;

      const audioDuration =
        referenceDuration && referenceDuration > 0
          ? referenceDuration
          : Math.max(refMaxTime, studentMaxTime);

      // During live recording, use the same baseMaxTime formula as the
      // auto-follow effect so panOffset translates to the same viewport.
      const liveDrawTime =
        isRecording && studentPitch.length > 0
          ? studentPitch[studentPitch.length - 1].time
          : currentTime || 0;

      const baseMaxTime = isRecording
        ? Math.max(audioDuration, liveDrawTime, 10)
        : Math.max(
            audioDuration,
            currentTime || 0,
            refMaxTime || 0,
            studentMaxTime || 0,
            10
          );

      const padding = 60;
      // Use display dimensions for drawing calculations
      const graphWidth = displayWidth - padding * 2;
      const graphHeight = displayHeight - padding * 2;

      // Calculate visible time range based on zoom
      // At effectiveZoomLevel 1.0, we show the full baseMaxTime
      // At effectiveZoomLevel 2.0, we show baseMaxTime/2 (zoomed in 2x)
      const visibleTimeRange = baseMaxTime / effectiveZoomLevel;

      // Calculate pan in time units (not pixels)
      // panOffset is in pixels, convert to time
      const pixelsPerSecond = graphWidth / visibleTimeRange;
      const panTime = panOffset / pixelsPerSecond;

      // Calculate visible time window
      // Center the view, then apply pan
      // In fullscreen mode, ensure reference pitch is fully visible
      let minVisibleTime: number;
      let maxVisibleTime: number;

      if (
        isFullScreen &&
        (referencePitch.length > 0 || studentPitch.length > 0)
      ) {
        // In fullscreen, respect zoom level and center on pitch data
        let minTime = 0;
        let maxTime = 0;

        if (referencePitch.length > 0 && refMaxTime > 0) {
          minTime = Math.min(...referencePitch.map((p) => p.time));
          maxTime = refMaxTime;
        } else if (studentPitch.length > 0 && studentMaxTime > 0) {
          minTime = Math.min(...studentPitch.map((p) => p.time));
          maxTime = studentMaxTime;
        }

        const effectiveMaxTime = Math.max(baseMaxTime, maxTime);
        // CRITICAL: Always use visibleTimeRange (zoom-based) instead of taking max with pitchRange
        // This ensures zoom level is always respected in fullscreen mode
        const effectiveRange = visibleTimeRange;

        // Center on pitch data, but respect zoom level
        // Allow center to reach audioDuration (graph finishes at tracking line)
        const centerTime = (minTime + maxTime) / 2;
        const startTime = centerTime - effectiveRange / 2 + panTime;
        const maxStartForCenterAtEnd = Math.max(
          effectiveMaxTime - effectiveRange,
          audioDuration - effectiveRange / 2
        );
        minVisibleTime = Math.max(
          0,
          Math.min(startTime, maxStartForCenterAtEnd)
        );
        // Allow viewport to extend past end so center can reach audioDuration (graph finishes at tracking line)
        maxVisibleTime = Math.min(
          minVisibleTime + effectiveRange,
          Math.max(effectiveMaxTime, audioDuration + effectiveRange / 2)
        );
      } else if (isRecording) {
        // During live recording/practice, use the same panOffset-based
        // viewport that auto-follow computes so the blue cursor and red
        // line tip stay aligned at center.
        const centerTime = baseMaxTime / 2;
        const startTime = centerTime - visibleTimeRange / 2 + panTime;
        const maxStartForCenterAtEnd = Math.max(
          baseMaxTime - visibleTimeRange,
          audioDuration - visibleTimeRange / 2
        );
        minVisibleTime = Math.max(
          0,
          Math.min(startTime, maxStartForCenterAtEnd)
        );
        maxVisibleTime = Math.min(
          minVisibleTime + visibleTimeRange,
          Math.max(baseMaxTime, audioDuration + visibleTimeRange / 2)
        );
      } else {
        // Normal mode (not recording) - ensure both reference and student pitch are visible
        if (studentPitch.length > 0 && referencePitch.length > 0) {
          const allTimePoints: number[] = [
            ...referencePitch.map((p) => p.time),
            ...studentPitch.map((p) => p.time),
          ];

          const validTimePoints = allTimePoints.filter(
            (t) => t >= 0 && isFinite(t)
          );

          if (validTimePoints.length > 0) {
            const combinedMinTime = Math.min(...validTimePoints);
            const combinedMaxTime = Math.max(...validTimePoints);
            const combinedRange = combinedMaxTime - combinedMinTime;

            const effectiveRange = Math.max(
              visibleTimeRange,
              combinedRange * 1.1
            );
            const centerTime = (combinedMinTime + combinedMaxTime) / 2;
            const startTime = centerTime - effectiveRange / 2 + panTime;

            minVisibleTime = Math.max(0, startTime);
            maxVisibleTime = Math.min(
              Math.max(baseMaxTime, combinedMaxTime * 1.1),
              minVisibleTime + effectiveRange
            );
          } else {
            const centerTime = baseMaxTime / 2;
            const startTime = centerTime - visibleTimeRange / 2 + panTime;
            const maxStartForCenterAtEnd = Math.max(
              baseMaxTime - visibleTimeRange,
              audioDuration - visibleTimeRange / 2
            );
            minVisibleTime = Math.max(
              0,
              Math.min(startTime, maxStartForCenterAtEnd)
            );
            maxVisibleTime = Math.min(
              minVisibleTime + visibleTimeRange,
              Math.max(baseMaxTime, audioDuration + visibleTimeRange / 2)
            );
          }
        } else if (studentPitch.length > 0) {
          const studentTimePoints = studentPitch
            .map((p) => p.time)
            .filter((t) => t >= 0 && isFinite(t));
          if (studentTimePoints.length > 0) {
            const studentMinTime = Math.min(...studentTimePoints);
            const sMaxTime = Math.max(...studentTimePoints);
            const studentRange = sMaxTime - studentMinTime;
            const effectiveRange = Math.max(
              visibleTimeRange,
              studentRange * 1.1
            );
            const centerTime = (studentMinTime + sMaxTime) / 2;
            const startTime = centerTime - effectiveRange / 2 + panTime;

            minVisibleTime = Math.max(0, startTime);
            maxVisibleTime = Math.min(
              Math.max(baseMaxTime, sMaxTime * 1.1),
              minVisibleTime + effectiveRange
            );
          } else {
            const centerTime = baseMaxTime / 2;
            const startTime = centerTime - visibleTimeRange / 2 + panTime;
            const maxStartForCenterAtEnd = Math.max(
              baseMaxTime - visibleTimeRange,
              audioDuration - visibleTimeRange / 2
            );
            minVisibleTime = Math.max(
              0,
              Math.min(startTime, maxStartForCenterAtEnd)
            );
            maxVisibleTime = Math.min(
              minVisibleTime + visibleTimeRange,
              Math.max(baseMaxTime, audioDuration + visibleTimeRange / 2)
            );
          }
        } else {
          // Fallback to original calculation if only reference pitch exists
          const centerTime = baseMaxTime / 2;
          const startTime = centerTime - visibleTimeRange / 2 + panTime;
          const maxStartForCenterAtEnd = Math.max(
            baseMaxTime - visibleTimeRange,
            audioDuration - visibleTimeRange / 2
          );
          minVisibleTime = Math.max(
            0,
            Math.min(startTime, maxStartForCenterAtEnd)
          );
          maxVisibleTime = Math.min(
            minVisibleTime + visibleTimeRange,
            Math.max(baseMaxTime, audioDuration + visibleTimeRange / 2)
          );
        }
      }

      // Store for scrollbar (using canvas as storage)
      (canvas as any).__minVisibleTime = minVisibleTime;
      (canvas as any).__maxVisibleTime = maxVisibleTime;

      // Get frequency range
      const refFreqs = referencePitch
        .map((p) => p.f_hz)
        .filter((f): f is number => f !== null && f !== undefined);
      const studentFreqs = studentPitch
        .map((p) => p.frequency)
        .filter((f): f is number => f !== null && f !== undefined);

      const allFreqs = [...refFreqs, ...studentFreqs];
      // Use fixed Y-axis range in full-screen mode when requested.
      // Auto-scale mode still caps extremes to keep readability.
      const useFixedRange = isFullScreen || fixedYAxis;
      const calculatedMinFreq = allFreqs.length > 0 ? Math.min(...allFreqs) : 60;
      const calculatedMaxFreq = allFreqs.length > 0 ? Math.max(...allFreqs) : 600;
      // Keep auto-scale in readable vocal range for this training UI.
      const cappedCalculatedMaxFreq = Math.min(calculatedMaxFreq, 600);
      const finalMinFreq = useFixedRange ? minFreq : calculatedMinFreq;
      const finalMaxFreq = useFixedRange ? maxFreq : Math.max(finalMinFreq + 40, cappedCalculatedMaxFreq);
      const freqRange = finalMaxFreq - finalMinFreq || 540;

      // Draw grid
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;

      // Horizontal grid lines (frequency)
      for (let i = 0; i <= 5; i++) {
        const freq = finalMinFreq + (freqRange * i) / 5;
        const y = displayHeight - padding - (i / 5) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(displayWidth - padding, y);
        ctx.stroke();

        // Frequency label
        ctx.fillStyle = "#64748b";
        ctx.font = "10px sans-serif";
        ctx.fillText(`${Math.round(freq)} Hz`, 5, y + 4);
      }

      // Vertical grid lines (time) - adjusted for zoom
      const actualVisibleRange = maxVisibleTime - minVisibleTime;
      const timeStep = actualVisibleRange / 10;
      for (let i = 0; i <= 10; i++) {
        const time = minVisibleTime + timeStep * i;
        if (time < 0 || time > baseMaxTime) continue;

        // Calculate x position: map time to position in visible range
        const x =
          padding + ((time - minVisibleTime) / actualVisibleRange) * graphWidth;
        if (x < padding || x > displayWidth - padding) continue;

        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, displayHeight - padding);
        ctx.stroke();

        // Time label
        ctx.fillStyle = "#64748b";
        ctx.font = "10px sans-serif";
        ctx.fillText(
          `${time.toFixed(1)}s`,
          x - 15,
          displayHeight - padding + 15
        );
      }

      // Draw axes
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, displayHeight - padding);
      ctx.lineTo(displayWidth - padding, displayHeight - padding);
      ctx.stroke();

      // Draw reference pitch (green) - full length, static
      // Reference pitch persists after playback stops (same as student pitch after practice stops)
      // Enhanced: Apply smoothing for smoother melodic flow (tarannum training)
      if (referencePitch.length > 0) {
        // Apply multi-pass smoothing to reference pitch for very smooth, curvilinear contour
        // Enhanced for tarannum training (0.8 tension, 2 passes for smoother melodic flow)
        const smoothedReferencePitch = smoothReferencePitch(
          referencePitch,
          0.8,
          2
        );

        ctx.strokeStyle = "#10b981"; // Green
        ctx.lineWidth = 2; // Slightly thinner so red line overwrites it more clearly
        ctx.beginPath();
        let firstPoint = true;
        let lastValidPoint: { x: number; y: number } | null = null;

        for (const point of smoothedReferencePitch) {
          if (point.f_hz === null || point.f_hz === undefined) continue;

          // CRITICAL: Always filter points outside visible range, regardless of fullscreen mode
          // This ensures the graph never extends beyond the axis boundaries
          if (point.time < minVisibleTime || point.time > maxVisibleTime) {
            continue;
          }

          // Map time to x position within visible range
          // Use actual visible range for calculation
          const actualVisibleRange = maxVisibleTime - minVisibleTime;
          const x =
            padding +
            ((point.time - minVisibleTime) / actualVisibleRange) * graphWidth;

          // CRITICAL: Clip x coordinate to canvas bounds to prevent drawing outside graph area
          const clippedX = Math.max(padding, Math.min(displayWidth - padding, x));

          const y =
            displayHeight -
            padding -
            ((point.f_hz - finalMinFreq) / freqRange) * graphHeight;

          if (firstPoint) {
            ctx.moveTo(clippedX, y);
            firstPoint = false;
          } else {
            ctx.lineTo(clippedX, y);
          }

          lastValidPoint = { x: clippedX, y };
        }

        // If we have a last valid point and the audio duration is longer than the last pitch point,
        // extend the line to the end of the audio duration (if visible)
        if (lastValidPoint && referenceDuration && referenceDuration > 0) {
          const lastPitchTime = Math.max(
            ...smoothedReferencePitch.map((p) => p.time)
          );
          const actualVisibleRange = maxVisibleTime - minVisibleTime;

          // CRITICAL: Only extend if referenceDuration is within visible range
          if (
            referenceDuration > lastPitchTime &&
            referenceDuration >= minVisibleTime &&
            referenceDuration <= maxVisibleTime
          ) {
            // Extend line to the end using the last valid frequency
            const endX =
              padding +
              ((referenceDuration - minVisibleTime) / actualVisibleRange) *
                graphWidth;

            // CRITICAL: Clip to canvas bounds to prevent drawing outside graph area
            const clippedEndX = Math.max(padding, Math.min(displayWidth - padding, endX));
            ctx.lineTo(clippedEndX, lastValidPoint.y);
          }
        }

        ctx.stroke();
      }

      // Shared render clock for both red filtering and blue cursor.
      let renderCursorTime = currentTime || 0;

      // Draw student pitch (red) - live, all points up to current time
      if (studentPitch.length > 0) {
        // Debug: Log student pitch data
        const validPoints = studentPitch.filter(
          (p) => p.frequency !== null && p.frequency !== undefined
        );
        console.log(`[Graph] Drawing student pitch:`, {
          totalPoints: studentPitch.length,
          validPoints: validPoints.length,
          isRecording,
          isPlaying,
          currentTime,
          minTime:
            studentPitch.length > 0
              ? Math.min(...studentPitch.map((p) => p.time))
              : 0,
          maxTime:
            studentPitch.length > 0
              ? Math.max(...studentPitch.map((p) => p.time))
              : 0,
          minVisibleTime,
          maxVisibleTime,
        });

        ctx.strokeStyle = "#ef4444"; // Red
        ctx.lineWidth = 3.5; // Thicker than reference (2.5) to ensure it overwrites/overlays the green line
        ctx.beginPath();
        let firstPoint = true;
        let lastValidPoint: { x: number; y: number } | null = null;

        const latestStudentTime =
          studentPitch.length > 0
            ? studentPitch[studentPitch.length - 1].time
            : 0;
        // Use one render clock for both red filtering and blue cursor.
        // In live mode, prefer currentTime when available to avoid red leading blue.
        renderCursorTime =
          isRecording && currentTime > 0
            ? Math.min(currentTime, latestStudentTime || currentTime)
            : isRecording
            ? latestStudentTime
            : currentTime || 0;
        const maxRenderTime =
          renderCursorTime && isFinite(renderCursorTime)
            ? renderCursorTime + 0.03
            : Infinity;
        const visibleStudentPitch = studentPitch.filter(
          (p) => p.time <= maxRenderTime
        );

        // Use raw live stream points to keep mode parity and avoid graph-side spike artifacts.
        const sortedPitch = [...visibleStudentPitch].sort(
          (a, b) => a.time - b.time
        );

        // Debug: Count points in visible range
        const pointsInRange = sortedPitch.filter(
          (p) => p.time >= minVisibleTime && p.time <= maxVisibleTime
        ).length;
        console.log(
          `[Graph] Student pitch points in visible range: ${pointsInRange} / ${sortedPitch.length}`
        );

        // Draw connected line while suppressing spike artifacts.
        let lastVoicedTime: number | null = null;
        let lastSmoothedY: number | null = null;
        let hadUnvoicedGap = false;
        const MAX_HZ_PER_SEC = 260;
        const EMA_ALPHA = 0.22;
        const RECONNECT_RAMP_SECONDS = 0.12;
        for (const point of sortedPitch) {
          // Skip points outside visible range
          if (point.time < minVisibleTime || point.time > maxVisibleTime)
            continue;

          // Map time to x position within visible range
          const actualVisibleRange = maxVisibleTime - minVisibleTime;
          const x =
            padding +
            ((point.time - minVisibleTime) / actualVisibleRange) * graphWidth;

          // CRITICAL: Clip x coordinate to canvas bounds to prevent drawing outside graph area
          const clippedX = Math.max(padding, Math.min(displayWidth - padding, x));

          if (point.frequency === null || point.frequency === undefined) {
            // Keep a continuous contour by carrying the last voiced level
            // across unvoiced gaps.
            if (lastValidPoint !== null) {
              ctx.lineTo(clippedX, lastValidPoint.y);
              lastValidPoint = { x: clippedX, y: lastValidPoint.y };
              hadUnvoicedGap = true;
            }
            lastSmoothedY = null;
            continue;
          }

          const rawY =
            displayHeight -
            padding -
            ((point.frequency - finalMinFreq) / freqRange) * graphHeight;
          let y = rawY;

          // Display-only smoothing for natural contour without mutating source pitch.
          if (lastSmoothedY !== null) {
            y = lastSmoothedY + (rawY - lastSmoothedY) * EMA_ALPHA;
          }

          if (firstPoint || lastValidPoint === null) {
            ctx.moveTo(clippedX, y);
            firstPoint = false;
          } else {
            // Slope limiter: suppress impossible jump spikes while keeping continuity.
            const rawDeltaSec = Math.max(
              point.time - (lastVoicedTime || point.time),
              0.001
            );
            const deltaSec = hadUnvoicedGap
              ? Math.min(rawDeltaSec, RECONNECT_RAMP_SECONDS)
              : rawDeltaSec;
            const maxDeltaY = (MAX_HZ_PER_SEC * deltaSec * graphHeight) / freqRange;
            const rawDeltaY = y - lastValidPoint.y;
            if (Math.abs(rawDeltaY) > maxDeltaY) {
              y =
                lastValidPoint.y +
                Math.sign(rawDeltaY) * maxDeltaY;
            }
            ctx.lineTo(clippedX, y);
          }

          lastValidPoint = { x: clippedX, y };
          lastVoicedTime = point.time;
          lastSmoothedY = y;
          hadUnvoicedGap = false;
        }
        ctx.stroke();
      }

      // Draw current time cursor (blue vertical line) - shows during recording and playback
      // The line moves from start until it reaches the center of the visible viewport,
      // then remains fixed at center while the graph scrolls, allowing future pitch data to appear on the right
      //
      const effectiveCursorTime = renderCursorTime;

      if (effectiveCursorTime > 0 && baseMaxTime > 0) {
        ctx.strokeStyle = "#3b82f6"; // Blue
        ctx.lineWidth = 2.5;

        const actualVisibleRange = maxVisibleTime - minVisibleTime;
        const centerTime = (minVisibleTime + maxVisibleTime) / 2;
        const centerX = padding + graphWidth / 2;

        let cursorX: number;

        if (effectiveCursorTime < centerTime) {
          cursorX = padding + ((effectiveCursorTime - minVisibleTime) / actualVisibleRange) * graphWidth;
          cursorX = Math.min(cursorX, centerX);
        } else {
          cursorX = centerX;
        }

        // Ensure cursor is within visible area
        if (cursorX >= padding && cursorX <= displayWidth - padding) {
          ctx.beginPath();
          ctx.moveTo(cursorX, padding);
          ctx.lineTo(cursorX, displayHeight - padding);
          ctx.stroke();

          // Add a small circle at the top of the cursor for better visibility
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath();
          ctx.arc(cursorX, padding, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Draw training markers (for unclear/unstable segments)
      if (markers && markers.length > 0) {
        const actualVisibleRange = maxVisibleTime - minVisibleTime;

        for (const marker of markers) {
          // Skip markers outside visible range
          if (marker.time < minVisibleTime || marker.time > maxVisibleTime)
            continue;

          // Find corresponding pitch point for y position
          const markerPitchPoint = studentPitch.find(
            (p) => Math.abs(p.time - marker.time) < 0.1
          );

          // Calculate x position
          const x =
            padding +
            ((marker.time - minVisibleTime) / actualVisibleRange) * graphWidth;

          // Calculate y position - use marker's pitch if available, otherwise use middle of graph
          let y: number;
          if (
            markerPitchPoint &&
            markerPitchPoint.frequency !== null &&
            markerPitchPoint.frequency !== undefined
          ) {
            y =
              displayHeight -
              padding -
              ((markerPitchPoint.frequency - finalMinFreq) / freqRange) *
                graphHeight;
          } else {
            // Place marker in middle of graph if no pitch data
            y = displayHeight / 2;
          }

          // Set color based on severity
          let markerColor: string;
          let markerSize: number;
          if (marker.severity === "high") {
            markerColor = "#ef4444"; // Red
            markerSize = 8;
          } else if (marker.severity === "medium") {
            markerColor = "#f97316"; // Orange
            markerSize = 6;
          } else {
            markerColor = "#fbbf24"; // Yellow
            markerSize = 5;
          }

          // Draw marker circle
          ctx.fillStyle = markerColor;
          ctx.beginPath();
          ctx.arc(x, y, markerSize, 0, 2 * Math.PI);
          ctx.fill();

          // Draw border for better visibility
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Draw legend
      ctx.fillStyle = "#1e293b";
      ctx.font = "12px sans-serif";
      ctx.fillText("Reference (Green)", displayWidth - 150, 20);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("Student (Red)", displayWidth - 150, 40);

      // Add markers to legend if any exist
      if (markers && markers.length > 0) {
        ctx.fillStyle = "#fbbf24";
        ctx.fillText("Markers (Guidance)", displayWidth - 150, 60);
      }
    };

    // Initial draw - with delay to ensure canvas is sized
    const initialDraw = () => {
      // Check if canvas is ready before drawing
      if (canvas.width > 0 && canvas.height > 0) {
        draw();
      } else {
        // Retry if canvas not ready yet (especially important for fullscreen)
        requestAnimationFrame(initialDraw);
      }
    };

    // Use requestAnimationFrame to ensure canvas is ready
    requestAnimationFrame(initialDraw);

    // Continuous animation loop for practice mode or playback
    const animate = () => {
      // Only draw if canvas has valid dimensions
      if (canvas.width > 0 && canvas.height > 0) {
        draw();
      }

      // Continue animation if recording (practice mode), playing, or we have pitch data
      // CRITICAL: Keep animation running if we have pitch data, even after practice/playback stops
      // This ensures both student and reference graphs remain visible after practice/playback ends
      if (
        isRecording ||
        isPlaying ||
        studentPitch.length > 0 || // Keep running if student pitch exists (even after practice stops)
        referencePitch.length > 0 // Keep running if reference pitch exists (even after playback stops)
      ) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Only stop if we truly have no data to display
        animationFrameRef.current = null;
      }
    };

    // Start animation loop if needed
    // Keep animation running if we have pitch data, even if not recording/playing
    // This ensures graphs remain visible after practice/recording/playback ends
    // IMPORTANT: Always run animation during recording, even if studentPitch is empty initially
    if (
      isRecording || // Always animate during recording (data will come in)
      isPlaying ||
      studentPitch.length > 0 || // Start/continue if student pitch exists (even after practice stops)
      referencePitch.length > 0 // Start/continue if reference pitch exists (even after playback stops)
    ) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      // Even if not animating, ensure we draw at least once after canvas is ready
      const delayedDraw = () => {
        if (canvas.width > 0 && canvas.height > 0) {
          draw();
        } else {
          requestAnimationFrame(delayedDraw);
        }
      };
      requestAnimationFrame(delayedDraw);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    referencePitch,
    studentPitch,
    isRecording,
    isPlaying,
    currentTime,
    height,
    effectiveZoomLevel,
    panOffset,
    referenceDuration,
    isFullScreen, // Add isFullScreen to trigger redraw when entering fullscreen
    markers, // Include markers to trigger redraw when they change
    // Don't include .length - it changes too frequently and causes blinking
    // The array reference changes are enough to trigger updates
  ]);

  // Force redraw when playback state changes (especially when reference audio starts)
  useEffect(() => {
    if (isPlaying && referencePitch.length > 0) {
      // Force immediate redraw when playback starts
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Trigger a redraw by calling the draw function
          // The animation loop will handle continuous updates
          requestAnimationFrame(() => {
            // This will be handled by the main draw effect
          });
        }
      }
    }
  }, [isPlaying, referencePitch.length]);

  // CRITICAL: Ensure animation continues when practice stops but student pitch data exists
  // This prevents the graph from disappearing after practice ends OR after test completes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // If we have student pitch data (either from practice or test), ensure animation continues
    // This covers both cases:
    // 1. Practice just stopped (isRecording changed from true to false)
    // 2. Test just completed (studentPitch changed from [] to having data)
    if (!isRecording && !isPlaying && studentPitch.length > 0) {
      // Force the main draw effect to restart by dispatching a resize event
      // This ensures the animation loop restarts with the new student pitch data
      // Use multiple timeouts to handle React state update timing
      const timeoutId1 = setTimeout(() => {
        // Check if animation stopped (shouldn't happen, but safeguard)
        if (animationFrameRef.current === null && studentPitch.length > 0) {
          // Trigger a resize event to force the main draw effect to re-evaluate
          // The main effect will restart the animation loop because studentPitch.length > 0
          window.dispatchEvent(new Event("resize"));
        }
      }, 50);

      // Additional safeguard with longer delay to catch any timing issues
      const timeoutId2 = setTimeout(() => {
        if (animationFrameRef.current === null && studentPitch.length > 0) {
          window.dispatchEvent(new Event("resize"));
        }
      }, 200);

      // Final safeguard with even longer delay
      const timeoutId3 = setTimeout(() => {
        if (
          animationFrameRef.current === null &&
          studentPitch.length > 0 &&
          canvas.width > 0 &&
          canvas.height > 0
        ) {
          window.dispatchEvent(new Event("resize"));
        }
      }, 500);

      return () => {
        clearTimeout(timeoutId1);
        clearTimeout(timeoutId2);
        clearTimeout(timeoutId3);
      };
    }
  }, [isRecording, isPlaying, studentPitch.length]);

  // TEST MODE: Ensure animation continues when recording stops but recordingPitchData exists
  // This is a specific safeguard for test mode - when recording stops, ensure graph remains visible
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Test mode scenario: recording just stopped, but we have student pitch data
    // isRecording changed from true to false, but studentPitch.length > 0
    if (!isRecording && !isPlaying && studentPitch.length > 0) {
      // Check if animation stopped unexpectedly
      const checkAndRestart = () => {
        if (animationFrameRef.current === null && studentPitch.length > 0) {
          // Force restart by dispatching resize event
          // This will trigger the main draw effect to restart animation
          window.dispatchEvent(new Event("resize"));
        }
      };

      // Check immediately and after delays to handle React state update timing
      const timeoutId1 = setTimeout(checkAndRestart, 50);
      const timeoutId2 = setTimeout(checkAndRestart, 200);
      const timeoutId3 = setTimeout(checkAndRestart, 500);

      return () => {
        clearTimeout(timeoutId1);
        clearTimeout(timeoutId2);
        clearTimeout(timeoutId3);
      };
    }
  }, [isRecording, isPlaying, studentPitch.length]);

  // CRITICAL: Ensure animation continues when playback stops but reference pitch data exists
  // This prevents the reference pitch graph from disappearing after playback ends
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    // If playback just stopped (isPlaying changed from true to false)
    // but we have reference pitch data, ensure animation continues
    // This is a safeguard - the main draw effect should handle this, but restart if needed
    if (!isRecording && !isPlaying && referencePitch.length > 0) {
      // Small delay to ensure main effect has completed its cleanup
      const timeoutId = setTimeout(() => {
        // Check if animation stopped (shouldn't happen, but safeguard)
        if (animationFrameRef.current === null) {
          // Force the main draw effect to restart by dispatching a resize event
          window.dispatchEvent(new Event("resize"));
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [isRecording, isPlaying, referencePitch.length]);

  // CRITICAL: Explicitly restart animation when student pitch data becomes available (e.g., after test completes)
  // This ensures the student graph is drawn immediately when analysisResult sets new student pitch data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    // When student pitch data becomes available (length changes from 0 to >0)
    // and we're not recording/playing, ensure animation starts to display the graph
    if (!isRecording && !isPlaying && studentPitch.length > 0) {
      // Force restart animation loop immediately
      const timeoutId = setTimeout(() => {
        // If animation isn't running, restart it
        if (animationFrameRef.current === null) {
          // Trigger the main draw effect to restart by dispatching a resize event
          window.dispatchEvent(new Event("resize"));
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [studentPitch.length, isRecording, isPlaying]);

  // Calculate scrollbar values
  const getScrollbarValues = () => {
    const refMaxTime =
      referencePitch.length > 0
        ? Math.max(...referencePitch.map((p) => p.time))
        : 0;
    const audioDuration =
      referenceDuration && referenceDuration > 0
        ? referenceDuration
        : refMaxTime;
    const baseMaxTime = Math.max(audioDuration, currentTime || 0, 10);

    const visibleTimeRange = baseMaxTime / effectiveZoomLevel;
    const maxPanTime = Math.max(0, baseMaxTime - visibleTimeRange);

    // Calculate scrollbar position (0 to 100)
    const padding = 60;
    const canvas = canvasRef.current;
    const graphWidth = canvas ? canvas.width - padding * 2 : 800;
    const pixelsPerSecond = graphWidth / visibleTimeRange;
    const panTime = panOffset / pixelsPerSecond;

    // Get visible time range from canvas (set during draw)
    const minVisibleTime = (canvas as any)?.__minVisibleTime ?? 0;
    const maxVisibleTime = (canvas as any)?.__maxVisibleTime ?? baseMaxTime;

    // Normalize pan to 0-100 range
    // When panTime = -maxPanTime/2, we're at the start (0%)
    // When panTime = maxPanTime/2, we're at the end (100%)
    const scrollPosition =
      maxPanTime > 0 ? ((panTime + maxPanTime / 2) / maxPanTime) * 100 : 50;

    // Scrollbar thumb size (represents visible range)
    const thumbSize = Math.max(5, (visibleTimeRange / baseMaxTime) * 100);

    return {
      scrollPosition: Math.max(0, Math.min(100, scrollPosition)),
      thumbSize: Math.max(5, Math.min(100, thumbSize)),
      maxPanTime,
      visibleTimeRange,
      baseMaxTime,
      minVisibleTime,
      maxVisibleTime,
    };
  };

  // Handle scrollbar change
  const handleScrollbarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const scrollbarValues = getScrollbarValues();

    if (scrollbarValues.maxPanTime > 0) {
      // Convert scrollbar value (0-100) to pan time
      const normalizedValue = value / 100;
      const panTime =
        normalizedValue * scrollbarValues.maxPanTime -
        scrollbarValues.maxPanTime / 2;

      // Convert pan time to pixels
      const padding = 60;
      const canvas = canvasRef.current;
      const graphWidth = canvas ? canvas.width - padding * 2 : 800;
      const pixelsPerSecond = graphWidth / scrollbarValues.visibleTimeRange;
      setPanOffset(panTime * pixelsPerSecond);
    }
  };

  const scrollbarValues = getScrollbarValues();

  return (
    <div
      ref={containerRef}
      className='w-full'
      style={{
        width: "100%",
      }}
    >
      {/* Zoom Controls - Hidden in full-screen mode */}
      {!isFullScreen && (
        <div className='flex items-center justify-between mb-2 px-1'>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-slate-600 font-medium'>Zoom:</span>
            <button
              onClick={handleZoomOut}
              disabled={effectiveZoomLevel <= 0.5}
              className='p-1.5 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              title='Zoom Out'
            >
              <ZoomOut size={16} className='text-slate-600' />
            </button>
            <span className='text-xs font-semibold text-slate-700 min-w-[50px] text-center'>
              {Math.round(effectiveZoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={effectiveZoomLevel >= 4.0}
              className='p-1.5 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              title='Zoom In'
            >
              <ZoomIn size={16} className='text-slate-600' />
            </button>
            <button
              onClick={handleZoomReset}
              className='p-1.5 rounded hover:bg-slate-100 transition-colors'
              title='Reset Zoom'
            >
              <RotateCcw size={14} className='text-slate-600' />
            </button>
            <button
              onClick={handleZoomFit}
              className='p-1.5 rounded hover:bg-slate-100 transition-colors'
              title='Fit to Data'
            >
              <Maximize2 size={14} className='text-slate-600' />
            </button>
            <button
              onClick={() => {
                setAutoFollow(!autoFollow);
                if (!autoFollow) {
                  setManualPanActive(false);
                }
              }}
              className={`p-1.5 rounded transition-colors ${
                autoFollow
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              title={
                autoFollow
                  ? "Auto-follow enabled (click to disable)"
                  : "Auto-follow disabled (click to enable)"
              }
            >
              <span className='text-xs'>📍</span>
            </button>
          </div>
          {effectiveZoomLevel > 1.0 && (
            <span className='text-xs text-slate-500'>
              {autoFollow ? "Auto-following • " : ""}Drag to pan • Scroll to
              zoom
            </span>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${
          isFullScreen
            ? "border-2 border-slate-700 rounded-xl bg-white"
            : "border border-slate-300 rounded-lg bg-white"
        } ${
          !isFullScreen && effectiveZoomLevel > 1.0
            ? "cursor-grab active:cursor-grabbing"
            : ""
        }`}
        style={{
          display: "block",
          cursor: markers && markers.length > 0 ? "pointer" : "default",
        }}
        onClick={(e) => {
          if (!onMarkerClick || !markers || markers.length === 0) return;

          const canvas = canvasRef.current;
          if (!canvas) return;

          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const displayWidth = canvas.width / dpr;
          const displayHeight = canvas.height / dpr;

          const padding = 60;
          const graphWidth = displayWidth - padding * 2;
          const graphHeight = displayHeight - padding * 2;

          // Get click position relative to canvas
          const clickX = ((e.clientX - rect.left) * dpr) / dpr;
          const clickY = ((e.clientY - rect.top) * dpr) / dpr;

          // Get visible time range from canvas
          const minVisibleTime = (canvas as any)?.__minVisibleTime ?? 0;
          const maxVisibleTime =
            (canvas as any)?.__maxVisibleTime ?? (referenceDuration || 10);
          const actualVisibleRange = maxVisibleTime - minVisibleTime;

          // Convert click X to time
          const clickedTime =
            minVisibleTime +
            ((clickX - padding) / graphWidth) * actualVisibleRange;

          // Find nearest marker (within 0.2 seconds)
          const nearestMarker = markers.find(
            (m) => Math.abs(m.time - clickedTime) < 0.2
          );

          if (nearestMarker) {
            onMarkerClick(nearestMarker.time);
          }
        }}
        title={
          markers && markers.length > 0
            ? "Click markers to seek to timestamp"
            : undefined
        }
      />
      {/* Horizontal Scrollbar for X-axis - Show when zoomed */}
      {effectiveZoomLevel > 1.0 && scrollbarValues.maxPanTime > 0 && (
        <div className='mt-3 px-4 py-2 border-t border-slate-200 bg-slate-50'>
          <div className='flex items-center gap-3'>
            <span className='text-xs font-medium text-slate-700 min-w-[50px]'>
              {scrollbarValues.minVisibleTime?.toFixed(1) || "0.0"}s
            </span>
            <div className='flex-1 relative'>
              <input
                type='range'
                min='0'
                max='100'
                step='0.1'
                value={scrollbarValues.scrollPosition}
                onChange={handleScrollbarChange}
                className='w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider'
                style={{
                  background: `linear-gradient(to right,
                    #10b981 0%,
                    #10b981 ${scrollbarValues.scrollPosition}%,
                    #cbd5e1 ${scrollbarValues.scrollPosition}%,
                    #cbd5e1 100%)`,
                }}
                title={`Pan: ${
                  scrollbarValues.minVisibleTime?.toFixed(1) || "0.0"
                }s - ${scrollbarValues.maxVisibleTime?.toFixed(1) || "0.0"}s`}
              />
            </div>
            <span className='text-xs font-medium text-slate-700 min-w-[50px] text-right'>
              {scrollbarValues.baseMaxTime?.toFixed(1) || "0.0"}s
            </span>
          </div>
        </div>
      )}
      {/* Time-axis note: tracking line = reference playback; student pitch can appear offset if tempo differs */}
      <p className='mt-1.5 px-1 text-[10px] text-slate-500' title='The blue line shows reference playback position. Student (red) pitch uses the same time axis; if you recited at a different tempo, the red line may appear ahead or behind the blue line.'>
        Time axis: reference playback. Student pitch may appear offset if tempo differs.
      </p>
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #10b981;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }
        .slider::-webkit-slider-thumb:hover {
          background: #059669;
          transform: scale(1.1);
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #10b981;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }
        .slider::-moz-range-thumb:hover {
          background: #059669;
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};

export default LivePitchGraph;
