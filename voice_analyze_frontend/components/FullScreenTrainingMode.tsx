import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
  Mic,
  MicOff,
  Target,
  Repeat2,
} from "lucide-react";
import { PitchPoint } from "../services/pitchExtractor";
import { PitchData, AyahTiming } from "../types";
import LivePitchGraph from "./LivePitchGraph";
import CombinedWaveformPitch from "./CombinedWaveformPitch";
import LiveHzDisplay from "./LiveHzDisplay";
import AyahTextDisplay from "./AyahTextDisplay";
import FullScreenAyahTextDisplay from "./FullScreenAyahTextDisplay";
import Countdown from "./Countdown";

interface FullScreenTrainingModeProps {
  isOpen: boolean;
  onClose: () => void;
  referencePitch: PitchData[];
  studentPitch: PitchPoint[];
  isRecording: boolean;
  isPlaying: boolean;
  currentTime: number;
  referenceDuration?: number;
  // Waveform removed - only pitch graph is displayed
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  // NEW: Enhanced controls
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  loopMode?: boolean;
  onLoopModeChange?: (enabled: boolean) => void;
  isRepeatAyahEnabled?: boolean;
  onRepeatAyahToggle?: () => void;
  canRepeatAyah?: boolean;
  loopStart?: number;
  loopEnd?: number;
  onLoopRangeChange?: (start: number, end: number) => void;
  theme?: "dark" | "light" | "high-contrast";
  onThemeChange?: (theme: "dark" | "light" | "high-contrast") => void;
  zoomLevel?: number;
  onZoomChange?: (zoom: number) => void;
  showMetronome?: boolean;
  onMetronomeToggle?: (enabled: boolean) => void;
  showReferenceOverlay?: boolean;
  onReferenceOverlayToggle?: (enabled: boolean) => void;
  // Practice mode props
  isPracticeMode?: boolean;
  onPrimeReferenceAudio?: () => void;
  onPracticeStart?: () => void;
  onPracticeStop?: () => void;
  onPracticeRestart?: () => void;
  practiceTime?: number;
  practiceAttempts?: number;
  isRecordingSession?: boolean;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  // Recorded student voice audio props
  practiceAudioUrl?: string | null;
  isPlayingPracticeAudio?: boolean;
  practiceAudioTime?: number; // Current playback time of practice audio
  practiceAudioDuration?: number; // Duration of practice audio
  onPlayPracticeAudio?: () => void;
  onPausePracticeAudio?: () => void;
  onStopPracticeAudio?: () => void;
  // Quran text display props
  ayatTiming?: AyahTiming[];
  onSeekToTime?: (time: number) => void;
  // Training markers props
  markers?: Array<{
    time: number;
    reason: string;
    severity: "low" | "medium" | "high";
  }>;
  // Waveform props
  referenceUrl?: string | null;
  studentBlob?: Blob | null;
  fullscreenContext?: "practice" | "recording";
}

