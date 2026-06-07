import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import {
  RealTimePitchExtractor,
  PitchPoint,
  LIVE_PITCH_FILTER_OPTIONS,
} from "../services/pitchExtractor";
import { PitchData } from "../types";

interface RecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onPitchUpdate?: (pitch: PitchPoint) => void; // Real-time pitch callback
  onRecordingStart?: () => void; // Countdown trigger callback (doesn't start recording immediately)
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  // Props for pitch graph view
  recordingPitchData?: PitchPoint[]; // Current recording pitch data
  referencePitchData?: PitchData[]; // Reference pitch for comparison
  referenceDuration?: number; // Reference audio duration
  viewMode?: "waveform" | "pitch"; // Display mode
  // New prop to trigger actual recording start (after countdown)
  triggerRecordingStart?: boolean; // When true, starts recording immediately
  triggerRecordingStop?: boolean; // When true, stops recording externally
  onError?: (message: string) => void; // Error callback for displaying alerts
}

const Recorder: React.FC<RecorderProps> = ({
  onRecordingComplete,
  onPitchUpdate,
  onRecordingStart,
  isRecording,
  setIsRecording,
  recordingPitchData = [],
  referencePitchData = [],
  referenceDuration = 0,
  viewMode = "pitch", // Default to pitch view
  triggerRecordingStart = false, // Trigger to start recording after countdown
  triggerRecordingStop = false,
}) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const pitchExtractorRef = useRef<RealTimePitchExtractor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [timer, setTimer] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);
  const hasStartedRef = useRef<boolean>(false); // Track if recording has been started

  const startRecording = async () => {
    try {
      // Get microphone stream for recording with balanced settings
      // Enabled noiseSuppression and autoGainControl for clear, audible recordings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, // Keep for feedback prevention
          noiseSuppression: true, // ENABLED - improves voice clarity
          autoGainControl: true, // ENABLED - boosts quiet audio (not filtering, just volume adjustment)
          sampleRate: 44100, // Keep high quality
          channelCount: 1, // Mono
        },
      });
      streamRef.current = stream;

      // Prefer formats that decode reliably in browser for later WAV conversion.
      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType =
        preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
        "";

      if (!mimeType) {
        throw new Error("No supported browser recording format found.");
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // Higher bitrate for better quality
      });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      // Start real-time pitch extraction for recording
      // This is separate from practice mode - recording has its own pitch extraction
      if (onPitchUpdate) {
        const extractor = new RealTimePitchExtractor();
        pitchExtractorRef.current = extractor;
        // Apply minimal filtering for voice pitch detection (similar to practice mode)
        // This ensures actual Hz values are detected and displayed correctly
        await extractor.startFromStream(
          stream,
          onPitchUpdate,
          LIVE_PITCH_FILTER_OPTIONS
        );
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          console.log("Recording chunk received:", e.data.size, "bytes");
        }
      };

      mediaRecorder.onstop = () => {
        console.log("Recording stopped, chunks:", chunks.length);
        if (chunks.length > 0) {
          const blob = new Blob(chunks, {
            type: mediaRecorder.mimeType || "audio/webm",
          });
          console.log(
            "Recording blob created:",
            blob.size,
            "bytes",
            "Type:",
            blob.type
          );
          onRecordingComplete(blob);
        } else {
          console.warn("No audio chunks collected during recording");
          if (onError) {
            onError("No audio was recorded. Please try again.");
          } else {
            alert("No audio was recorded. Please try again.");
          }
        }

        // Stop pitch extraction
        if (pitchExtractorRef.current) {
          pitchExtractorRef.current.stop();
          pitchExtractorRef.current = null;
        }

        stream.getTracks().forEach((track) => track.stop()); // Stop mic
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        if (onError) {
          onError("Audio recording error occurred. Please try again.");
        } else {
          alert("Audio recording error occurred. Please try again.");
        }
      };

      // Start with timeslice to ensure regular data collection
      mediaRecorder.start(100); // 100ms timeslice
      console.log("Recording started, state:", mediaRecorder.state);
      setIsRecording(true);
      setTimer(0);

      timerIntervalRef.current = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      if (onError) {
        onError("Microphone access denied or not available.");
      } else {
        alert("Microphone access denied or not available.");
      }
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Stop pitch extraction
      if (pitchExtractorRef.current) {
        pitchExtractorRef.current.stop();
        pitchExtractorRef.current = null;
      }

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Start recording when triggerRecordingStart becomes true (after countdown)
  useEffect(() => {
    if (triggerRecordingStart && !isRecording && !hasStartedRef.current) {
      // Start recording after countdown completes
      hasStartedRef.current = true;
      startRecording();
    }
  }, [triggerRecordingStart, isRecording]);

  useEffect(() => {
    if (triggerRecordingStop) {
      // Stop whenever trigger is raised and recorder is active,
      // regardless of parent isRecording timing updates.
      stopRecording();
    }
  }, [triggerRecordingStop]);
  
  // Reset hasStartedRef when recording stops
  useEffect(() => {
    if (!isRecording) {
      hasStartedRef.current = false;
    }
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pitchExtractorRef.current) {
        pitchExtractorRef.current.stop();
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  return (
    <div className='flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl transition-all'>
      <div className='text-2xl sm:text-3xl font-mono text-slate-700 mb-4 font-bold'>
        {formatTime(timer)}
      </div>

      {!isRecording ? (
        <button
          onClick={() => {
            // Call onRecordingStart which will trigger countdown
            if (onRecordingStart) {
              onRecordingStart();
            }
          }}
          className='flex items-center justify-center gap-2 min-h-[48px] min-w-[160px] px-6 sm:px-8 py-3 sm:py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full text-base sm:text-lg font-semibold shadow-lg transition-transform hover:scale-105 touch-manipulation'
        >
          <Mic className='w-5 h-5 sm:w-6 sm:h-6' />
          Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className='flex items-center justify-center gap-2 min-h-[48px] min-w-[140px] px-6 sm:px-8 py-3 sm:py-4 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-full text-base sm:text-lg font-semibold shadow-lg animate-pulse touch-manipulation'
        >
          <Square className='w-5 h-5 sm:w-6 sm:h-6 fill-current' />
          Stop Recording
        </button>
      )}

      <p className='mt-4 text-xs sm:text-sm text-slate-500 text-center px-2'>
        {isRecording
          ? "Recording in progress..."
          : "Click start to mimic the reference recitation"}
      </p>

      {/* REMOVED: Duplicate graph - using main Pitch Comparison Graph in TrainingStudio instead */}
    </div>
  );
};

export default Recorder;