const FullScreenTrainingMode: React.FC<FullScreenTrainingModeProps> = ({
  isOpen,
  onClose,
  referencePitch,
  studentPitch,
  isRecording,
  isPlaying,
  currentTime,
  referenceDuration = 0,
  onPlay,
  onPause,
  onStop,
  onRestart,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  volume = 1.0,
  onVolumeChange,
  loopMode = false,
  onLoopModeChange,
  isRepeatAyahEnabled = false,
  onRepeatAyahToggle,
  canRepeatAyah = false,
  loopStart,
  loopEnd,
  onLoopRangeChange,
  theme = "dark",
  onThemeChange,
  zoomLevel = 1.0,
  onZoomChange,
  showMetronome = false,
  onMetronomeToggle,
  showReferenceOverlay = true,
  onReferenceOverlayToggle,
  isPracticeMode = false,
  onPrimeReferenceAudio,
  onPracticeStart,
  onPracticeStop,
  onPracticeRestart,
  practiceTime = 0,
  practiceAttempts = 0,
  isRecordingSession = false,
  onRecordingStart,
  onRecordingStop,
  practiceAudioUrl = null,
  isPlayingPracticeAudio = false,
  practiceAudioTime = 0,
  practiceAudioDuration = 0,
  onPlayPracticeAudio,
  onPausePracticeAudio,
  onStopPracticeAudio,
  ayatTiming = [],
  onSeekToTime,
  markers = [],
  referenceUrl,
  studentBlob,
  fullscreenContext = "recording",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPracticeStats, setShowPracticeStats] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [micStatus, setMicStatus] = useState<
    "idle" | "checking" | "ready" | "blocked" | "unavailable"
  >("idle");
  const [micStatusMessage, setMicStatusMessage] = useState("");
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  }));

  // Format time display
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePracticeToggle = React.useCallback(async () => {
    if (isPracticeMode) {
      setShowCountdown(false);
      setMicStatus("idle");
      setMicStatusMessage("");
      onPracticeStop?.();
    } else {
      setMicStatus("checking");
      setMicStatusMessage("Checking microphone...");

      try {
        if (typeof window !== "undefined" && !window.isSecureContext) {
          throw new Error("secure-context-required");
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("microphone-unavailable");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1,
          },
        });

        stream.getTracks().forEach((track) => track.stop());
        setMicStatus("ready");
        setMicStatusMessage("Microphone ready");
        onPrimeReferenceAudio?.();

        window.setTimeout(() => {
          setShowCountdown(true);
        }, 350);
      } catch (error: any) {
        const unavailable =
          error?.message === "microphone-unavailable" ||
          error?.name === "NotFoundError" ||
          error?.name === "DevicesNotFoundError";
        setMicStatus(unavailable ? "unavailable" : "blocked");
        setMicStatusMessage(
          unavailable
            ? "Microphone unavailable"
            : "Please allow microphone access"
        );
      }
    }
  }, [isPracticeMode, onPracticeStop, onPrimeReferenceAudio]);

  const handleStopWithCountdownCancel = React.useCallback(() => {
    setShowCountdown(false);
    onStop();
  }, [onStop]);

  const handleCloseWithCountdownCancel = React.useCallback(() => {
    setShowCountdown(false);
    onClose();
  }, [onClose]);

  const handleRecordingCancel = React.useCallback(() => {
    setShowCountdown(false);
    if (isRecordingSession) {
      onRecordingStop?.();
    }
    onClose();
  }, [isRecordingSession, onClose, onRecordingStop]);

  const handleCountdownComplete = React.useCallback(() => {
    setShowCountdown(false);
    setMicStatus("idle");
    setMicStatusMessage("");
    onPracticeStart?.();
  }, [onPracticeStart]);

  const handleCountdownCancel = React.useCallback(() => {
    setShowCountdown(false);
    setMicStatus("idle");
    setMicStatusMessage("");
  }, []);

  // Calculate progress percentage
  const progressPercent =
    referenceDuration > 0 ? (currentTime / referenceDuration) * 100 : 0;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  // Calculate graph height for full-screen with responsive mobile/tablet behavior.
  const getGraphHeight = () => {
    if (typeof window === "undefined") {
      return 420;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLandscape = w > h;
    const isTouchTablet =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;

    const isPhoneViewport = w < 640 || (isLandscape && h < 640 && w < 1024);

    // Phone
    if (isPhoneViewport) {
      return isLandscape
        ? clamp(Math.floor(h * 0.58), 170, 340)
        : clamp(Math.floor(h * 0.43), 260, 390);
    }

    // Tablet / classroom landscape: leave room for current and next ayah panels.
    if (isTouchTablet && w >= 768 && w <= 1400 && isLandscape) {
      return clamp(Math.floor(h * 0.54), 360, 480);
    }

    // Tablet
    if (w < 1024) {
      return isLandscape
        ? clamp(Math.floor(h * 0.5), 240, 380)
        : clamp(Math.floor(h * 0.4), 240, 360);
    }

    // Desktop/larger screens
    return clamp(Math.floor(h * 0.48), 300, 560);
  };

  const [graphHeight, setGraphHeight] = React.useState(getGraphHeight());

  // Update graph height on window resize
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setGraphHeight(getGraphHeight());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen]);

  // Force graph resize when fullscreen opens
  useEffect(() => {
    if (!isOpen) return;

    // Trigger resize after a brief delay to ensure layout is complete
    const timeoutId1 = setTimeout(() => {
      setGraphHeight(getGraphHeight());
      // Force window resize event to trigger canvas resize
      window.dispatchEvent(new Event("resize"));
    }, 50);

    const timeoutId2 = setTimeout(() => {
      setGraphHeight(getGraphHeight());
      window.dispatchEvent(new Event("resize"));
    }, 150);

    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [isOpen]);

  // Prevent body scroll when full-screen is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ENHANCEMENT: Enhanced keyboard shortcuts with accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for our shortcuts (unless in input field)
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleCloseWithCountdownCancel();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (isPlaying) {
          onPause();
        } else {
          onPlay();
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onRestart();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleStopWithCountdownCancel();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        if (onZoomChange) {
          onZoomChange(Math.min(2.0, zoomLevel + 0.1));
        }
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        if (onZoomChange) {
          onZoomChange(Math.max(0.5, zoomLevel - 0.1));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        // Seek backward 5 seconds (if supported)
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        // Seek forward 5 seconds (if supported)
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (onMetronomeToggle) {
          onMetronomeToggle(!showMetronome);
        }
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        if (onLoopModeChange) {
          onLoopModeChange(!loopMode);
        }
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        handlePracticeToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    isPlaying,
    handleCloseWithCountdownCancel,
    onPlay,
    onPause,
    handleStopWithCountdownCancel,
    onRestart,
    zoomLevel,
    onZoomChange,
    showMetronome,
    onMetronomeToggle,
    loopMode,
    onLoopModeChange,
    handlePracticeToggle,
  ]);

  // Note: Wheel zoom is handled by LivePitchGraph component for consistency with regular mode

  // ENHANCEMENT: Theme-based styling
  const themeClasses = {
    dark: {
      bg: "bg-slate-900",
      controlsBg: "bg-slate-800/90",
      border: "border-slate-700",
      text: "text-slate-300",
      textMuted: "text-slate-400",
    },
    light: {
      bg: "bg-gray-50",
      controlsBg: "bg-white/90",
      border: "border-gray-300",
      text: "text-gray-800",
      textMuted: "text-gray-600",
    },
    "high-contrast": {
      bg: "bg-black",
      controlsBg: "bg-gray-900/95",
      border: "border-white",
      text: "text-white",
      textMuted: "text-gray-300",
    },
  };

  const currentTheme = themeClasses[theme];
  const isLandscape = viewport.width > viewport.height;
  const isPhoneViewport =
    viewport.width < 640 ||
    (isLandscape && viewport.height < 640 && viewport.width < 1024);
  const isMobile = isPhoneViewport;
  const isTablet = viewport.width >= 640 && viewport.width < 1024;
  const isTouchTablet =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  const isClassroomLayout =
    !isPhoneViewport &&
    isTouchTablet &&
    viewport.width >= 768 &&
    viewport.width <= 1400 &&
    isLandscape;
  const compactControls = isMobile || isClassroomLayout || (isTablet && isLandscape);
  const isPracticeContext = fullscreenContext === "practice";
  const isRecordingContext = fullscreenContext === "recording";
  const isHomePracticeMobile = isMobile && isPracticeContext;
  const isHomePracticeLandscape = isHomePracticeMobile && isLandscape;
  const defaultHomePracticeZoom = isLandscape ? 1.7 : 2.2;
  const homePracticeTimelineZoom =
    isHomePracticeMobile && zoomLevel <= 1.01
      ? defaultHomePracticeZoom
      : zoomLevel;
  const handleHomePracticeZoomOut = React.useCallback(() => {
    onZoomChange?.(Math.max(1.2, homePracticeTimelineZoom - 0.3));
  }, [homePracticeTimelineZoom, onZoomChange]);
  const handleHomePracticeZoomIn = React.useCallback(() => {
    onZoomChange?.(Math.min(4.0, homePracticeTimelineZoom + 0.3));
  }, [homePracticeTimelineZoom, onZoomChange]);
  const graphIsPlaying =
    isPlaying ||
    isPlayingPracticeAudio ||
    (isRecordingContext && isRecordingSession && currentTime > 0);
  const activeAyahIndex = ayatTiming.reduce((activeIndex, ayah, index) => {
    if (currentTime >= ayah.start && currentTime < ayah.end) {
      return index;
    }
    if (currentTime >= ayah.start) {
      return index;
    }
    return activeIndex;
  }, ayatTiming.length > 0 ? 0 : -1);
  const latestStudentFrequency = (() => {
    for (let index = studentPitch.length - 1; index >= 0; index--) {
      const frequency = studentPitch[index]?.frequency;
      if (frequency !== null && frequency !== undefined && isFinite(frequency)) {
        return frequency;
      }
    }
    return null;
  })();
  const landscapeGraphHeight = clamp(viewport.height - 112, 170, 340);
  const displayGraphHeight = isHomePracticeLandscape
    ? landscapeGraphHeight
    : graphHeight;

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 ${currentTheme.bg} flex flex-col items-center justify-center`}
      style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      role='dialog'
      aria-modal='true'
      aria-label='Full-screen training mode'
    >
      {/* ENHANCEMENT: Top Right Controls - Theme, Practice Stats, and Zoom Status */}
      <div className={`${isClassroomLayout || isHomePracticeLandscape ? "hidden" : "absolute top-2 right-2 z-10 flex"} items-center gap-2 max-w-[calc(100%-1rem)] overflow-x-auto`}>
        {/* Zoom Status Display */}
        {onZoomChange && (
          <div className={`hidden sm:block px-3 py-1.5 rounded ${currentTheme.controlsBg} border ${currentTheme.border} ${currentTheme.text} text-sm font-medium backdrop-blur-sm`}>
            Zoom: {Math.round((zoomLevel || 1.0) * 100)}%
          </div>
        )}
        {/* Practice Statistics Toggle */}
        {isPracticeMode && practiceAttempts > 0 && (
          <button
            onClick={() => setShowPracticeStats(!showPracticeStats)}
            className={`px-2 py-1 rounded ${currentTheme.controlsBg} border ${currentTheme.border} ${currentTheme.text} text-xs hover:opacity-80 transition-opacity backdrop-blur-sm flex items-center gap-1`}
            title='Toggle practice statistics'
            aria-label='Toggle practice statistics'
          >
            <Target size={12} />
            Stats
          </button>
        )}

        {/* Theme Toggle */}
        {onThemeChange && (
          <button
            onClick={() => {
              const themes: ("dark" | "light" | "high-contrast")[] = [
                "dark",
                "light",
                "high-contrast",
              ];
              const currentIndex = themes.indexOf(
                theme as "dark" | "light" | "high-contrast"
              );
              const nextIndex = (currentIndex + 1) % themes.length;
              onThemeChange(themes[nextIndex]);
            }}
            className={`px-2 py-1 rounded ${currentTheme.controlsBg} border ${currentTheme.border} ${currentTheme.text} text-xs hover:opacity-80 transition-opacity backdrop-blur-sm`}
            title='Toggle theme'
            aria-label='Toggle theme'
          >
            Theme
          </button>
        )}
      </div>

      {/* Practice Statistics Panel */}
      {showPracticeStats && isPracticeMode && (
        <div
          className={`absolute top-12 right-2 ${currentTheme.controlsBg} border ${currentTheme.border} rounded-lg p-3 shadow-xl w-[min(260px,90vw)] z-10 backdrop-blur-sm`}
        >
          <div className={`text-xs font-semibold ${currentTheme.text} mb-2`}>
            Practice Statistics
          </div>
          <div className={`space-y-1.5 text-xs ${currentTheme.textMuted}`}>
            <div className='flex justify-between'>
              <span>Attempts:</span>
              <span className={currentTheme.text}>{practiceAttempts}</span>
            </div>
            <div className='flex justify-between'>
              <span>Current Time:</span>
              <span className={currentTheme.text}>
                {formatTime(practiceTime)}
              </span>
            </div>
            {referenceDuration > 0 && (
              <div className='flex justify-between'>
                <span>Progress:</span>
                <span className={currentTheme.text}>
                  {Math.round((practiceTime / referenceDuration) * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Pitch Graph Area - Optimized for exact fit */}
      <div className={`flex-1 flex flex-col w-full px-2 sm:px-4 ${isClassroomLayout ? "pt-2 pb-1" : isHomePracticeMobile ? "pt-2 pb-1" : "pt-10 sm:pt-12 pb-2"} overflow-hidden`}>
        {/* ENHANCEMENT: Live Hz Display with Timeline - Smaller in full-screen */}
        <div className={`${isHomePracticeLandscape ? "hidden" : isClassroomLayout ? "mb-1 flex w-full max-w-[98%] items-center gap-2 mx-auto" : "mb-1 sm:mb-2 w-full max-w-[96%] sm:max-w-[90%] mx-auto"}`}>
          <div className='min-w-0 flex-1'>
            <LiveHzDisplay
              pitchData={studentPitch}
              isFullScreen={true}
              currentTime={currentTime}
              referenceDuration={referenceDuration}
              progressPercent={progressPercent}
              formatTime={formatTime}
              theme={currentTheme}
            />
          </div>
          {isClassroomLayout && (
            <div
              className={`flex flex-shrink-0 items-center gap-1 rounded-lg border ${currentTheme.border} ${currentTheme.controlsBg} px-2 py-1 text-xs font-medium ${currentTheme.text}`}
              aria-label='Zoom controls'
            >
              <button
                type='button'
                onClick={() => onZoomChange?.(Math.max(0.5, zoomLevel - 0.1))}
                disabled={!onZoomChange}
                className='flex h-7 w-7 items-center justify-center rounded bg-slate-700/50 text-slate-300 opacity-70'
                title='Zoom out'
                aria-label='Zoom out'
              >
                <ZoomOut size={14} />
              </button>
              <span className='min-w-[48px] text-center'>
                {Math.round((zoomLevel || 1.0) * 100)}%
              </span>
              <button
                type='button'
                onClick={() => onZoomChange?.(Math.min(2.0, zoomLevel + 0.1))}
                disabled={!onZoomChange}
                className='flex h-7 w-7 items-center justify-center rounded bg-slate-700/50 text-slate-300 opacity-70'
                title='Zoom in'
                aria-label='Zoom in'
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
        </div>

        {isHomePracticeMobile && !isHomePracticeLandscape && micStatus !== "idle" && (
          <div
            className={`mx-auto mb-1 flex max-w-[92%] items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
              micStatus === "ready"
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                : micStatus === "checking"
                ? "border-blue-400/50 bg-blue-500/15 text-blue-100"
                : "border-red-400/50 bg-red-500/15 text-red-100"
            }`}
            role="status"
          >
            {micStatusMessage}
          </div>
        )}

        {isHomePracticeMobile && !isHomePracticeLandscape && (
          <div
            className={`mx-auto mb-1 flex h-8 items-center justify-center gap-1.5 rounded-full border ${currentTheme.border} ${currentTheme.controlsBg} px-2 text-xs font-semibold ${currentTheme.text}`}
            aria-label="Timeline zoom controls"
          >
            <button
              type="button"
              onClick={handleHomePracticeZoomOut}
              disabled={!onZoomChange || homePracticeTimelineZoom <= 1.2}
              className="flex h-6 w-8 items-center justify-center rounded-full bg-slate-700/60 text-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              title="Show a longer timeline"
              aria-label="Show a longer timeline"
            >
              <ZoomOut size={13} />
            </button>
            <span className="min-w-[62px] text-center text-[11px]">
              {Math.round(homePracticeTimelineZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleHomePracticeZoomIn}
              disabled={!onZoomChange || homePracticeTimelineZoom >= 4.0}
              className="flex h-6 w-8 items-center justify-center rounded-full bg-slate-700/60 text-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              title="Show a shorter timeline"
              aria-label="Show a shorter timeline"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        )}

        {isHomePracticeLandscape ? (
          <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div
                className="w-full flex flex-1 items-center justify-center"
                style={{
                  minHeight: `${displayGraphHeight}px`,
                  height: `${displayGraphHeight}px`,
                }}
                data-graph-area
              >
                <CombinedWaveformPitch
                  referencePitch={referencePitch}
                  studentPitch={studentPitch}
                  isRecording={isRecording}
                  isPlaying={graphIsPlaying}
                  currentTime={
                    isPlayingPracticeAudio && practiceAudioTime > 0
                      ? practiceAudioTime
                      : currentTime
                  }
                  referenceDuration={referenceDuration}
                  referenceAudioUrl={referenceUrl}
                  studentAudioUrl={practiceAudioUrl}
                  studentAudioBlob={studentBlob}
                  onSeek={(progress) => {
                    if (onSeekToTime && referenceDuration > 0) {
                      onSeekToTime(progress * referenceDuration);
                    }
                  }}
                  height={displayGraphHeight}
                  isFullScreen={true}
                  markers={markers}
                  onMarkerClick={(time) => {
                    if (onSeekToTime) {
                      onSeekToTime(time);
                    }
                  }}
                  zoomLevel={homePracticeTimelineZoom}
                  onZoomChange={onZoomChange}
                />
              </div>

              {ayatTiming && ayatTiming.length > 0 && referenceDuration > 0 && (
                <FullScreenAyahTextDisplay
                  ayatTiming={ayatTiming}
                  currentTime={currentTime}
                  duration={referenceDuration}
                  onSeek={(time) => {
                    if (onSeekToTime) {
                      onSeekToTime(time);
                    }
                  }}
                  theme={currentTheme}
                  compact={true}
                />
              )}
            </div>

            <aside className={`flex w-[132px] flex-shrink-0 flex-col items-stretch justify-center gap-2 rounded-lg border ${currentTheme.border} ${currentTheme.controlsBg} p-2`}>
              <div className={`rounded-lg border ${currentTheme.border} bg-slate-900/50 px-2 py-1.5 text-center`}>
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Live Pitch
                </div>
                <div className="mt-0.5 flex items-baseline justify-center gap-1 text-blue-300">
                  <span className="text-xl font-bold tabular-nums">
                    {latestStudentFrequency !== null
                      ? latestStudentFrequency.toFixed(1)
                      : "---"}
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    Hz
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-center gap-1 text-[9px] text-slate-400">
                  {latestStudentFrequency !== null && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                  <span>
                    {latestStudentFrequency !== null ? "Pitch detected" : "Listening"}
                  </span>
                </div>
              </div>

              <div className={`flex h-8 items-center justify-center gap-1 rounded-full border ${currentTheme.border} bg-slate-900/30 px-1.5 text-[10px] font-semibold ${currentTheme.text}`}>
                <button
                  type="button"
                  onClick={handleHomePracticeZoomOut}
                  disabled={!onZoomChange || homePracticeTimelineZoom <= 1.2}
                  className="flex h-6 w-8 items-center justify-center rounded-full bg-slate-700/70 text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Show a longer timeline"
                  aria-label="Show a longer timeline"
                >
                  <ZoomOut size={12} />
                </button>
                <span className="min-w-[42px] text-center">
                  {Math.round(homePracticeTimelineZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleHomePracticeZoomIn}
                  disabled={!onZoomChange || homePracticeTimelineZoom >= 4.0}
                  className="flex h-6 w-8 items-center justify-center rounded-full bg-slate-700/70 text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Show a shorter timeline"
                  aria-label="Show a shorter timeline"
                >
                  <ZoomIn size={12} />
                </button>
              </div>

              {isHomePracticeMobile && micStatus !== "idle" && (
                <div
                  className={`rounded-full border px-2 py-1 text-center text-[10px] font-semibold ${
                    micStatus === "ready"
                      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                      : micStatus === "checking"
                      ? "border-blue-400/50 bg-blue-500/15 text-blue-100"
                      : "border-red-400/50 bg-red-500/15 text-red-100"
                  }`}
                  role="status"
                >
                  {micStatusMessage}
                </div>
              )}

              {isPracticeContext && onPracticeStart && onPracticeStop && (
                <button
                  onClick={handlePracticeToggle}
                  className={`flex min-h-[38px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-white shadow-md ${
                    isPracticeMode
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                  title={isPracticeMode ? "Stop Practice" : "Start Practice"}
                  aria-label={isPracticeMode ? "Stop practice mode" : "Start practice mode"}
                >
                  {isPracticeMode ? "Stop" : "Start"}
                </button>
              )}

              {isPracticeContext && referencePitch.length > 0 && (
                <button
                  onClick={isPlaying ? onPause : onPlay}
                  className="flex h-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700"
                  title={isPlaying ? "Pause Reference" : "Play Reference"}
                  aria-label={isPlaying ? "Pause reference playback" : "Play reference playback"}
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
                </button>
              )}

              <button
                onClick={handleCloseWithCountdownCancel}
                className="flex h-11 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
                title="Exit full-screen"
                aria-label="Exit full-screen mode"
              >
                <X size={18} />
              </button>
            </aside>
          </div>
        ) : (
          <>
            {/* Graph Container - Full width for exact fit */}
            <div
              className='w-full flex items-center justify-center'
              style={{ minHeight: `${graphHeight}px`, height: `${graphHeight}px` }}
              data-graph-area
            >
              <CombinedWaveformPitch
                referencePitch={referencePitch}
                studentPitch={studentPitch}
                isRecording={isRecording}
                isPlaying={graphIsPlaying}
                currentTime={
                  isPlayingPracticeAudio && practiceAudioTime > 0
                    ? practiceAudioTime
                    : currentTime
                }
                referenceDuration={referenceDuration}
                referenceAudioUrl={referenceUrl}
                studentAudioUrl={practiceAudioUrl}
                studentAudioBlob={studentBlob}
                onSeek={(progress) => {
                  if (onSeekToTime && referenceDuration > 0) {
                    onSeekToTime(progress * referenceDuration);
                  }
                }}
                height={graphHeight}
                isFullScreen={true}
                markers={markers}
                onMarkerClick={(time) => {
                  if (onSeekToTime) {
                    onSeekToTime(time);
                  }
                }}
                zoomLevel={
                  isHomePracticeMobile
                    ? homePracticeTimelineZoom
                    : zoomLevel
                }
                onZoomChange={onZoomChange}
              />
            </div>

            {/* Enhanced Quranic Text Display - Below Graph (Full-Screen Optimized) */}
            {ayatTiming && ayatTiming.length > 0 && referenceDuration > 0 && (
              <>
                <FullScreenAyahTextDisplay
                  ayatTiming={ayatTiming}
                  currentTime={currentTime}
                  duration={referenceDuration}
                  onSeek={(time) => {
                    if (onSeekToTime) {
                      onSeekToTime(time);
                    }
                  }}
                  theme={currentTheme}
                  compact={isClassroomLayout}
                />
                {isClassroomLayout && isPracticeContext && (
                  <div
                    className={`mt-1 flex w-full max-w-6xl flex-shrink-0 items-center justify-center gap-2 self-center rounded-lg border ${currentTheme.border} ${currentTheme.controlsBg} px-3 py-1.5 text-xs ${currentTheme.text}`}
                    aria-label='Ayah selector placeholder'
                  >
                    <span className={`font-semibold ${currentTheme.textMuted}`}>
                      Ayah
                    </span>
                    <div className='flex items-center gap-1'>
                      {Array.from({ length: 8 }).map((_, index) => {
                        const ayah = ayatTiming[index];
                        const isActive = index === activeAyahIndex;
                        return (
                          <button
                            key={index}
                            type='button'
                            disabled={!ayah}
                            onClick={() => {
                              if (ayah && onSeekToTime) {
                                onSeekToTime(ayah.start);
                              }
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold transition-colors ${
                              isActive && ayah
                                ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-100 opacity-100"
                                : ayah
                                ? "border-slate-600/60 bg-slate-700/40 text-slate-200 opacity-90 hover:bg-slate-600/50"
                                : "border-slate-700/40 bg-slate-800/30 text-slate-500 opacity-40"
                            }`}
                            title={
                              ayah
                                ? `Select ayah ${index + 1}`
                                : `Ayah ${index + 1} unavailable`
                            }
                            aria-label={
                              ayah
                                ? `Select ayah ${index + 1}`
                                : `Ayah ${index + 1} unavailable`
                            }
                            aria-pressed={isActive && !!ayah}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {!isHomePracticeLandscape && (
        <div
          className={`w-full ${currentTheme.controlsBg} border-t ${currentTheme.border} px-2 sm:px-4 ${isClassroomLayout ? "py-1" : compactControls ? "py-1.5" : "py-3"} backdrop-blur-sm flex-shrink-0 z-10`}
        >
        <div className={`flex items-center ${isHomePracticeMobile ? "justify-center gap-3 min-h-[54px] flex-nowrap overflow-x-auto pb-0" : `justify-start sm:justify-center ${isClassroomLayout ? "gap-1.5 min-h-[38px]" : "gap-2 sm:gap-3 min-h-[44px]"} flex-wrap overflow-x-visible sm:overflow-visible ${compactControls ? "pb-0" : "pb-1"}`}`}>
          {/* Practice Controls Group */}
          <div className='flex items-center gap-2'>
            {/* Practice Mode Toggle */}
            {isPracticeContext &&
              onPracticeStart &&
              onPracticeStop && (
              <button
                onClick={handlePracticeToggle}
                className={`${isHomePracticeMobile ? "h-11 px-3.5 text-sm" : isClassroomLayout ? "px-2.5 py-1" : "px-3 py-1.5"} rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
                  isPracticeMode
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                } shadow-md hover:shadow-lg`}
                title={
                  isPracticeMode ? "Stop Practice (P)" : "Start Practice (P)"
                }
                aria-label={
                  isPracticeMode ? "Stop practice mode" : "Start practice mode"
                }
              >
                {isPracticeMode ? (
                  <>
                    <MicOff size={14} />
                    Stop Practice
                  </>
                ) : (
                  <>
                    <Mic size={14} />
                    Start Practice
                  </>
                )}
              </button>
            )}

            {isClassroomLayout && micStatus !== "idle" && (
              <div
                className={`flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold ${
                  micStatus === "ready"
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : micStatus === "checking"
                    ? "border-blue-400/50 bg-blue-500/15 text-blue-100"
                    : "border-red-400/50 bg-red-500/15 text-red-100"
                }`}
                role="status"
              >
                {micStatusMessage}
              </div>
            )}

            {/* Practice Mode Indicator */}
            {isPracticeMode && !isHomePracticeMobile && (
              <div className='flex items-center gap-1.5 px-2 py-1 rounded bg-red-600/20 border border-red-500/30'>
                <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                <span className='text-xs text-red-300 font-medium'>
                  Practice Live
                </span>
              </div>
            )}

            {/* Practice Mode Controls */}
            {isPracticeMode && !isClassroomLayout && !isHomePracticeMobile && (
              <>
                {onPracticeStop && (
                  <button
                    onClick={onPracticeStop}
                    className='flex items-center justify-center w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400'
                    title='Stop Practice (S)'
                    aria-label='Stop practice'
                  >
                    <Square size={14} />
                  </button>
                )}
                {onPracticeRestart && (
                  <button
                    onClick={onPracticeRestart}
                    className='flex items-center justify-center w-9 h-9 rounded-full bg-slate-600 hover:bg-slate-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-400'
                    title='Restart Practice (R)'
                    aria-label='Restart practice'
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Recording Controls Group */}
          {isRecordingContext &&
            (onRecordingStart || onRecordingStop) && (
            <div className='flex items-center gap-2'>
              <button
                onClick={() => {
                  if (isRecordingSession) {
                    onRecordingStop?.();
                  } else {
                    onRecordingStart?.();
                  }
                }}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
                  isRecordingSession
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                } shadow-md hover:shadow-lg`}
                title={isRecordingSession ? "Stop Recording" : "Start Recording"}
                aria-label={isRecordingSession ? "Stop recording" : "Start recording"}
              >
                {isRecordingSession ? (
                  <>
                    <Square size={14} />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic size={14} />
                    Start Recording
                  </>
                )}
              </button>
            </div>
          )}

          {/* Divider */}
          {!isHomePracticeMobile && ((isPracticeContext && (isPracticeMode || practiceAudioUrl)) ||
            (isRecordingContext && isRecordingSession)) && (
            <div className='h-8 w-px bg-slate-600/50'></div>
          )}

          {/* Recorded Student Voice Audio Controls */}
          {isPracticeContext && practiceAudioUrl && !isPracticeMode && (
            <div className='flex items-center gap-2'>
              <div className='flex items-center gap-1 px-2 py-1 rounded bg-purple-600/20 border border-purple-500/30'>
                <span className='text-xs text-purple-300 font-medium'>
                  Your Recording
                </span>
              </div>
              {onPlayPracticeAudio && onPausePracticeAudio && (
                <button
                  onClick={
                    isPlayingPracticeAudio
                      ? onPausePracticeAudio
                      : onPlayPracticeAudio
                  }
                  className='flex items-center justify-center w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1'
                  title={
                    isPlayingPracticeAudio
                      ? "Pause Recording"
                      : "Play Recording"
                  }
                  aria-label={
                    isPlayingPracticeAudio
                      ? "Pause recorded audio"
                      : "Play recorded audio"
                  }
                >
                  {isPlayingPracticeAudio ? (
                    <Pause size={18} className='ml-0.5' />
                  ) : (
                    <Play size={18} className='ml-1' />
                  )}
                </button>
              )}
              {onStopPracticeAudio && (
                <button
                  onClick={onStopPracticeAudio}
                  className='flex items-center justify-center w-9 h-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400'
                  title='Stop Recording Playback'
                  aria-label='Stop recorded audio playback'
                >
                  <Square size={14} />
                </button>
              )}
            </div>
          )}

          {/* Divider for Reference Audio */}
          {!isHomePracticeMobile && isPracticeContext && referencePitch.length > 0 && (
            <div className='h-8 w-px bg-slate-600/50'></div>
          )}

          {/* Reference Audio Playback Controls - Always Available */}
          {isPracticeContext && referencePitch.length > 0 && (
            <div className='flex items-center gap-2'>
              <div className={`${isHomePracticeMobile ? "hidden" : "flex"} items-center gap-1 px-2 py-1 rounded bg-blue-600/20 border border-blue-500/30`}>
                <span className='text-xs text-blue-300 font-medium'>
                  Reference
                </span>
              </div>
              {/* Play/Pause Button */}
              <button
                onClick={isPlaying ? onPause : onPlay}
                className={`${isHomePracticeMobile ? "h-12 w-12 min-h-[48px] min-w-[48px]" : isClassroomLayout ? "h-9 w-9" : "w-10 h-10"} flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1`}
                title={
                  isPlaying
                    ? "Pause Reference (Space)"
                    : "Play Reference (Space)"
                }
                aria-label={
                  isPlaying
                    ? "Pause reference playback"
                    : "Play reference playback"
                }
              >
                {isPlaying ? (
                  <Pause size={18} className='ml-0.5' />
                ) : (
                  <Play size={18} className='ml-1' />
                )}
              </button>

              {/* Stop Button */}
              {!isHomePracticeMobile && <button
                onClick={handleStopWithCountdownCancel}
                className={`${isClassroomLayout ? "h-8 w-8" : "w-9 h-9"} flex items-center justify-center rounded-full bg-slate-600 hover:bg-slate-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-400`}
                title='Stop Reference (S)'
                aria-label='Stop reference playback'
              >
                <Square size={14} />
              </button>}

              {/* Restart Button */}
              {!isHomePracticeMobile && <button
                onClick={onRestart}
                className={`${isClassroomLayout ? "h-8 w-8" : "w-9 h-9"} flex items-center justify-center rounded-full bg-slate-600 hover:bg-slate-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-400`}
                title='Restart Reference (R)'
                aria-label='Restart reference from beginning'
              >
                <RefreshCw size={14} />
              </button>}

              {onRepeatAyahToggle && (
                <button
                  type='button'
                  onClick={onRepeatAyahToggle}
                  disabled={!canRepeatAyah}
                  className={`${isHomePracticeMobile ? "h-12 w-12 justify-center rounded-full p-0" : isClassroomLayout ? "h-8 px-2" : "h-9 px-3"} flex items-center gap-1 border text-xs font-semibold transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    isRepeatAyahEnabled && canRepeatAyah
                      ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-100"
                      : canRepeatAyah
                      ? "border-slate-600/60 bg-slate-700/50 text-slate-200 hover:bg-slate-600/60"
                      : "border-slate-700/50 bg-slate-800/40 text-slate-500 opacity-50"
                  }`}
                  title={
                    canRepeatAyah
                      ? isRepeatAyahEnabled
                        ? "Disable repeat current ayah"
                        : "Repeat current ayah"
                      : "Repeat ayah unavailable"
                  }
                  aria-label={
                    canRepeatAyah
                      ? isRepeatAyahEnabled
                        ? "Disable repeat current ayah"
                        : "Repeat current ayah"
                      : "Repeat ayah unavailable"
                  }
                  aria-pressed={isRepeatAyahEnabled && canRepeatAyah}
                >
                  <Repeat2 size={14} />
                  {!isClassroomLayout && !isHomePracticeMobile && <span>Repeat</span>}
                </button>
              )}
            </div>
          )}

          {isClassroomLayout && isPracticeContext && (
            <div className='flex items-center gap-1 rounded-lg border border-slate-600/40 bg-slate-700/30 px-1.5 py-1'>
              {[
                { label: "Slow", value: 0.75 },
                { label: "1.0x", value: 1.0 },
                { label: "Fast", value: 1.25 },
              ].map((speedOption) => {
                const isActiveSpeed =
                  Math.abs(playbackSpeed - speedOption.value) < 0.01;
                return (
                  <button
                    key={speedOption.value}
                    type='button'
                    disabled={!onPlaybackSpeedChange}
                    onClick={() => onPlaybackSpeedChange?.(speedOption.value)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      isActiveSpeed
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/70"
                    } ${!onPlaybackSpeedChange ? "cursor-not-allowed opacity-50" : ""}`}
                    title={`Set reference speed to ${speedOption.value}x`}
                    aria-label={`Set reference speed to ${speedOption.value}x`}
                    aria-pressed={isActiveSpeed}
                  >
                    {speedOption.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Exit / Cancel Button */}
          <div className={isHomePracticeMobile ? "ml-0 pl-0" : `${isClassroomLayout ? "ml-1 pl-2" : "ml-2 sm:ml-4 pl-2 sm:pl-4"} border-l border-slate-600/50`}>
            {isRecordingContext ? (
              <button
                type='button'
                onClick={handleRecordingCancel}
                className={`${isClassroomLayout ? "h-9 px-3" : "h-10 px-4"} flex items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400`}
                title='Cancel recording'
                aria-label='Cancel recording fullscreen'
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleCloseWithCountdownCancel}
                className={`${isHomePracticeMobile ? "h-12 w-12 min-h-[48px] min-w-[48px]" : isClassroomLayout ? "h-10 w-10 min-h-[40px] min-w-[40px]" : "w-11 h-11 min-h-[44px] min-w-[44px]"} flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400`}
                title='Exit Full-Screen (ESC)'
                aria-label='Exit full-screen mode'
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ENHANCEMENT: Enhanced Keyboard Shortcuts Hint - Improved */}
        {!isClassroomLayout && (
        <div
          className={`hidden sm:flex mt-2 pt-2 border-t border-slate-600/30 text-center text-[10px] ${currentTheme.textMuted} items-center justify-center gap-3 flex-wrap`}
        >
          <span className='flex items-center gap-1'>
            <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
              Space
            </kbd>
            <span>Play/Pause</span>
          </span>
          <span className='flex items-center gap-1'>
            <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
              R
            </kbd>
            <span>Restart</span>
          </span>
          <span className='flex items-center gap-1'>
            <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
              S
            </kbd>
            <span>Stop</span>
          </span>
          {fullscreenContext === "practice" && onPracticeStart && (
            <span className='flex items-center gap-1'>
              <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
                P
              </kbd>
              <span>Practice</span>
            </span>
          )}
          {onZoomChange && (
            <span className='flex items-center gap-1'>
              <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
                +/-
              </kbd>
              <span>Zoom</span>
            </span>
          )}
          <span className='flex items-center gap-1'>
            <kbd className='px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px]'>
              ESC
            </kbd>
            <span>Exit</span>
          </span>
        </div>
        )}
        </div>
      )}

      {/* Countdown Overlay - Shows before practice mode starts */}
      <Countdown
        isActive={showCountdown}
        onComplete={handleCountdownComplete}
        onCancel={handleCountdownCancel}
        duration={5}
        showAudioCue={true}
      />
    </div>
  );
};

export default FullScreenTrainingMode;
export type { FullScreenTrainingModeProps };
