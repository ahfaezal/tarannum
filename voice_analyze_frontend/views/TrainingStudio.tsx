import React, { useState, useRef, useEffect, useMemo } from "react";
import Waveform from "../components/Waveform";
import Recorder from "../components/Recorder";
import SegmentPractice from "../components/SegmentPractice";
import LivePitchGraph from "../components/LivePitchGraph";
import CombinedWaveformPitch from "../components/CombinedWaveformPitch";
import LiveHzDisplay from "../components/LiveHzDisplay";
import ScoreExplanation from "../components/ScoreExplanation";
import Countdown from "../components/Countdown";
import PracticeFullScreenMode from "../components/PracticeFullScreenMode";
import RecordingFullScreenMode from "../components/RecordingFullScreenMode";
import AyahTextDisplay from "../components/AyahTextDisplay";
import PronunciationAlerts from "../components/PronunciationAlerts";
import ReferenceLibrary from "../components/ReferenceLibrary";
import QariSelector from "../components/QariSelector";
import AlertModal from "../components/AlertModal";
import {
  analyzeRecitation,
  extractReferencePitch,
} from "../services/apiService";
import { progressService, ProgressData } from "../services/progressService";
import { useSelector } from "react-redux";
import { RootState } from "../store";

import { APP_COLORS } from "../constants";
import { formatSegmentScore, formatSegmentRange, formatScoreWithPercent } from "../utils/scoreFormat";
import { AnalysisResult, PitchData, PitchDataResponse } from "../types";
import {
  PitchPoint,
  RealTimePitchExtractor,
  LIVE_PITCH_FILTER_OPTIONS,
} from "../services/pitchExtractor";
import {
  Play,
  Pause,
  RefreshCw,
  BarChart2,
  CheckCircle,
  Upload,
  Music,
  TrendingUp,
  Target,
  Square,
  X,
  Maximize2,
  Info,
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import {
  referenceLibraryService,
  ReferenceAudio,
} from "../services/referenceLibraryService";

// Helper function to convert AudioBuffer to WAV Blob (lossless, same as voice recorder)
const audioBufferToWav = (audioBuffer: AudioBuffer): Blob => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string): void => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };



  // WAV header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, length, true);

  // Write audio data (16-bit PCM)
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
};

// Convert recorded blob to WAV (lossless, same as voice recorder)
const convertRecordedAudioToWav = async (blob: Blob): Promise<Blob> => {
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to WAV (lossless PCM, same format as voice recorder)
    const wavBlob = audioBufferToWav(audioBuffer);
    return wavBlob;
  } finally {
    await audioContext.close();
  }
};

type PracticePcmRecorder = {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  sampleRate: number;
};

const float32ToWavBlob = (
  samples: Float32Array,
  sampleRate: number
): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

const TrainingStudio: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const userRole = user?.role || 'public';
  const [selectedRef, setSelectedRef] = useState<any>(null);
  const [studentBlob, setStudentBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [uploadedRefUrl, setUploadedRefUrl] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [isSyncingRef, setIsSyncingRef] = useState(false);
  const [isSyncingStudent, setIsSyncingStudent] = useState(false);

  // Real-time pitch data
  const [referencePitchData, setReferencePitchData] = useState<PitchData[]>([]);
  const [referenceAyahTiming, setReferenceAyahTiming] = useState<any[]>([]);
  const [studentPitchData, setStudentPitchData] = useState<PitchPoint[]>([]);
  const [recordingPitchData, setRecordingPitchData] = useState<PitchPoint[]>(
    []
  );
  const [followModePitchData, setFollowModePitchData] = useState<PitchPoint[]>(
    []
  ); // Pitch data when following reference audio
  const [isFollowingReference, setIsFollowingReference] = useState(false); // Track if we're in follow mode
  const [isExtractingRefPitch, setIsExtractingRefPitch] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingPracticeAudio, setIsPlayingPracticeAudio] = useState(false);

  // Full-screen training mode state
  const [isPracticeFullScreenOpen, setIsPracticeFullScreenOpen] =
    useState(false);
  const [isRecordingFullScreenOpen, setIsRecordingFullScreenOpen] =
    useState(false);
  const [fullScreenZoomLevel, setFullScreenZoomLevel] = useState(1.0); // Start at 100% to avoid oversized mobile/fullscreen graph

  // Practice mode state
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceStartTime, setPracticeStartTime] = useState<number | null>(
    null
  );
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [practiceTime, setPracticeTime] = useState(0);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [showRecordingCountdown, setShowRecordingCountdown] = useState(false);
  const [triggerRecordingStart, setTriggerRecordingStart] = useState(false);
  const [triggerRecordingStop, setTriggerRecordingStop] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const isCustomUploadRefId = (id?: string | null): boolean =>
    !!id && (id === "custom" || id.startsWith("custom_"));
  const [studentPlaybackSpeed, setStudentPlaybackSpeed] = useState(() => {
    // Load from localStorage if available, otherwise default to 1.0
    const saved = localStorage.getItem("studentPlaybackSpeed");
    return saved ? parseFloat(saved) : 1.0;
  });

  // Practice audio recording state
  const [practiceAudioBlob, setPracticeAudioBlob] = useState<Blob | null>(null);
  const [practiceAudioUrl, setPracticeAudioUrl] = useState<string | null>(null);
  const practiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const practiceAudioChunksRef = useRef<BlobPart[]>([]);

  // Reference library state (Step 6)
  const [referenceLibrary, setReferenceLibrary] = useState<ReferenceAudio[]>(
    []
  );
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [referenceLibraryError, setReferenceLibraryError] = useState<
    string | null
  >(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'warning' | 'info' }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
  });

  // Responsive pitch graph height (mobile/tablet/desktop)
  const [pitchGraphHeight, setPitchGraphHeight] = useState(400);
  useEffect(() => {
    const update = () =>
      setPitchGraphHeight(
        typeof window !== "undefined"
          ? window.innerWidth < 640
            ? 260
            : window.innerWidth < 1024
            ? 320
            : 400
          : 400
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isPracticeModeRef.current = isPracticeMode;
  }, [isPracticeMode]);
  const practiceRawStreamRef = useRef<MediaStream | null>(null); // Stream 1: Raw audio for recording/playback
  const practiceStreamRef = useRef<MediaStream | null>(null); // Stream 2: Filtered audio for pitch analysis
  const practicePitchExtractorRef = useRef<RealTimePitchExtractor | null>(null);
  const handlePitchUpdateRef = useRef<((pitch: PitchPoint) => void) | null>(
    null
  );
  const practiceStartTimeRef = useRef<number | null>(null); // Use ref for callback access
  const referenceDurationRef = useRef<number>(0); // Use ref for callback access
  const isPracticeModeRef = useRef<boolean>(false); // Use ref for callback access
  const recordingStartTimeRef = useRef<number | null>(null); // Timestamp when recording started (for time mapping like practice)
  const isRecordingRef = useRef<boolean>(false); // Use ref for callback access
  const followModeStartTimeRef = useRef<number | null>(null); // Track follow mode start time
  const followModePitchExtractorRef = useRef<RealTimePitchExtractor | null>(
    null
  ); // Pitch extractor for follow mode
  const followModeStreamRef = useRef<MediaStream | null>(null); // Microphone stream for follow mode
  const previousRefIdRef = useRef<string | undefined>(undefined); // Track previous reference ID to detect changes
  const pitchDataRefIdRef = useRef<string | undefined>(undefined); // Track which reference ID the current pitch data belongs to
  const presetTextSegmentsRef = useRef<any[] | null>(null); // Track preset text segments to preserve them

  // WaveSurfer references for synchronized playback
  const refWaveSurfer = useRef<WaveSurfer | null>(null);
  const studentWaveSurfer = useRef<WaveSurfer | null>(null);
  // Waveform removed - only pitch graph is displayed

  // Practice audio element ref for volume control
  const practiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const practicePcmRecorderRef = useRef<PracticePcmRecorder | null>(null);

  const clearPracticeGraph = () => {
    setStudentPitchData([]);
    setPracticeTime(0);
  };

  const clearRecordingGraph = () => {
    setRecordingPitchData([]);
    setFollowModePitchData([]);
    setRecordingTime(0);
  };

  const flushPracticePcmRecorder = (): Blob | null => {
    const recorder = practicePcmRecorderRef.current;
    if (!recorder) return null;

    practicePcmRecorderRef.current = null;

    try {
      recorder.processor.disconnect();
      recorder.source.disconnect();
      void recorder.audioContext.close();
    } catch (error) {
      console.warn("Error closing PCM recorder:", error);
    }

    if (recorder.chunks.length === 0) {
      return null;
    }

    const totalLength = recorder.chunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0
    );
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recorder.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return float32ToWavBlob(merged, recorder.sampleRate);
  };

  // Load progress on mount and when reference changes
  useEffect(() => {
    if (selectedRef && selectedRef.id) {
      const progress = progressService.getProgress(selectedRef.id);
      setProgressData(progress);
    } else {
      setProgressData(null);
    }
  }, [selectedRef?.id, analysisResult]);

  // Update student audio playback speed when it changes
  useEffect(() => {
    if (studentWaveSurfer.current && !studentWaveSurfer.current.isDestroyed) {
      studentWaveSurfer.current.setPlaybackRate(studentPlaybackSpeed);
    }
    // Also update practice audio playback speed
    if (practiceAudioRef.current) {
      practiceAudioRef.current.playbackRate = studentPlaybackSpeed;
    }
  }, [studentPlaybackSpeed]);

  // Set practice audio volume and playback speed when URL changes
  useEffect(() => {
    if (!practiceAudioUrl) return;

    const audioElement = practiceAudioRef.current;
    if (!audioElement) return;

    // Set volume and playback speed once when URL changes
    const setAudioSettings = () => {
      if (audioElement) {
        audioElement.volume = 1.0;
        audioElement.playbackRate = studentPlaybackSpeed;
      }
    };

    // Set audio settings immediately if element is ready
    if (audioElement.readyState >= 2) {
      setAudioSettings();
    } else {
      // Wait for element to load
      audioElement.addEventListener("loadedmetadata", setAudioSettings, {
        once: true,
      });
      audioElement.addEventListener("canplay", setAudioSettings, {
        once: true,
      });

      return () => {
        audioElement.removeEventListener("loadedmetadata", setAudioSettings);
        audioElement.removeEventListener("canplay", setAudioSettings);
      };
    }
  }, [practiceAudioUrl, studentPlaybackSpeed]);

  // Load reference library on mount (role-based access)
  useEffect(() => {
    const loadReferences = async () => {
      try {
        setIsLoadingReferences(true);
        setReferenceLibraryError(null);

        // Load references based on user role
        let refs: any[] = [];
        
        if (userRole === 'public' || !user) {
          // Public users: get demo/public content only (use regular references endpoint)
          // This ensures they see admin-uploaded public references
          try {
            refs = await referenceLibraryService.getReferences();
            // Filter to only public references (backend should already filter, but double-check)
            if (refs.length === 0) {
              // Try platform endpoint as fallback
              const { getAvailableContent } = await import("../services/platformService");
              const contentData = await getAvailableContent();
              if (contentData.content && contentData.content.length > 0) {
                refs = contentData.content.map((item: any) => ({
                  id: item.id || item.reference_id,
                  title: item.title || `Demo Content`,
                  maqam: item.maqam,
                  filename: item.filename || item.title || "",
                  file_path: item.file_path || "",
                  duration: item.duration || 0,
                  upload_date: item.upload_date || "",
                  file_size: item.file_size || 0,
                  is_preset: item.is_preset || false,
                  text_segments: item.text_segments || [],
                }));
              }
            }
          } catch (err) {
            console.warn("Failed to load public content:", err);
            refs = [];
          }
        } else if (userRole === 'student') {
          // Students: get their Qari's content
          try {
            const { getAvailableContent } = await import("../services/platformService");
            const contentData = await getAvailableContent();
            if (contentData.content && contentData.content.length > 0) {
              console.log("[Student Load] Raw content data:", contentData.content);
              
              // Map content to references
              const mappedRefs = contentData.content.map((item: any) => ({
                id: item.reference_id || item.id,
                title: item.title || item.reference_title || `Surah ${item.surah_number || 'N/A'}`,
                maqam: item.maqam,
                filename: item.filename || item.title || item.reference_title || "",
                file_path: item.file_path || "",
                duration: item.duration || item.reference_duration || 0,
                upload_date: item.upload_date || null, // Preserve null, don't convert to empty string
                file_size: item.file_size || 0,
                is_preset: item.is_preset || false,
                text_segments: item.text_segments || [],
                created_at: item.created_at || item.upload_date || null, // Preserve null for sorting
              }));
              
              console.log("[Student Load] Mapped references:", mappedRefs.map((r: any) => ({ 
                id: r.id, 
                filename: r.filename, 
                upload_date: r.upload_date,
                created_at: r.created_at 
              })));
              
              // Backend already sorts by upload_date (latest first), but we'll re-sort here to ensure correctness
              // Sort by upload_date FIRST (actual file upload date), then created_at as fallback
              // This ensures the latest uploaded file appears first, not when it was added to Qari's library
              refs = mappedRefs.sort((a: any, b: any) => {
                // Helper function to safely get timestamp
                const getTimestamp = (item: any): number => {
                  // Try upload_date first
                  if (item.upload_date && item.upload_date !== "" && item.upload_date !== null) {
                    const date = new Date(item.upload_date);
                    if (!isNaN(date.getTime())) {
                      return date.getTime();
                    }
                  }
                  // Fallback to created_at
                  if (item.created_at && item.created_at !== "" && item.created_at !== null) {
                    const date = new Date(item.created_at);
                    if (!isNaN(date.getTime())) {
                      return date.getTime();
                    }
                  }
                  // Return 0 for invalid dates (will sort to end)
                  return 0;
                };
                
                const dateA = getTimestamp(a);
                const dateB = getTimestamp(b);
                
                // Debug: Log comparison for first few items
                if (mappedRefs.indexOf(a) < 3 && mappedRefs.indexOf(b) < 3) {
                  console.log(`[Student Load] Sorting comparison:`, {
                    a: { id: a.id, filename: a.filename, upload_date: a.upload_date, dateA },
                    b: { id: b.id, filename: b.filename, upload_date: b.upload_date, dateB },
                    result: dateB - dateA
                  });
                }
                
                return dateB - dateA; // Descending order (newest first)
              });
              
              console.log("[Student Load] Sorted references (latest first):", refs.map((r: any) => ({ 
                id: r.id, 
                filename: r.filename, 
                upload_date: r.upload_date,
                created_at: r.created_at,
                upload_date_ms: r.upload_date ? new Date(r.upload_date).getTime() : 0
              })));
            } else if (contentData.message && contentData.message.includes("No Qari assigned")) {
              // Only show error if message explicitly says "No Qari assigned"
              setReferenceLibraryError(contentData.message);
            } else {
              // Clear error if we have a Qari assigned (even if no content yet)
              setReferenceLibraryError(null);
            }
          } catch (err: any) {
            // Only set error if it's explicitly about missing Qari
            if (err.message?.includes("No Qari assigned") || err.message?.includes("select a Qari")) {
              setReferenceLibraryError(err.message);
            } else {
              // For other errors, don't show the "select Qari" message
              setReferenceLibraryError(null);
            }
          }
        } else {
          // Qari and Admin: use regular library service
          // Clear cache to ensure we get fresh data (latest uploads)
          referenceLibraryService.clearCache();
          refs = await referenceLibraryService.getReferences();
          // Sort by upload_date (latest first) to ensure newest files appear first
          refs.sort((a: any, b: any) => {
            const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
            const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
            return dateB - dateA; // Descending order (newest first)
          });
          referenceLibraryService.cacheReferences(refs);
        }
        
        setReferenceLibrary(refs);

        // For Admin, Qari, and Students: Always select the latest uploaded file on load/refresh
        // This ensures latest content is shown after refresh or Qari change
        const shouldAutoSelect = (userRole === 'admin' || userRole === 'qari' || userRole === 'student') 
          ? refs.length > 0  // Always select latest for Admin/Qari/Student
          : ((!selectedRef || !selectedRef.id || Array.isArray(selectedRef)) && refs.length > 0);  // Only if not selected for public users
        
        if (shouldAutoSelect && refs.length > 0) {
          const first = refs[0]; // This is the latest uploaded file (sorted by upload_date)
          console.log(`[${userRole} Load] Auto-selecting latest file:`, first.id, first.filename || first.title, "upload_date:", first.upload_date);
          
          // For students, ALWAYS update to latest file (even if same ID, to ensure fresh data)
          // This ensures that on refresh or Qari change, the latest file is always selected
          const isSelectedRefEmpty = !selectedRef || Array.isArray(selectedRef) || !selectedRef.id;
          const shouldUpdate = (userRole === 'student') 
            ? true  // Always update for students to ensure latest file is loaded
            : (isSelectedRefEmpty || (selectedRef?.id && selectedRef.id !== first.id));
          
          if (shouldUpdate) {
            console.log(
              `[${userRole} Load] Updating selected reference to latest (current: ${
                selectedRef?.id || "none"
              }, new: ${first.id})`
            );

            // Public/demo users: use direct audio URL without authentication
            if (userRole === "public" || !user) {
              const url = referenceLibraryService.getReferenceAudioUrl(first.id);

              setSelectedRef({
                id: first.id,
                title: first.title,
                filename: first.filename,
                url,
                duration: first.duration || 0,
                maqam: first.maqam || "Library",
                is_preset: first.is_preset || false,
                text_segments: first.text_segments || [],
                upload_date: first.upload_date,
                ...first,
              });
            } else {
              // Authenticated users (Admin/Qari/Student): use authenticated blob URL
              try {
                const url =
                  await referenceLibraryService.getReferenceAudioBlobUrl(
                    first.id
                  );
                console.log(
                  `[${userRole} Load] Got blob URL for reference:`,
                  first.id
                );

                // Set selectedRef with all properties including filename and upload_date
                setSelectedRef({
                  id: first.id,
                  title: first.title,
                  filename: first.filename,
                  url,
                  duration: first.duration || 0,
                  maqam: first.maqam || "Library",
                  is_preset: first.is_preset || false,
                  text_segments: first.text_segments || [],
                  upload_date: first.upload_date,
                  ...first, // Include all other properties
                });

                console.log(
                  `[${userRole} Load] Selected reference updated to latest file`
                );
              } catch (error) {
                console.error("Failed to load reference audio:", error);
                // Set selectedRef without URL - will retry
                setSelectedRef({
                  id: first.id,
                  title: first.title,
                  filename: first.filename,
                  url: "", // Empty URL - will need to retry
                  duration: first.duration || 0,
                  maqam: first.maqam || "Library",
                  is_preset: first.is_preset || false,
                  text_segments: first.text_segments || [],
                  upload_date: first.upload_date,
                  ...first,
                });
                // Retry getting blob URL after a short delay
                setTimeout(async () => {
                  try {
                    const retryUrl =
                      await referenceLibraryService.getReferenceAudioBlobUrl(
                        first.id
                      );
                    setSelectedRef((prev: any) =>
                      prev ? { ...prev, url: retryUrl } : prev
                    );
                  } catch (retryError) {
                    console.error("Retry failed:", retryError);
                    setReferenceLibraryError(
                      "Failed to load reference audio. Please try again."
                    );
                  }
                }, 1000);
              }
            }

            // Check if this is a preset with text_segments and load them
            if (first.is_preset && first.text_segments && first.text_segments.length > 0) {
              console.log(`[InitialLoad] Loading preset text_segments for: ${first.title}`, first.text_segments);

              // Convert text_segments to ayatTiming format
              const presetTextSegments = first.text_segments.map((seg: any) => {
                const textValue = seg.text || seg.text_content || '';
                return {
                  text: textValue,
                  start: seg.start || 0,
                  end: seg.end || 0,
                };
              });

              // Store in ref for useEffect to check
              presetTextSegmentsRef.current = presetTextSegments;

              // Count segments with actual text
              const segmentsWithText = presetTextSegments.filter((seg: any) => seg.text && seg.text.trim() !== '').length;
              console.log(`✅ [InitialLoad] Set preset text segments: ${presetTextSegments.length} total, ${segmentsWithText} with text`, presetTextSegments);

              // Set timing - use setTimeout to ensure it runs after any clearing effects
              setTimeout(() => {
                setReferenceAyahTiming(presetTextSegments);
                console.log(`✅ [InitialLoad] referenceAyahTiming set with ${presetTextSegments.length} segments`);
              }, 100);
            } else {
              // Not a preset or no text segments - clear text
              presetTextSegmentsRef.current = null;
              setReferenceAyahTiming([]);
              console.log(`[InitialLoad] Reference "${first.title}" is not a preset or has no text segments`);
            }
          }
        } else if (refs.length === 0 && userRole === 'student') {
          // Clear selection if no references available
          setSelectedRef(null);
        }
      } catch (error: any) {
        console.error("Failed to load reference library", error);
        setReferenceLibraryError(
          error?.message || "Failed to load reference library"
        );
      } finally {
        setIsLoadingReferences(false);
      }
    };

    loadReferences();
    // Re-run when user changes (login/logout) OR when component mounts (for refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userRole]); // Added userRole to dependencies to ensure it runs on role changes

  // Calculate reference duration from pitch data AND audio duration
  useEffect(() => {
    // First, try to get duration from WaveSurfer (actual audio duration)
    if (refWaveSurfer.current && !refWaveSurfer.current.isDestroyed) {
      const audioDuration = refWaveSurfer.current.getDuration();
      if (audioDuration && audioDuration > 0) {
        setReferenceDuration(audioDuration);
        referenceDurationRef.current = audioDuration;
        console.log(
          `Reference duration from audio: ${audioDuration.toFixed(2)}s`
        );
        return;
      }
    }

    // Fallback: use max time from pitch data
    if (referencePitchData.length > 0) {
      const maxTime = Math.max(...referencePitchData.map((p) => p.time));
      setReferenceDuration(maxTime);
      referenceDurationRef.current = maxTime; // Update ref for callback
      console.log(`Reference duration from pitch data: ${maxTime.toFixed(2)}s`);
    } else {
      setReferenceDuration(0);
      referenceDurationRef.current = 0;
    }
  }, [referencePitchData, refWaveSurfer.current]);

  // Stop practice mode if reference data is cleared
  useEffect(() => {
    if (referencePitchData.length === 0 && isPracticeMode) {
      console.log("Reference data cleared, stopping practice mode");
      handlePracticeStop();
    }
  }, [referencePitchData.length]);

  // Cleanup practice audio URL on unmount
  useEffect(() => {
    return () => {
      if (practiceAudioUrl) {
        URL.revokeObjectURL(practiceAudioUrl);
      }
    };
  }, [practiceAudioUrl]);

  // Debug: Log text timing state
  useEffect(() => {
    if (isPracticeMode) {
      console.log("🔍 Practice Mode Text Check:", {
        isPracticeMode,
        hasTiming: !!referenceAyahTiming,
        timingLength: referenceAyahTiming?.length || 0,
        practiceTime,
        referenceDuration,
        firstSegment: referenceAyahTiming?.[0],
      });
    }
  }, [isPracticeMode, referenceAyahTiming, practiceTime, referenceDuration]);

  // Generate fallback text segments if missing during practice mode
  useEffect(() => {
    if (
      isPracticeMode &&
      referenceAyahTiming.length === 0 &&
      referenceDuration > 0
    ) {
      // Generate fallback segments based on reference duration
      const numSegments = Math.max(
        5,
        Math.min(20, Math.ceil(referenceDuration / 2))
      );
      const segmentDuration = referenceDuration / numSegments;
      const fallbackSegments = [];

      for (let i = 0; i < numSegments; i++) {
        fallbackSegments.push({
          start: i * segmentDuration,
          end:
            i < numSegments - 1 ? (i + 1) * segmentDuration : referenceDuration,
          text: "", // Empty text - will show time range
        });
      }

      setReferenceAyahTiming(fallbackSegments);
      console.log(
        `📋 Generated ${fallbackSegments.length} fallback segments for practice mode`
      );
    }
  }, [isPracticeMode, referenceAyahTiming.length, referenceDuration]);

  // Extract reference pitch when reference loads
  useEffect(() => {
    const extractRefPitch = async () => {
      // CRITICAL: Clear old data and set extraction state FIRST, before any checks
      // This ensures "extracting..." shows immediately when reference changes
      console.log("🔄 Starting pitch extraction - setting isExtractingRefPitch to true");
      setReferencePitchData([]);
      pitchDataRefIdRef.current = undefined; // Clear ref ID so old graph is immediately hidden
      setIsExtractingRefPitch(true);

      if ((!selectedRef || !selectedRef.url) && !uploadedRefUrl) {
        console.log("⚠️ No URL available - stopping extraction");
        setIsExtractingRefPitch(false);
        return;
      }

      console.log("✅ Extraction state set to true, proceeding with extraction...");

      // Stop practice mode if active (reference is changing)
      // Use refs directly to avoid dependency issues
      if (practicePitchExtractorRef.current) {
        practicePitchExtractorRef.current.stop();
        practicePitchExtractorRef.current = null;
      }
      // Stop Stream 1 (raw recording stream)
      if (practiceRawStreamRef.current) {
        practiceRawStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        practiceRawStreamRef.current = null;
      }
      flushPracticePcmRecorder();
      // Stop Stream 2 (filtered pitch stream)
      if (practiceStreamRef.current) {
        practiceStreamRef.current.getTracks().forEach((track) => track.stop());
        practiceStreamRef.current = null;
      }
      setIsPracticeMode(false);
      setPracticeStartTime(null);
      setPracticeTime(0);

      // Clear reference text timing ONLY when reference actually changes
      // BUT: Don't clear if the new reference is a preset with text_segments
      const currentRefId = selectedRef?.id;
      const isPresetWithText = (selectedRef?.is_preset &&
        selectedRef?.text_segments &&
        Array.isArray(selectedRef.text_segments) &&
        selectedRef.text_segments.length > 0) ||
        (presetTextSegmentsRef.current && presetTextSegmentsRef.current.length > 0);

      if (
        previousRefIdRef.current !== undefined &&
        previousRefIdRef.current !== currentRefId
      ) {
        if (!isPresetWithText) {
          // Reference changed and it's NOT a preset with text - clear old text timing
          setReferenceAyahTiming([]);
          presetTextSegmentsRef.current = null;
          console.log(
            `🔄 Reference changed from ${previousRefIdRef.current} to ${currentRefId} - cleared text timing (not a preset)`
          );
        } else {
          // Reference changed to a preset with text - restore from ref if needed
          const segmentsToRestore = presetTextSegmentsRef.current ||
            (selectedRef?.text_segments?.map((seg: any) => ({
              text: seg.text || '',
              start: seg.start || 0,
              end: seg.end || 0,
            })) || []);
          
          // Sort by 'start' field to ensure proper chronological order
          if (segmentsToRestore.length > 0) {
            segmentsToRestore.sort((a, b) => (a.start || 0) - (b.start || 0));
            setReferenceAyahTiming(segmentsToRestore);
            console.log(
              `✅ Reference changed to preset with text (${segmentsToRestore.length} segments, sorted by start) - restored text timing`
            );
          }
        }
      }
      previousRefIdRef.current = currentRefId;

      // Extraction state already set at the beginning of useEffect
      // Now proceed with extraction
      try {
        // CRITICAL: Use reference_id if available (uses backend-stored file)
        // This ensures practice and test modes use the same canonical reference audio
        const isLibraryReference =
          selectedRef &&
          selectedRef.id &&
          selectedRef.id !== "custom" &&
          !uploadedRefUrl &&
          referenceLibrary.some((r) => r.id === selectedRef.id);

        let pitchData: PitchDataResponse;

        if (isLibraryReference && selectedRef?.id) {
          // Use reference_id - extracts pitch from backend-stored file
          console.log(
            `Using reference_id for pitch extraction: ${selectedRef.id}`
          );
          // Ensure extraction state is true before starting async extraction
          // This is important when backend has no cached data and needs to extract
          // State is already set to true at the beginning of useEffect, but we ensure it here too
          setIsExtractingRefPitch(true);
          console.log("⏳ Calling extractReferencePitch - backend will start extraction, isExtractingRefPitch is true");

          pitchData = await extractReferencePitch(
            undefined, // No blob needed
            undefined, // No filename needed
            selectedRef.id // Use reference_id
          );

          console.log("✅ extractReferencePitch completed - received", pitchData.reference?.length || 0, "pitch points");
        } else if (selectedRef) {
          // Fallback: fetch blob and extract (for custom uploads)
          const url =
            isCustomUploadRefId(selectedRef.id) && uploadedRefUrl
              ? uploadedRefUrl
              : selectedRef.url;
          if (!url) {
            setIsExtractingRefPitch(false);
            return;
          }

          // Fetch with authentication if it's a library reference (not a blob URL)
          const isBlobUrl = url.startsWith('blob:');
          const response = await fetch(url, {
            headers: isBlobUrl ? {} : (await import("../services/authService")).getAuthHeader(),
          });
          const refBlob = await response.blob();

          // Ensure extraction state is true before starting async extraction
          setIsExtractingRefPitch(true);

          // Extract pitch using backend (accurate)
          pitchData = await extractReferencePitch(
            refBlob,
            `reference_${selectedRef.id || 'custom'}.mp3`
          );
        } else {
          // No selectedRef - cannot extract
          setIsExtractingRefPitch(false);
          return;
        }

        const extractedReferencePitch = pitchData.reference || [];
        setReferencePitchData(extractedReferencePitch);
        // Mark this pitch data as belonging to the current reference
        pitchDataRefIdRef.current = selectedRef?.id;

        // Debug: Log reference pitch extraction
        console.log("📊 Reference pitch extracted:", {
          points: extractedReferencePitch.length,
          hasData: extractedReferencePitch.length > 0,
          firstPoint: extractedReferencePitch[0],
          lastPoint:
            extractedReferencePitch[extractedReferencePitch.length - 1],
        });

        // Extract text timing if available
        // BUT: Don't overwrite preset text_segments if they already exist
        const isPresetWithText = (selectedRef?.is_preset &&
          selectedRef?.text_segments &&
          Array.isArray(selectedRef.text_segments) &&
          selectedRef.text_segments.length > 0) ||
          (presetTextSegmentsRef.current && presetTextSegmentsRef.current.length > 0);

        console.log("📝 Checking for text timing:", {
          hasAyahTiming: !!pitchData.ayah_timing,
          ayahTimingLength: pitchData.ayah_timing?.length || 0,
          referenceLength: extractedReferencePitch.length,
          isPresetWithText,
          presetTextSegments: selectedRef.text_segments?.length || 0,
          presetTextSegmentsRef: presetTextSegmentsRef.current?.length || 0,
          currentAyahTiming: referenceAyahTiming.length,
        });

        // If this is a preset with text_segments, keep them (already set in onSelect handler)
        // Only use backend-extracted timing if NOT a preset or if preset has no text_segments
        if (isPresetWithText) {
          // Restore preset text from ref if needed
          const segmentsToUse = presetTextSegmentsRef.current ||
            (selectedRef.text_segments?.map((seg: any) => ({
              text: seg.text || '',
              start: seg.start || 0,
              end: seg.end || 0,
            })) || []);
          
          // Sort by 'start' field to ensure proper chronological order
          if (segmentsToUse.length > 0) {
            segmentsToUse.sort((a, b) => (a.start || 0) - (b.start || 0));
            // Always set if segments are available (even if referenceAyahTiming already has data)
            // This ensures preset text is always loaded when preset is selected
            setReferenceAyahTiming(segmentsToUse);
            console.log(
              `✅ Set preset text_segments (${segmentsToUse.length} segments, sorted by start) - overwriting any existing timing`
            );
          } else {
            console.log(
              `⚠️ Preset marked with text but no segments found`
            );
          }
          // Don't overwrite with backend timing
        } else if (pitchData.ayah_timing && pitchData.ayah_timing.length > 0) {
          setReferenceAyahTiming(pitchData.ayah_timing);
          console.log(
            `✅ Extracted ${pitchData.ayah_timing.length} text segments from audio`
          );
          // Debug: Log segment details
          const segmentsWithText = pitchData.ayah_timing.filter(
            (s: any) => s.text && s.text.trim()
          ).length;
          const totalDuration =
            pitchData.ayah_timing.length > 0
              ? pitchData.ayah_timing[pitchData.ayah_timing.length - 1].end
              : 0;
          console.log(
            `📝 Text segments: ${segmentsWithText} with text, ${
              pitchData.ayah_timing.length - segmentsWithText
            } empty, total duration: ${totalDuration.toFixed(2)}s`
          );
          console.log(
            `📝 First 3 segments:`,
            pitchData.ayah_timing.slice(0, 3)
          );
          console.log(`📝 Last 3 segments:`, pitchData.ayah_timing.slice(-3));
        } else {
          // Generate fallback time segments if text extraction failed
          // This ensures text display is always available during practice
          const maxTime =
            pitchData.reference && pitchData.reference.length > 0
              ? Math.max(...pitchData.reference.map((p: any) => p.time))
              : 0;

          console.log(`📊 Max time from pitch data: ${maxTime.toFixed(2)}s`);

          if (maxTime > 0) {
            // Generate segments based on duration (~2 seconds per segment)
            const numSegments = Math.max(
              5,
              Math.min(20, Math.ceil(maxTime / 2))
            );
            const segmentDuration = maxTime / numSegments;
            const fallbackSegments = [];

            for (let i = 0; i < numSegments; i++) {
              fallbackSegments.push({
                start: i * segmentDuration,
                end: i < numSegments - 1 ? (i + 1) * segmentDuration : maxTime,
                text: "", // Empty text - will show time range
              });
            }

            setReferenceAyahTiming(fallbackSegments);
            console.log(
              `⚠️ Text extraction failed - Generated ${fallbackSegments.length} fallback time segments`
            );
            console.log("📋 Fallback segments:", fallbackSegments.slice(0, 3));
          } else {
            console.log(
              `⚠️ No pitch data available - cannot generate text segments`
            );
            setReferenceAyahTiming([]);
          }
        }

        console.log(
          `Extracted ${pitchData.reference.length} reference pitch points`
        );
      } catch (error) {
        console.error("Error extracting reference pitch:", error);
        setReferencePitchData([]);
      } finally {
        setIsExtractingRefPitch(false);
      }
    };

    extractRefPitch();
  }, [selectedRef?.url, uploadedRefUrl, selectedRef?.id, referenceLibrary]);

  // Note: Practice mode now starts manually via "Start Practice" button only

  // Cleanup practice mode on unmount
  useEffect(() => {
    return () => {
      // Stop practice mode when component unmounts
      if (practicePitchExtractorRef.current) {
        practicePitchExtractorRef.current.stop();
        practicePitchExtractorRef.current = null;
      }
      // Stop Stream 1 (raw recording stream)
      if (practiceRawStreamRef.current) {
        practiceRawStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        practiceRawStreamRef.current = null;
      }
      // Stop Stream 2 (filtered pitch stream)
      if (practiceStreamRef.current) {
        practiceStreamRef.current.getTracks().forEach((track) => track.stop());
        practiceStreamRef.current = null;
      }

      // Cleanup follow mode
      if (followModePitchExtractorRef.current) {
        followModePitchExtractorRef.current.stop();
        followModePitchExtractorRef.current = null;
      }
      if (followModeStreamRef.current) {
        followModeStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        followModeStreamRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run on unmount

  const handleRecordingComplete = (blob: Blob) => {
    setStudentBlob(blob);
    setAnalysisResult(null);
    // DO NOT clear recordingPitchData here - we need it for graph display in test mode
    // recordingPitchData is only cleared in handleRecordingStart when starting a new recording
    
    // Reset recording refs when recording stops
    isRecordingRef.current = false;
    recordingStartTimeRef.current = null;
    setTriggerRecordingStart(false); // Reset trigger
    setTriggerRecordingStop(false);
    // Note: Practice mode and recording are separate - recording doesn't affect practice mode
  };

  // Handle real-time student pitch updates for practice mode
  const handlePracticePitchUpdate = (pitch: PitchPoint) => {
    // Use refs to check if practice mode is active (avoid stale closures)
    if (!isPracticeModeRef.current || practiceStartTimeRef.current === null) {
      return;
    }

    // Wall-clock elapsed time (fallback when reference audio clock is unavailable)
    const elapsedTime = (Date.now() - practiceStartTimeRef.current) / 1000;
    const refDuration = referenceDurationRef.current || Infinity;

    // Prefer reference-audio time so red pitch and cursor share one clock.
    const ws = refWaveSurfer.current;
    const audioTime =
      ws && !ws.isDestroyed ? ws.getCurrentTime() : 0;
    const useAudioTime =
      audioTime > 0.001 || !!(ws && !ws.isDestroyed && ws.isPlaying());
    const mappedTime = useAudioTime
      ? Math.min(audioTime, refDuration * 1.1)
      : Math.min(elapsedTime, refDuration * 1.1);

    // Only stop if significantly over duration (20% buffer)
    const durationProbe = useAudioTime ? audioTime : elapsedTime;
    if (durationProbe >= refDuration * 1.2 && practicePitchExtractorRef.current) {
      console.log(
        `[Practice] Practice duration exceeded (${durationProbe.toFixed(
          2
        )}s > ${refDuration.toFixed(2)}s) - stopping extraction`
      );
      practicePitchExtractorRef.current.stop();
      practicePitchExtractorRef.current = null;
      setIsPracticeMode(false);
      isPracticeModeRef.current = false;

      // Stop reference audio when practice completes
      if (refWaveSurfer.current) {
        refWaveSurfer.current.stop();
        setIsPlaying(false);
        setPlaybackTime(0);
      }

      return;
    }

    // Keep cursor time on the same timeline as plotted red points.
    // Avoid extra clamping that can make red appear ahead of blue.
    setPracticeTime(mappedTime);

    // Create pitch point with mapped time
    const mappedPitch: PitchPoint = {
      frequency: pitch.frequency,
      midi: pitch.midi,
      confidence: pitch.confidence,
      time: mappedTime, // Use mapped time for alignment with reference timeline
    };

    // Update state - replace very-close timestamp sample instead of dropping it.
    setStudentPitchData((prev) => {
      const lastPoint = prev.length > 0 ? prev[prev.length - 1] : null;
      if (lastPoint && Math.abs(lastPoint.time - mappedTime) < 0.01) {
        const updated = [...prev.slice(0, -1), mappedPitch];
        return updated;
      }

      // Add new point - this builds the graph continuously as you speak
      const updated = [...prev, mappedPitch];

      // Only log when pitch is actually detected to reduce console spam
      if (mappedPitch.frequency) {
        console.log(
          `[Practice] ✅ Pitch: ${mappedPitch.frequency.toFixed(
            1
          )}Hz @ ${mappedTime.toFixed(2)}s (${updated.length} points)`
        );
      }

      return updated;
    });
  };

  // Handle pitch updates during recording (for analysis)
  // Make it work EXACTLY like practice mode - same time mapping and flow
  const handleRecordingPitchUpdate = (pitch: PitchPoint) => {
    // Use refs to check if recording is active (avoid stale closures)
    if (!isRecordingRef.current || recordingStartTimeRef.current === null) {
      return;
    }

    // Calculate elapsed time since recording started (fallback clock)
    const elapsedTime = (Date.now() - recordingStartTimeRef.current) / 1000;

    // Apply 1:1 time mapping (student time = reference time) - same as practice mode
    const refDuration = referenceDurationRef.current || Infinity;

    // Prefer reference-audio playback time when available so recording/red/cursor
    // share one clock source across different devices/browsers.
    const ws = refWaveSurfer.current;
    const audioTime = ws && !ws.isDestroyed ? ws.getCurrentTime() : 0;
    const useAudioTime =
      audioTime > 0.001 || !!(ws && !ws.isDestroyed && ws.isPlaying());
    // Keep existing 10% headroom behaviour.
    const mappedTime = useAudioTime
      ? Math.min(audioTime, refDuration * 1.1)
      : Math.min(elapsedTime, refDuration * 1.1);

    // Keep cursor time on the same timeline as plotted red points.
    setRecordingTime(mappedTime);

    // Create pitch point with mapped time (same as practice mode)
    const mappedPitch: PitchPoint = {
      frequency: pitch.frequency,
      midi: pitch.midi,
      confidence: pitch.confidence,
      time: mappedTime, // Use mapped time for alignment with reference timeline
    };

    // Update state - replace very-close timestamp sample instead of dropping it.
    setRecordingPitchData((prev) => {
      const lastPoint = prev.length > 0 ? prev[prev.length - 1] : null;
      if (lastPoint && Math.abs(lastPoint.time - mappedTime) < 0.02) {
        const updated = [...prev.slice(0, -1), mappedPitch];
        return updated;
      }

      // Add new point - this builds the graph continuously as you speak
      const updated = [...prev, mappedPitch];

      // Only log when pitch is actually detected to reduce console spam
      if (mappedPitch.frequency) {
        console.log(
          `[Recording] ✅ Pitch: ${mappedPitch.frequency.toFixed(
            1
          )}Hz @ ${mappedTime.toFixed(2)}s (${updated.length} points)`
        );
      }

      return updated;
    });
  };

  // Handle pitch updates when student follows reference audio (real-time during playback)
  const handleFollowModePitchUpdate = (pitch: PitchPoint) => {
    if (!isFollowingReference || followModeStartTimeRef.current === null) {
      return;
    }

    // Use reference playback clock for alignment (fallback to wall-clock).
    const ws = refWaveSurfer.current;
    const audioTime = ws && !ws.isDestroyed ? ws.getCurrentTime() : 0;
    const elapsedTime = (Date.now() - followModeStartTimeRef.current) / 1000;
    const mappedTime =
      audioTime > 0.001 || !!(ws && !ws.isDestroyed && ws.isPlaying())
        ? audioTime
        : elapsedTime;

    // Map pitch time to reference audio time
    const mappedPitch: PitchPoint = {
      ...pitch,
      time: mappedTime,
    };

    setFollowModePitchData((prev) => {
      const updated = [...prev, mappedPitch];

      // Log every 10th point
      if (updated.length % 10 === 0 || updated.length <= 5) {
        console.log(
          `[Follow Mode] ✅ Pitch data collected: ${updated.length} points`,
          {
            latest: {
              time: mappedPitch.time?.toFixed(2),
              frequency: mappedPitch.frequency?.toFixed(1),
            },
            totalPoints: updated.length,
          }
        );
      }

      return updated;
    });
  };

  // Keep ref updated with latest practice pitch update function
  useEffect(() => {
    handlePitchUpdateRef.current = handlePracticePitchUpdate;
  }, [practiceStartTime, referenceDuration, isPracticeMode]);

  // Start practice mode (pitch extraction without recording)
  const handlePracticeStart = async () => {
    // If already in practice mode, stop it first and clear data
    if (isPracticeMode || isPracticeModeRef.current) {
      // Stop current extractor
      if (practicePitchExtractorRef.current) {
        practicePitchExtractorRef.current.stop();
        practicePitchExtractorRef.current = null;
      }

      // Stop audio recording
      if (
        practiceMediaRecorderRef.current &&
        practiceMediaRecorderRef.current.state !== "inactive"
      ) {
        // Request any remaining data before stopping to ensure all chunks are collected
        if (practiceMediaRecorderRef.current.state === "recording") {
          practiceMediaRecorderRef.current.requestData();
        }
        // Small delay to ensure requestData is processed before stopping
        setTimeout(() => {
          if (
            practiceMediaRecorderRef.current &&
            practiceMediaRecorderRef.current.state !== "inactive"
          ) {
            practiceMediaRecorderRef.current.stop();
          }
          practiceMediaRecorderRef.current = null;
        }, 150);
      } else {
        practiceMediaRecorderRef.current = null;
      }

      // Stop Stream 1 (raw recording stream)
      if (practiceRawStreamRef.current) {
        practiceRawStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        practiceRawStreamRef.current = null;
      }
      flushPracticePcmRecorder();

      // Stop Stream 2 (filtered pitch stream)
      if (practiceStreamRef.current) {
        practiceStreamRef.current.getTracks().forEach((track) => track.stop());
        practiceStreamRef.current = null;
      }

      // Stop reference audio playback
      if (refWaveSurfer.current) {
        refWaveSurfer.current.stop();
        setIsPlaying(false);
        setPlaybackTime(0);
      }

      // Clear state
      setIsPracticeMode(false);
      isPracticeModeRef.current = false;
      setPracticeStartTime(null);
      practiceStartTimeRef.current = null;
      setPracticeTime(0);

      // Small delay to ensure cleanup completes before restarting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Clear any previous errors
    setPracticeError(null);

    // Clear previous student pitch data - start fresh (this clears the graph history)
    setStudentPitchData([]);

    // Clear previous practice audio
    if (practiceAudioUrl) {
      URL.revokeObjectURL(practiceAudioUrl);
      setPracticeAudioUrl(null);
    }
    setPracticeAudioBlob(null);
    practiceAudioChunksRef.current = [];

    // Clear previous practice audio
    if (practiceAudioUrl) {
      URL.revokeObjectURL(practiceAudioUrl);
      setPracticeAudioUrl(null);
    }
    setPracticeAudioBlob(null);
    practiceAudioChunksRef.current = [];

    try {
      // Stop any existing extractor first (safety check)
      if (practicePitchExtractorRef.current) {
        practicePitchExtractorRef.current.stop();
        practicePitchExtractorRef.current = null;
      }

      // Stop any existing streams (safety check)
      if (practiceRawStreamRef.current) {
        practiceRawStreamRef.current
          .getTracks()
          .forEach((track) => track.stop());
        practiceRawStreamRef.current = null;
      }
      if (practiceStreamRef.current) {
        practiceStreamRef.current.getTracks().forEach((track) => track.stop());
        practiceStreamRef.current = null;
      }

      // Practice mode should only do live pitch extraction, not save audio.
      let filteredStream: MediaStream | null = null;
      try {
        filteredStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true, // Keep for feedback prevention
            noiseSuppression: true, // ENABLED - for clean pitch detection
            autoGainControl: true, // ENABLED - for consistent pitch levels
            sampleRate: 44100, // High quality
            channelCount: 1, // Mono
          },
        });
        practiceStreamRef.current = filteredStream;
        console.log("Stream 2 (filtered) created for pitch analysis");
      } catch (filteredStreamError) {
        console.error(
          "Failed to create Stream 2 (filtered):",
          filteredStreamError
        );
        throw filteredStreamError;
      }

      if (!filteredStream) {
        throw new Error("Failed to create practice microphone stream");
      }

      // Set practice mode state FIRST
      const startTime = Date.now();
      setPracticeStartTime(startTime);
      practiceStartTimeRef.current = startTime; // Update ref for callback
      setIsPracticeMode(true);
      isPracticeModeRef.current = true; // Update ref immediately
      setPracticeTime(0);

      // Start pitch extraction for practice mode
      const extractor = new RealTimePitchExtractor();
      practicePitchExtractorRef.current = extractor;

      // Create a wrapper callback that ensures it always has access to latest state
      const pitchUpdateCallback = (pitch: PitchPoint) => {
        // Check if practice mode is still active using refs
        if (
          practiceStartTimeRef.current === null ||
          !isPracticeModeRef.current
        ) {
          return;
        }

        // Call the handler
        handlePracticePitchUpdate(pitch);
      };

      // Use Stream 2 (filtered) for pitch extraction - provides clean pitch visualization
      if (filteredStream) {
        await extractor.startFromStream(
          filteredStream,
          pitchUpdateCallback,
          LIVE_PITCH_FILTER_OPTIONS
        );
      } else {
        console.warn(
          "Stream 2 (filtered) not available - pitch extraction disabled"
        );
        // Pitch extraction won't work, but recording might still work
      }

      // Auto-play reference so practice pitch and cursor share the same timeline.
      if (refWaveSurfer.current && !refWaveSurfer.current.isDestroyed) {
        try {
          refWaveSurfer.current.seekTo(0);
          refWaveSurfer.current.play();
          setIsPlaying(true);
        } catch (e) {
          console.warn("[Practice] Could not auto-play reference:", e);
          setIsPlaying(false);
          setPlaybackTime(0);
        }
      } else {
        setIsPlaying(false);
        setPlaybackTime(0);
      }

      console.log(
        "Practice mode started - reference playback and pitch share the same timeline."
      );
    } catch (error: any) {
      console.error("Error starting practice mode:", error);

      // Set user-friendly error message
      let errorMessage = "Could not start practice mode. ";
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        errorMessage +=
          "Microphone permission denied. Please allow microphone access in your browser settings.";
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        errorMessage +=
          "No microphone found. Please connect a microphone and try again.";
      } else if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        errorMessage +=
          "Microphone is being used by another application. Please close other apps and try again.";
      } else {
        errorMessage += "Please check your microphone settings and try again.";
      }

      setPracticeError(errorMessage);

      // Reset state on error
      setIsPracticeMode(false);
      isPracticeModeRef.current = false;
      setPracticeStartTime(null);
      practiceStartTimeRef.current = null;
      setPracticeTime(0);
    }
  };

  // Note: Reset functionality removed - "Start Practice" button now handles clearing and restarting

  // Stop practice mode (stops but keeps graph data)
  const handlePracticeStop = () => {
    // Stop pitch extraction
    if (practicePitchExtractorRef.current) {
      practicePitchExtractorRef.current.stop();
      practicePitchExtractorRef.current = null;
    }

    // Stop audio recording
    if (
      practiceMediaRecorderRef.current &&
      practiceMediaRecorderRef.current.state !== "inactive"
    ) {
      // Request any remaining data before stopping to ensure all chunks are collected
      if (practiceMediaRecorderRef.current.state === "recording") {
        practiceMediaRecorderRef.current.requestData();
      }
      // Stop recording - onstop handler will process the chunks and create the blob
      setTimeout(() => {
        if (
          practiceMediaRecorderRef.current &&
          practiceMediaRecorderRef.current.state !== "inactive"
        ) {
          practiceMediaRecorderRef.current.stop();
        }
        practiceMediaRecorderRef.current = null;
      }, 150);
    } else {
      practiceMediaRecorderRef.current = null;
    }

    // Stop Stream 1 (raw recording stream)
    if (practiceRawStreamRef.current) {
      practiceRawStreamRef.current.getTracks().forEach((track) => track.stop());
      practiceRawStreamRef.current = null;
    }

    // Stop Stream 2 (filtered pitch stream)
    if (practiceStreamRef.current) {
      practiceStreamRef.current.getTracks().forEach((track) => track.stop());
      practiceStreamRef.current = null;
    }

    // Stop reference audio playback
    if (refWaveSurfer.current) {
      refWaveSurfer.current.stop();
      setIsPlaying(false);
      setPlaybackTime(0);
    }

    // Reset state (but keep student pitch data for display)
    setIsPracticeMode(false);
    isPracticeModeRef.current = false;
    setPracticeStartTime(null);
    practiceStartTimeRef.current = null;
    setPracticeTime(0);
    setPracticeError(null); // Clear any errors

    console.log("Practice mode stopped (graph data preserved)");
  };

  // Reset student pitch when starting new recording
  // Recording mode is completely separate from practice mode
  const handleRecordingStart = () => {
    if (isPracticeMode || isPracticeModeRef.current) {
      handlePracticeStop();
    }
    // Show countdown before starting recording
    setShowRecordingCountdown(true);
  };

  // Actual recording start (called after countdown completes)
  const startRecordingAfterCountdown = async () => {
    // Clear recording pitch data
    setRecordingPitchData([]);

    // DO NOT clear studentPitchData - that's for practice mode only
    // Practice and test modes are completely separate

    // Reset recording-specific state
    setRecordingTime(0);
    
    // Set recording start time for time mapping (like practice mode)
    recordingStartTimeRef.current = Date.now();
    isRecordingRef.current = true;

    // Trigger the Recorder component to start recording
    setTriggerRecordingStart(true);
    
    console.log("[Recording] Starting recording after countdown - pitch data cleared, time mapping initialized");
  };

  const handleRecordingStop = () => {
    // Immediately mark recording as stopped in parent state to avoid UI race
    // when stop is triggered from fullscreen/outside Recorder render branch.
    isRecordingRef.current = false;
    recordingStartTimeRef.current = null;
    setIsRecording(false);
    setTriggerRecordingStop(true);
    // Safety: clear trigger even if Recorder callback is delayed/not reached.
    setTimeout(() => {
      setTriggerRecordingStop(false);
      setTriggerRecordingStart(false);
    }, 400);
  };

  const handleAnalyze = async () => {
    if (!studentBlob) return;
    setIsAnalyzing(true);

    let refBlob: Blob | null = null;
    let referenceId: string | undefined = undefined;

    try {
      // Treat as library reference ONLY if the ID exists in the current library list.
      // This prevents using stale IDs from old cache/localStorage after the backend
      // library has been reset or references were deleted.
      const isLibraryReference =
        selectedRef &&
        selectedRef.id &&
        !isCustomUploadRefId(selectedRef.id) &&
        !uploadedRefUrl &&
        referenceLibrary.some((r) => r.id === selectedRef.id);

      if (isLibraryReference) {
        // Use reference_id to reuse saved reference audio without re-uploading
        referenceId = selectedRef.id;
      } else if (selectedRef) {
        // Fallback: fetch reference audio blob (custom upload or legacy mode)
        const urlToFetch =
          isCustomUploadRefId(selectedRef.id) && uploadedRefUrl
            ? uploadedRefUrl
            : selectedRef.url;
        if (urlToFetch) {
          // Fetch with authentication if it's a library reference (not a blob URL)
          const isBlobUrl = urlToFetch.startsWith('blob:');
          const { getAuthHeader } = await import("../services/authService");
          const response = await fetch(urlToFetch, {
            headers: isBlobUrl ? {} : getAuthHeader(),
          });
          refBlob = await response.blob();
        }
      }
    } catch (err) {
      console.error("Failed to prepare reference audio for analysis", err);
    }

    // Call local server API
    let result: AnalysisResult;
    try {
      result = await analyzeRecitation(
        studentBlob,
        refBlob,
        selectedRef?.title || "Reference",
        referenceId
      );
    } catch (error: any) {
      // Special handling if backend says the selected reference no longer exists.
      // This can happen if the uploads folder was cleared but the frontend still
      // had a stale reference ID from cache.
      const message: string = error?.message || "";
      if (
        message.includes("selected reference audio no longer exists") ||
        (message.includes("Reference with ID") && message.includes("not found"))
      ) {
        console.error(
          "Stale reference detected, clearing library cache.",
          error
        );
        // Clear local cache and reset selection so the user can pick a valid reference.
        referenceLibraryService.clearCache();
        setReferenceLibrary([]);
        setSelectedRef(null);
        setReferenceLibraryError(
          "The previously selected reference is no longer available. Please upload or select a new reference."
        );
      }
      setIsAnalyzing(false);
      // Re-throw to let existing error display logic handle the message in UI
      throw error;
    }
    console.log("Analysis result received:", result);
    console.log("Segments:", result.segments);
    console.log(
      "Student pitch data:",
      result.pitchData?.student?.length || 0,
      "points"
    );
    console.log(
      "Reference pitch data:",
      result.pitchData?.reference?.length || 0,
      "points"
    );
    console.log("Full pitchData:", result.pitchData);

    // Log first few student pitch points to verify data format
    if (result.pitchData?.student && result.pitchData.student.length > 0) {
      console.log(
        "First 3 student pitch points:",
        result.pitchData.student.slice(0, 3)
      );
    }

    setAnalysisResult(result);

    // Force a small delay to ensure state updates before graph renders
    setTimeout(() => {
      console.log("Analysis result state updated, graph should render now");
      // Force a resize event to trigger graph redraw
      window.dispatchEvent(new Event("resize"));
    }, 100);

    // Save progress
    if (selectedRef && selectedRef.id) {
      progressService.saveAttempt(selectedRef, result);
      const progress = progressService.getProgress(selectedRef.id);
      setProgressData(progress);
    }

    setIsAnalyzing(false);
  };

  const handleSyncPlay = () => {
    setIsPlaying(true);
    if (refWaveSurfer.current) {
      refWaveSurfer.current.setPlaybackRate(playbackSpeed);
      refWaveSurfer.current.seekTo(0);
      refWaveSurfer.current.play();
      // Track playback time
      const interval = setInterval(() => {
        if (refWaveSurfer.current && !refWaveSurfer.current.isPlaying()) {
          setIsPlaying(false);
          clearInterval(interval);
        } else if (refWaveSurfer.current) {
          setPlaybackTime(refWaveSurfer.current.getCurrentTime());
        }
      }, 100);
    }
    if (studentWaveSurfer.current) {
      studentWaveSurfer.current.setPlaybackRate(studentPlaybackSpeed);
      studentWaveSurfer.current.seekTo(0);
      studentWaveSurfer.current.play();
    }
  };

  const handleStopAll = () => {
    setIsPlaying(false);
    if (refWaveSurfer.current) refWaveSurfer.current.stop();
    if (studentWaveSurfer.current) studentWaveSurfer.current.stop();
    setSyncProgress(0);
    setPlaybackTime(0);
  };

  // Full-screen mode handlers
  const handleFullScreenPlay = () => {
    if (refWaveSurfer.current && !refWaveSurfer.current.isPlaying()) {
      refWaveSurfer.current.play();
      setIsPlaying(true);
    }
  };

  const handleFullScreenPause = () => {
    if (refWaveSurfer.current && refWaveSurfer.current.isPlaying()) {
      refWaveSurfer.current.pause();
      setIsPlaying(false);
    }
  };

  const handleFullScreenStop = () => {
    setIsPlaying(false);
    if (refWaveSurfer.current) refWaveSurfer.current.stop();
    if (studentWaveSurfer.current) studentWaveSurfer.current.stop();
    setSyncProgress(0);
    setPlaybackTime(0);
  };

  const handleFullScreenRestart = () => {
    setIsPlaying(false);
    if (refWaveSurfer.current) {
      refWaveSurfer.current.stop();
      refWaveSurfer.current.seekTo(0);
    }
    if (studentWaveSurfer.current) {
      studentWaveSurfer.current.stop();
      studentWaveSurfer.current.seekTo(0);
    }
    setSyncProgress(0);
    setPlaybackTime(0);
    // If in practice mode, restart it
    if (isPracticeMode) {
      handlePracticeStop();
      setTimeout(() => {
        handlePracticeStart();
      }, 100);
    }
  };

  // Handle seek to time in fullscreen mode (for Quran text display)
  const handleFullScreenSeekToTime = (time: number) => {
    if (refWaveSurfer.current && referenceDuration > 0) {
      const progress = time / referenceDuration;
      refWaveSurfer.current.seekTo(progress);
      // If not playing, start playback
      if (!isPlaying) {
        refWaveSurfer.current.play();
      }
    }
  };

  // Practice audio playback handlers
  const handlePlayPracticeAudio = () => {
    if (practiceAudioRef.current) {
      practiceAudioRef.current.play();
      setIsPlayingPracticeAudio(true);
    }
  };

  const handlePausePracticeAudio = () => {
    if (practiceAudioRef.current) {
      practiceAudioRef.current.pause();
      setIsPlayingPracticeAudio(false);
    }
  };

  const handleStopPracticeAudio = () => {
    if (practiceAudioRef.current) {
      practiceAudioRef.current.pause();
      practiceAudioRef.current.currentTime = 0;
      setIsPlayingPracticeAudio(false);
    }
  };

  // Track practice audio playback state and time
  const [practiceAudioTime, setPracticeAudioTime] = useState(0);
  const [practiceAudioDuration, setPracticeAudioDuration] = useState(0);

  useEffect(() => {
    const audioElement = practiceAudioRef.current;
    if (!audioElement) return;

    const handlePlay = () => {
      setIsPlayingPracticeAudio(true);
      console.log("Practice audio started");
    };

    const handlePause = () => {
      setIsPlayingPracticeAudio(false);
      console.log("Practice audio paused");
    };

    const handleEnded = () => {
      setIsPlayingPracticeAudio(false);
      setPracticeAudioTime(0);
      console.log("Practice audio ended");
      // Force state update with slight delay to ensure UI updates
      setTimeout(() => setIsPlayingPracticeAudio(false), 0);
    };

    const handleTimeUpdate = () => {
      setPracticeAudioTime(audioElement.currentTime);
      // Check if audio ended (sometimes ended event doesn't fire)
      if (audioElement.ended && isPlayingPracticeAudio) {
        setIsPlayingPracticeAudio(false);
        setPracticeAudioTime(0);
      }
    };

    const handleLoadedMetadata = () => {
      setPracticeAudioDuration(audioElement.duration || 0);
    };

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("timeupdate", handleTimeUpdate);
    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);

    // Set initial duration if already loaded
    if (audioElement.readyState >= 1) {
      setPracticeAudioDuration(audioElement.duration || 0);
    }

    return () => {
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [practiceAudioUrl, isPlayingPracticeAudio]);

  // Reference audio controls (when pitch data is available)
  const handleRefPlay = () => {
    // Control reference audio playback (hidden Waveform component)
    if (refWaveSurfer.current) {
      if (refWaveSurfer.current.isPlaying()) {
        refWaveSurfer.current.pause();
        setIsPlaying(false);
      } else {
        refWaveSurfer.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleRefStop = () => {
    // Stop reference audio playback
    if (refWaveSurfer.current) {
      refWaveSurfer.current.stop();
      setIsPlaying(false);
      setPlaybackTime(0);
    }
  };

  const handleRefRestart = () => {
    // Restart reference audio playback
    if (refWaveSurfer.current) {
      refWaveSurfer.current.seekTo(0);
      refWaveSurfer.current.play();
      setIsPlaying(true);
    }
  };

  // Handle seek synchronization
  const handleReferenceSeek = (progress: number) => {
    if (studentBlob && !isSyncingRef) {
      setIsSyncingRef(true);
      setIsSyncingStudent(true);
      // Sync student audio directly
      if (studentWaveSurfer.current) {
        studentWaveSurfer.current.seekTo(progress);
      }
      // Update sync progress for reactive updates
      setSyncProgress(progress);
      // Reset syncing flags after a brief delay
      setTimeout(() => {
        setIsSyncingRef(false);
        setIsSyncingStudent(false);
      }, 100);
    }
  };

  const handleStudentSeek = (progress: number) => {
    if (!isSyncingStudent) {
      setIsSyncingRef(true);
      setIsSyncingStudent(true);
      // Sync reference audio directly
      if (refWaveSurfer.current) {
        refWaveSurfer.current.seekTo(progress);
      }
      // Update sync progress for reactive updates
      setSyncProgress(progress);
      // Reset syncing flags after a brief delay
      setTimeout(() => {
        setIsSyncingRef(false);
        setIsSyncingStudent(false);
      }, 100);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if user can upload (only Admin and Qari can upload)
    if (userRole === 'public' || !user || (userRole !== 'admin' && userRole !== 'qari')) {
      setAlertModal({ isOpen: true, title: 'Upload Restricted', message: "Only Admin and Qari users can upload references. Please login or register as Admin/Qari to upload content.", variant: 'warning' });
      e.target.value = ''; // Reset file input
      return;
    }

    // Validate file type
    if (!file.type.startsWith("audio/")) {
      setAlertModal({ isOpen: true, title: 'Invalid File', message: "Please upload a valid audio file", variant: 'error' });
      return;
    }

    try {
      // Show loading state
      setIsLoadingReferences(true);
      setUploadProgress(0);

      // Extract title from filename (remove extension)
      const title = file.name.replace(/\.[^/.]+$/, "") || file.name;

      // For admins, mark as public by default so public users can see it
      // Qari content is private by default
      const isPublic = userRole === 'admin';

      // Upload to library and save automatically with progress tracking
      const savedReference = await referenceLibraryService.uploadReference(
        file,
        title,
        "Custom Upload", // Default maqam, user can edit later if needed
        (progress) => {
          setUploadProgress(progress);
        },
        isPublic
      );

      console.log("Reference saved to library:", savedReference);

      // Refresh library list - wait a moment for backend to process
      try {
        // Clear cache first
        referenceLibraryService.clearCache();
        
        // Retry mechanism: backend might need a moment to process the upload
        let refs: any[] = [];
        let retries = 0;
        const maxRetries = 3;
        const uploadedRefId = savedReference.id;
        
        while (retries < maxRetries) {
          // Wait before retrying (increasing delay)
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * retries));
          }
          
          // Fetch references
          refs = await referenceLibraryService.getReferences();
          
          // Check if the uploaded file is in the list
          const foundUploadedFile = refs.find((r: any) => r.id === uploadedRefId);
          
          if (foundUploadedFile || retries === maxRetries - 1) {
            // Found the file or this is the last retry - proceed
            break;
          }
          
          retries++;
          console.log(`[Upload] Uploaded file not found yet, retry ${retries}/${maxRetries}...`);
        }
        
        // Sort by upload_date (latest first) to ensure newest files appear first
        refs.sort((a: any, b: any) => {
          const dateA = a.upload_date ? new Date(a.upload_date).getTime() : 0;
          const dateB = b.upload_date ? new Date(b.upload_date).getTime() : 0;
          return dateB - dateA; // Descending order (newest first)
        });
        
        referenceLibraryService.cacheReferences(refs);
        // Force state update by creating a new array reference
        setReferenceLibrary([...refs]);
        
        console.log(`[Upload] Refreshed library with ${refs.length} references (latest: ${refs[0]?.filename || refs[0]?.title || 'none'})`);
        
        // Auto-select the latest file after upload
        if (refs.length > 0) {
          const latestRef = refs[0];
          try {
            const url = await referenceLibraryService.getReferenceAudioBlobUrl(latestRef.id);
            setSelectedRef({
              id: latestRef.id,
              title: latestRef.title,
              url,
              duration: latestRef.duration || 0,
              maqam: latestRef.maqam || "Library",
              is_preset: latestRef.is_preset || false,
              text_segments: latestRef.text_segments || [],
              ...latestRef,
            });
          } catch (error) {
            console.error("Failed to load reference audio:", error);
            // Don't fallback to direct URL - it won't work without auth
            // Set selectedRef without URL - will retry
            setSelectedRef({
              id: latestRef.id,
              title: latestRef.title,
              url: "", // Empty URL - will need to retry
              duration: latestRef.duration || 0,
              maqam: latestRef.maqam || "Library",
              is_preset: latestRef.is_preset || false,
              text_segments: latestRef.text_segments || [],
              ...latestRef,
            });
            // Retry getting blob URL after a short delay
            setTimeout(async () => {
              try {
                const retryUrl = await referenceLibraryService.getReferenceAudioBlobUrl(latestRef.id);
                setSelectedRef((prev: any) => prev ? { ...prev, url: retryUrl } : prev);
              } catch (retryError) {
                console.error("Retry failed:", retryError);
              }
            }, 1000);
          }
        }
        
        setReferenceLibraryError(null);
      } catch (err) {
        console.error("Failed to refresh library:", err);
      }

      // Switch to the newly saved reference from library
      // Get authenticated blob URL for audio elements
      let libraryUrl: string;
      try {
        libraryUrl = await referenceLibraryService.getReferenceAudioBlobUrl(savedReference.id);
      } catch (error) {
        console.error("Failed to load reference audio:", error);
        // Don't use fallback URL - it won't work without auth
        // Retry getting blob URL
        try {
          libraryUrl = await referenceLibraryService.getReferenceAudioBlobUrl(savedReference.id);
        } catch (retryError) {
          console.error("Retry also failed:", retryError);
          // Set error but continue - user can retry manually
          setReferenceLibraryError("Failed to load reference audio. Please refresh the page.");
          libraryUrl = ""; // Empty URL
        }
      }
      setUploadedRefUrl(null); // Clear blob URL since we're using library now

      // IMPORTANT: Clear old graph and set extraction state BEFORE setting new selectedRef
      // This ensures "extracting..." shows immediately instead of previous graph
      // Set extraction state first to immediately show "Extracting reference pitch..."
      setIsExtractingRefPitch(true);
      setReferencePitchData([]);
      pitchDataRefIdRef.current = undefined; // Clear ref ID so old graph is immediately hidden

      setSelectedRef({
        id: savedReference.id,
        title: savedReference.title,
        url: libraryUrl,
        duration: savedReference.duration || 0,
        maqam: savedReference.maqam || "Custom Upload",
      });
      setStudentBlob(null);
      setAnalysisResult(null);
      setUploadProgress(100); // Complete
    } catch (error) {
      console.error("Failed to save reference to library:", error);
      // Fallback to old behavior (custom upload without saving)
      const url = URL.createObjectURL(file);
      setUploadedRefUrl(url);
      setSelectedRef({
        id: `custom_${file.name}_${file.size}_${file.lastModified}`,
        title: file.name,
        url: url,
        duration: 0,
        maqam: "Custom Upload",
      });
      setStudentBlob(null);
      setAnalysisResult(null);
      setAlertModal({ isOpen: true, title: 'Warning', message: "Failed to save reference to library. Using temporary upload instead.", variant: 'warning' });
    } finally {
      setIsLoadingReferences(false);
      // Reset progress after a short delay to show completion
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return (
      <div className='max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 pb-20 sm:pb-24 overflow-x-clip min-h-0'>
      {/* Header Section */}
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-slate-800'>
            {userRole === 'public' ? 'Training Studio (Demo)' : 'Training Studio'}
          </h1>
          <p className='text-slate-500'>
            {userRole === 'public' 
              ? 'Demo mode: Try the platform with sample content. Register for full features.'
              : 'Compare your recitation with a reference track'}
          </p>
        </div>

        {/* Qari Selector for Students */}
        {userRole === 'student' && (
          <div className="mb-6">
            <QariSelector
              onQariSelected={async () => {
                // Set loading state immediately
                setIsLoadingReferences(true);
                setReferenceLibraryError(null);
                // Clear current selection while loading (use null instead of [])
                setSelectedRef(null);
                setReferenceLibrary([]);
                
                // Also clear pitch data and analysis
                setReferencePitchData([]);
                setAnalysisResult(null);
                setStudentBlob(null);
                pitchDataRefIdRef.current = undefined;
                
                // Retry mechanism to ensure backend has processed the Qari assignment
                const { getAvailableContent } = await import("../services/platformService");
                let contentData = null;
                let retries = 0;
                const maxRetries = 3;
                
                while (retries < maxRetries && !contentData?.content) {
                  // Wait a bit before retrying (increasing delay)
                  if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                  }
                  
                  try {
                    contentData = await getAvailableContent();
                    
                    // If we got content or a clear message, break
                    if (contentData.content || contentData.message) {
                      break;
                    }
                  } catch (err) {
                    console.warn(`Attempt ${retries + 1} failed:`, err);
                  }
                  
                  retries++;
                }
                
                // Reload references after Qari selection
                try {
                  if (!contentData) {
                    contentData = await getAvailableContent();
                  }
                  
                  console.log("[Qari Change] Content loaded:", contentData);
                  
                  // Clear error if we have a Qari assigned (even if no content yet)
                  if (contentData.qari || !contentData.message) {
                    setReferenceLibraryError(null);
                  }
                  
                  if (contentData.content && contentData.content.length > 0) {
                    console.log(`[Qari Change] Found ${contentData.content.length} content items`);
                    // Map and sort by latest upload date (newest first)
                    const mappedRefs = contentData.content.map((item: any) => ({
                      id: item.reference_id || item.id,
                      title: item.reference_title || item.title || `Surah ${item.surah_number || 'N/A'}`,
                      maqam: item.maqam,
                      filename: item.filename || item.reference_title || item.title || "",
                      file_path: item.file_path || "",
                      duration: item.reference_duration || item.duration || 0,
                      upload_date: item.upload_date || null, // Preserve null, don't convert to empty string
                      file_size: item.file_size || 0,
                      is_preset: item.is_preset || false,
                      text_segments: item.text_segments || [],
                      created_at: item.created_at || item.upload_date || null, // Preserve null for sorting
                    }));
                    
                    // Sort by upload_date FIRST (actual file upload date), then created_at as fallback
                    // This ensures the latest uploaded file appears first, not when it was added to Qari's library
                    const refs = mappedRefs.sort((a: any, b: any) => {
                      // Helper function to safely get timestamp
                      const getTimestamp = (item: any): number => {
                        // Try upload_date first
                        if (item.upload_date && item.upload_date !== "" && item.upload_date !== null) {
                          const date = new Date(item.upload_date);
                          if (!isNaN(date.getTime())) {
                            return date.getTime();
                          }
                        }
                        // Fallback to created_at
                        if (item.created_at && item.created_at !== "" && item.created_at !== null) {
                          const date = new Date(item.created_at);
                          if (!isNaN(date.getTime())) {
                            return date.getTime();
                          }
                        }
                        // Return 0 for invalid dates (will sort to end)
                        return 0;
                      };
                      
                      const dateA = getTimestamp(a);
                      const dateB = getTimestamp(b);
                      
                      return dateB - dateA; // Descending order (newest first)
                    });
                    
                    console.log("[Qari Change] Sorted references (latest first):", refs.map((r: any) => ({ 
                      id: r.id, 
                      filename: r.filename,
                      upload_date: r.upload_date,
                      created_at: r.created_at 
                    })));
                    
                    // Update reference library
                    setReferenceLibrary(refs);
                    
                    // Always select the latest file (first in sorted array)
                    if (refs.length > 0) {
                      const latestRef = refs[0];
                      console.log("[Qari Change] Auto-selecting latest reference:", latestRef.id, latestRef.filename || latestRef.title, "upload_date:", latestRef.upload_date);
                      
                      // Verify this is actually the latest by checking upload_date
                      if (refs.length > 1) {
                        const secondRef = refs[1];
                        console.log("[Qari Change] Second reference for comparison:", secondRef.id, secondRef.filename, "upload_date:", secondRef.upload_date);
                      }
                      
                      // Set extraction state to show "Extracting..." immediately
                      setIsExtractingRefPitch(true);
                      setReferencePitchData([]);
                      pitchDataRefIdRef.current = undefined;
                      
                      // Get authenticated blob URL for audio elements
                      try {
                        const url = await referenceLibraryService.getReferenceAudioBlobUrl(latestRef.id);
                        console.log("[Qari Change] Got blob URL for reference:", latestRef.id);
                        
                        // Set selected reference with all properties
                        setSelectedRef({
                          id: latestRef.id,
                          title: latestRef.title,
                          filename: latestRef.filename,
                          url,
                          duration: latestRef.duration || 0,
                          maqam: latestRef.maqam || "Library",
                          is_preset: latestRef.is_preset || false,
                          text_segments: latestRef.text_segments || [],
                          upload_date: latestRef.upload_date,
                          ...latestRef,
                        });
                        console.log("[Qari Change] Selected reference set:", latestRef.id);
                      } catch (error) {
                        console.error("[Qari Change] Failed to load reference audio:", error);
                        // Don't fallback to direct URL - it won't work without auth
                        // Set selectedRef without URL - will retry
                        setSelectedRef({
                          id: latestRef.id,
                          title: latestRef.title,
                          filename: latestRef.filename,
                          url: "", // Empty URL - will need to retry
                          duration: latestRef.duration || 0,
                          maqam: latestRef.maqam || "Library",
                          is_preset: latestRef.is_preset || false,
                          text_segments: latestRef.text_segments || [],
                          upload_date: latestRef.upload_date,
                          ...latestRef,
                        });
                        // Retry getting blob URL after a short delay
                        setTimeout(async () => {
                          try {
                            const retryUrl = await referenceLibraryService.getReferenceAudioBlobUrl(latestRef.id);
                            setSelectedRef((prev: any) => prev ? { ...prev, url: retryUrl } : prev);
                          } catch (retryError) {
                            console.error("[Qari Change] Retry failed:", retryError);
                          }
                        }, 1000);
                      }
                    } else {
                      console.log("[Qari Change] No references found after mapping");
                      setSelectedRef(null);
                    }
                  } else {
                    console.log("[Qari Change] No content in response:", contentData);
                    // Qari selected but no content yet - clear error, show empty library
                    setReferenceLibrary([]);
                    setSelectedRef(null);
                    setReferenceLibraryError(null);
                  }
                } catch (err: any) {
                  console.error("[Qari Change] Failed to reload content:", err);
                  setReferenceLibraryError(err.message || "Failed to load Qari content");
                  setSelectedRef(null);
                } finally {
                  // Always clear loading state
                  setIsLoadingReferences(false);
                }
              }}
            />
          </div>
        )}

        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto'>
          {/* Reference Library Selector */}
          <ReferenceLibrary
            references={referenceLibrary}
            selectedId={uploadedRefUrl ? "" : (selectedRef?.id || "")}
            onSelect={async (id) => {
              if (!id) return;
              const ref = referenceLibrary.find((r) => r.id === id);
              if (!ref) return;

              // Get authenticated blob URL for audio elements
              let url: string;
              try {
                url = await referenceLibraryService.getReferenceAudioBlobUrl(ref.id);
              } catch (error) {
                console.error("Failed to load reference audio:", error);
                // Don't fallback to direct URL - it won't work without auth
                // Retry getting blob URL
                try {
                  url = await referenceLibraryService.getReferenceAudioBlobUrl(ref.id);
                } catch (retryError) {
                  console.error("Retry also failed:", retryError);
                  // Show error but don't set URL
                  setReferenceLibraryError("Failed to load reference audio. Please try again.");
                  return; // Don't set selectedRef if we can't get the audio
                }
              }

              setUploadedRefUrl(null);
              setStudentBlob(null);
              setAnalysisResult(null);

              // IMPORTANT: Clear old graph and set extraction state BEFORE setting new selectedRef
              // This ensures "extracting..." shows immediately instead of previous graph
              setReferencePitchData([]);
              pitchDataRefIdRef.current = undefined; // Clear ref ID so old graph is immediately hidden
              setIsExtractingRefPitch(true);

              // Set selectedRef - this will trigger useEffect to start extraction
              setSelectedRef({
                id: ref.id,
                title: ref.title,
                url,
                duration: ref.duration || 0,
                maqam: ref.maqam || "Library",
                is_preset: ref.is_preset || false,
                text_segments: ref.text_segments || [],
              });

              // Check if this is a preset with text_segments and set timing
              if (ref.is_preset && ref.text_segments && ref.text_segments.length > 0) {
                // Debug: Log raw text_segments to see their structure
                console.log(`[PresetLoad] Raw text_segments from API:`, ref.text_segments);

                // Convert text_segments to ayatTiming format - check multiple possible text property names
                const presetTextSegments = ref.text_segments.map((seg: any) => {
                  const textValue = seg.text || seg.text_content || (typeof seg === 'string' ? seg : '');
                  const result = {
                    text: textValue,
                    start: seg.start || 0,
                    end: seg.end || 0,
                  };
                  console.log(`[PresetLoad] Mapped segment:`, result);
                  return result;
                });
                
                // Sort by 'start' field to ensure proper chronological order
                presetTextSegments.sort((a, b) => (a.start || 0) - (b.start || 0));

                // Store in ref for useEffect to check
                presetTextSegmentsRef.current = presetTextSegments;

                // Count segments with actual text
                const segmentsWithText = presetTextSegments.filter((seg: any) => seg.text && seg.text.trim() !== '').length;
                console.log(`✅ Set preset text segments: ${presetTextSegments.length} total, ${segmentsWithText} with text (sorted by start)`, presetTextSegments);

                // Set timing - use setTimeout to ensure it runs after useEffect clears it
                setTimeout(() => {
                  setReferenceAyahTiming(presetTextSegments);
                }, 50);
              } else {
                // Not a preset or no text segments - clear text
                presetTextSegmentsRef.current = null;
                setReferenceAyahTiming([]);
              }
            }}
            isLoading={isLoadingReferences}
            error={referenceLibraryError}
          />

          <div className='flex flex-col gap-2'>
            {(userRole === 'public' || !user || (userRole !== 'admin' && userRole !== 'qari')) ? (
              <div className='inline-flex items-center justify-center h-10 px-4 bg-slate-300 text-slate-600 rounded-lg text-sm font-medium'>
                Login as Admin/Qari to upload
              </div>
            ) : (
              <label className='inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 whitespace-normal sm:whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer transition-colors text-xs sm:text-sm font-medium shadow-sm shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed' style={{ pointerEvents: isLoadingReferences ? 'none' : 'auto' }}>
                <Upload size={16} />
                {isLoadingReferences ? 'Uploading...' : 'Upload Ref'}
                <input
                  type='file'
                  accept='audio/*'
                  onChange={handleFileUpload}
                  className='hidden'
                  disabled={isLoadingReferences}
                />
              </label>
            )}

            {/* Upload Progress Bar */}
            {isLoadingReferences && uploadProgress > 0 && (
              <div className='w-full bg-slate-200 rounded-full h-2 overflow-hidden'>
                <div
                  className='bg-emerald-600 h-full transition-all duration-300 ease-out rounded-full'
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}

            {/* Upload Progress Percentage */}
            {isLoadingReferences && uploadProgress > 0 && (
              <div className='text-xs text-slate-500 text-center'>
                {uploadProgress}% uploaded
              </div>
            )}
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 mt-4'>
        {/* Main Workspace */}
        <div className='lg:col-span-8 space-y-4 sm:space-y-6 min-w-0'>
          {/* Reference Audio Section */}
          <div className='bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4'>
              <h2 className='text-base sm:text-lg font-semibold text-emerald-700 flex items-center gap-2'>
                <span className='flex items-center justify-center w-8 h-8 bg-emerald-100 rounded-lg'>
                  <Music size={16} className='text-emerald-600' />
                </span>
                Reference Audio
              </h2>
              <div className='flex items-center gap-2 flex-shrink-0'>
                {selectedRef?.maqam && (
                  <span className='text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full'>
                    {selectedRef.maqam}
                  </span>
                )}
              </div>
            </div>
            <div className='bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner'>
              {/* Show "Extracting..." if:
                  1. isExtractingRefPitch is true, OR
                  2. The current pitch data doesn't belong to the current selectedRef (old data from previous file)
              */}
              {isExtractingRefPitch ||
               (pitchDataRefIdRef.current !== undefined &&
                pitchDataRefIdRef.current !== selectedRef?.id) ? (
                <div className='text-center py-12 text-slate-500'>
                  <p className='text-lg font-medium mb-2'>Extracting reference pitch...</p>
                  {selectedRef?.title && (
                    <p className='text-sm text-slate-400'>{selectedRef.title}</p>
                  )}
                </div>
              ) : (
                referencePitchData.length > 0 ||
                (analysisResult?.pitchData?.reference &&
                  analysisResult.pitchData.reference.length > 0) ||
                (analysisResult?.pitchData?.student &&
                  analysisResult.pitchData.student.length > 0)
              ) ? (
                <div>
                  {/* Hidden Waveform to load audio for playback controls */}
                  <div className='hidden'>
                    <Waveform
                      url={
                        isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
                          ? uploadedRefUrl
                          : (selectedRef?.url || "")
                      }
                      height={1}
                      waveColor='#94a3b8'
                      progressColor={APP_COLORS.primary}
                      onReady={(ws) => {
                        refWaveSurfer.current = ws;

                        // Set initial playback speed
                        ws.setPlaybackRate(playbackSpeed);

                        // Get actual audio duration and update reference duration
                        const audioDuration = ws.getDuration();
                        if (audioDuration && audioDuration > 0) {
                          setReferenceDuration(audioDuration);
                          referenceDurationRef.current = audioDuration;
                          console.log(
                            `Reference audio duration: ${audioDuration.toFixed(
                              2
                            )}s`
                          );
                        }

                        // Track playback state and time for LivePitchGraph
                        let animationFrameId: number | null = null;

                        const updatePlaybackTime = () => {
                          if (ws && !ws.isDestroyed && ws.isPlaying()) {
                            setPlaybackTime(ws.getCurrentTime());
                            animationFrameId =
                              requestAnimationFrame(updatePlaybackTime);
                          } else {
                            animationFrameId = null;
                          }
                        };

                        ws.on("play", () => {
                          setIsPlaying(true);
                          if (!animationFrameId) {
                            updatePlaybackTime();
                          }
                        });

                        ws.on("pause", () => {
                          setIsPlaying(false);
                          if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                            animationFrameId = null;
                          }
                        });

                        ws.on("finish", () => {
                          setIsPlaying(false);
                          setPlaybackTime(0);
                          if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                            animationFrameId = null;
                          }

                          // Stop practice mode when reference audio finishes
                          if (
                            isPracticeModeRef.current &&
                            practicePitchExtractorRef.current
                          ) {
                            console.log(
                              "[Practice] Reference audio finished - stopping practice mode"
                            );
                            practicePitchExtractorRef.current.stop();
                            practicePitchExtractorRef.current = null;
                            setIsPracticeMode(false);
                            isPracticeModeRef.current = false;

                            // Stop Stream 1 (raw recording stream)
                            if (practiceRawStreamRef.current) {
                              practiceRawStreamRef.current
                                .getTracks()
                                .forEach((track) => track.stop());
                              practiceRawStreamRef.current = null;
                            }
                            // Stop Stream 2 (filtered pitch stream)
                            if (practiceStreamRef.current) {
                              practiceStreamRef.current
                                .getTracks()
                                .forEach((track) => track.stop());
                              practiceStreamRef.current = null;
                            }
                          }
                        });
                      }}
                      showControls={false}
                      title=''
                      interact={false}
                    />
                  </div>

                  {/* Prominent reference pitch graph - reference contour only */}
                  {/* Only show this section when NOT extracting */}
                  {!isExtractingRefPitch && (
                  <div className='mb-4'>
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3'>
                      <h3 className='text-base sm:text-lg font-semibold text-slate-700 flex items-center gap-2'>
                        <Music size={18} className='text-emerald-600' />
                        Reference Pitch
                        {isPracticeMode && (
                          <span className='text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full'>
                            Practice Mode Active
                          </span>
                        )}
                        {isPlaying && (
                          <span className='text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full'>
                            Playing...
                          </span>
                        )}
                      </h3>
                      <div className='flex flex-wrap items-center gap-2'>
                        {(referencePitchData.length > 0 ||
                          (analysisResult?.pitchData?.reference && analysisResult.pitchData.reference.length > 0)) && (
                          <>
                            {referencePitchData.length > 0 && isPracticeMode ? (
                              <>
                                <button
                                  onClick={handlePracticeStop}
                                  className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-red-600 bg-red-50 border border-red-200 hover:bg-red-100'
                                  title='Stop practice mode'
                                >
                                  <Square size={14} />
                                  Stop
                                </button>
                                <button
                                  onClick={() => setShowCountdown(true)}
                                  className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100'
                                  title='Restart practice - clear graph and start fresh'
                                >
                                  <RefreshCw size={14} />
                                  Restart
                                </button>
                              </>
                            ) : null}
                            <button
                              onClick={clearPracticeGraph}
                              className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-red-600 bg-red-50 border border-red-200 hover:bg-red-100'
                              title='Clear student (red) graph'
                            >
                              <X size={14} />
                              Delete Graph
                            </button>
                            <button
                              onClick={() => {
                                setIsPracticeFullScreenOpen(true);
                              }}
                              className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100'
                              title='Open graph in full-screen mode'
                            >
                              <Maximize2 size={14} />
                              Full Screen
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Live Hz Display - Shows real-time pitch during practice */}
                    {isPracticeMode && (
                      <LiveHzDisplay pitchData={studentPitchData} />
                    )}

                    {/* Practice graph: reference + live student pitch (red) during practice */}
                    <CombinedWaveformPitch
                      referencePitch={
                        analysisResult?.pitchData?.reference &&
                        analysisResult.pitchData.reference.length > 0
                          ? analysisResult.pitchData.reference.map(
                              (p: any) => ({
                                time: p.time || 0,
                                f_hz: p.f_hz || null,
                                midi: p.midi || null,
                                confidence: p.confidence || 0.9,
                              })
                            )
                          : referencePitchData
                      }
                      studentPitch={
                        isPracticeMode || studentPitchData.length > 0
                          ? studentPitchData
                          : []
                      }
                      isRecording={isPracticeMode}
                      isPlaying={
                        isPracticeMode
                          ? false
                          : isPlaying && !!refWaveSurfer.current?.isPlaying()
                      }
                      currentTime={
                        isPracticeMode
                          ? practiceTime
                          : isPlaying && refWaveSurfer.current?.isPlaying()
                          ? playbackTime || 0
                          : 0
                      }
                      referenceDuration={referenceDuration}
                      referenceAudioUrl={
                        isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
                          ? uploadedRefUrl
                          : (selectedRef?.url || "")
                      }
                      studentAudioUrl={null}
                      studentAudioBlob={null}
                      onSeek={(progress) => {
                        if (
                          refWaveSurfer.current &&
                          !refWaveSurfer.current.isDestroyed &&
                          referenceDuration > 0
                        ) {
                          try {
                            refWaveSurfer.current.seekTo(progress);
                          } catch (error) {
                            console.warn("Error seeking audio:", error);
                          }
                        }
                      }}
                      height={pitchGraphHeight}
                      markers={[]}
                    />

                    {/* Quranic Text Display - Always show below waveform when text segments are available (Admin and Qari only) */}
                    {(() => {
                      // Get text segments - prioritize referenceAyahTiming first (where preset segments are stored)
                      let textSegments: any[] = [];

                      // First check referenceAyahTiming (where preset segments get stored by useEffect and initial load)
                      if (referenceAyahTiming && referenceAyahTiming.length > 0) {
                        textSegments = referenceAyahTiming;
                        // Sort by 'start' field to ensure proper order
                        textSegments = [...textSegments].sort((a, b) => (a.start || 0) - (b.start || 0));
                        const segmentsWithText = textSegments.filter((seg: any) => seg.text && seg.text.trim() !== '').length;
                        console.log(`[TextDisplay] Using referenceAyahTiming: ${textSegments.length} total, ${segmentsWithText} with text (sorted by start)`);
                      }

                      // Fallback: Check selectedRef.text_segments if referenceAyahTiming is empty
                      if (textSegments.length === 0 && selectedRef && !Array.isArray(selectedRef) && selectedRef.text_segments && Array.isArray(selectedRef.text_segments) && selectedRef.text_segments.length > 0) {
                        textSegments = selectedRef.text_segments.map((seg: any) => {
                          const textValue = seg.text || seg.text_content || '';
                          return {
                            text: textValue,
                            start: seg.start || 0,
                            end: seg.end || 0,
                          };
                        });
                        // Sort by 'start' field to ensure proper order
                        textSegments = [...textSegments].sort((a, b) => (a.start || 0) - (b.start || 0));
                        console.log(`[TextDisplay] Using selectedRef.text_segments as fallback (${textSegments.length} segments, sorted by start)`);
                      }

                      // Filter to only count segments with actual text content
                      const segmentsWithText = textSegments.filter((seg: any) => seg.text && seg.text.trim() !== '');
                      
                      // Only show if there are segments with actual text content
                      const shouldShow = segmentsWithText.length > 0 && referenceDuration > 0;
                      // Show for Admin, Qari, AND Student roles (students can see their Qari's text segments)
                      const userRole = user?.role;
                      const shouldShowForRole = shouldShow && (userRole === 'admin' || userRole === 'qari' || userRole === 'student');

                      console.log(`[TextDisplay] Final check: textSegments.length=${textSegments.length}, segmentsWithText.length=${segmentsWithText.length}, referenceDuration=${referenceDuration}, shouldShow=${shouldShow}, userRole=${userRole}, shouldShowForRole=${shouldShowForRole}`);

                      return shouldShowForRole ? (
                        <div className='mt-4'>
                          <AyahTextDisplay
                            ayatTiming={segmentsWithText.length > 0 ? segmentsWithText : textSegments}
                            currentTime={
                              isPracticeMode
                                ? practiceTime
                                : isPlaying && refWaveSurfer.current?.isPlaying()
                                ? playbackTime || 0
                                : 0
                            }
                            duration={referenceDuration}
                            onSeek={(time) => {
                              // Seek reference audio to the clicked segment
                              if (
                                refWaveSurfer.current &&
                                referenceDuration > 0
                              ) {
                                refWaveSurfer.current.seekTo(
                                  time / referenceDuration
                                );
                                if (!isPlaying && !isPracticeMode) {
                                  refWaveSurfer.current.play();
                                }
                              }
                            }}
                          />
                        </div>
                      ) : null;
                    })()}

                    <div className='mt-3 text-xs text-slate-500 text-center'>
                      <span className='inline-flex items-center gap-1 mr-4'>
                        <span className='w-3 h-3 bg-emerald-500 rounded-full'></span>
                        Reference (Green) - Static
                      </span>
                    </div>
                    {isPracticeMode && (
                      <div className='mt-2 text-xs text-center text-slate-400'>
                        Practice time: {practiceTime.toFixed(1)}s /{" "}
                        {referenceDuration.toFixed(1)}s
                      </div>
                    )}
                    {practiceError && (
                      <div className='mt-3 p-3 bg-red-50 border border-red-200 rounded-lg'>
                        <p className='text-xs text-red-700'>{practiceError}</p>
                        <button
                          onClick={() => setPracticeError(null)}
                          className='mt-2 text-xs text-red-600 hover:text-red-800 underline'
                        >
                          Dismiss
                        </button>
                      </div>
                    )}


                    {/* Practice Audio Playback */}
                    {practiceAudioUrl &&
                      practiceAudioBlob &&
                      !isPracticeMode && (
                        <div className='mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200'>
                          <div className='flex items-center justify-between mb-3'>
                            <h4 className='text-sm font-semibold text-slate-700 flex items-center gap-2'>
                              <Music size={16} className='text-emerald-600' />
                              Practice Playback
                            </h4>
                            <button
                              onClick={() => {
                                if (practiceAudioUrl) {
                                  URL.revokeObjectURL(practiceAudioUrl);
                                  setPracticeAudioUrl(null);
                                }
                                setPracticeAudioBlob(null);
                                practiceAudioChunksRef.current = [];
                              }}
                              className='p-1 rounded hover:bg-slate-200 transition-colors'
                              title='Clear practice audio'
                            >
                              <X size={14} className='text-slate-500' />
                            </button>
                          </div>
                          <audio
                            ref={practiceAudioRef}
                            src={practiceAudioUrl}
                            controls
                            className='w-full'
                            style={{ height: "40px" }}
                            preload='auto'
                          />
                          <p className='mt-2 text-xs text-slate-500'>
                            Listen to your practice session to review your
                            recitation
                          </p>
                        </div>
                      )}
                  </div>
                  )}

                  {/* Audio controls for reference */}
                  <div className='flex flex-col sm:flex-row justify-center items-center gap-4 mt-8 flex-wrap overflow-x-auto min-w-0 max-w-full'>
                    {/* Reference Audio Playback Speed Control - stack vertically on narrow screens to avoid truncation */}
                    <div className='flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 flex-shrink-0 w-full sm:w-auto'>
                      <label className='text-xs sm:text-sm font-medium text-slate-600 whitespace-normal sm:whitespace-nowrap flex-shrink-0'>
                        Reference Speed:
                      </label>
                      <div className='flex flex-wrap items-center gap-1'>
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                          <button
                            key={speed}
                            onClick={() => {
                              setPlaybackSpeed(speed);
                              if (
                                refWaveSurfer.current &&
                                !refWaveSurfer.current.isDestroyed
                              ) {
                                refWaveSurfer.current.setPlaybackRate(speed);
                              }
                              // Only update reference audio speed
                              // Student audio has its own speed control
                            }}
                            className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                              playbackSpeed === speed
                                ? "bg-emerald-600 text-white shadow-sm scale-105"
                                : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400"
                            }`}
                            title={`Set playback speed to ${speed}x`}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Control Buttons */}
                    <div className='grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3 w-full sm:w-auto'>
                      <button
                        onClick={handleRefPlay}
                        className='w-full sm:w-auto flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] sm:min-w-[100px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-[11px] sm:text-sm transition-all hover:scale-105 whitespace-nowrap'
                      >
                        {isPlaying ? (
                          <Pause size={16} className='flex-shrink-0' />
                        ) : (
                          <Play size={16} fill='currentColor' className='flex-shrink-0' />
                        )}
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <button
                        onClick={handleRefStop}
                        className='w-full sm:w-auto flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] sm:min-w-[100px] bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-[11px] sm:text-sm transition-all hover:scale-105 whitespace-nowrap'
                      >
                        <Square size={16} className='flex-shrink-0' />
                        Stop
                      </button>
                      <button
                        onClick={handleRefRestart}
                        className='w-full sm:w-auto flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] sm:min-w-[100px] bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-[11px] sm:text-sm transition-all hover:scale-105 whitespace-nowrap'
                      >
                        <RefreshCw size={16} className='flex-shrink-0' />
                        <span className='sm:hidden'>Reset</span>
                        <span className='hidden sm:inline'>Restart</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <Waveform
                  url={
                    isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
                      ? uploadedRefUrl
                      : (selectedRef?.url || "")
                  }
                  height={120}
                  waveColor='#94a3b8'
                  progressColor={APP_COLORS.primary}
                  onReady={(ws) => {
                    refWaveSurfer.current = ws;

                    // Set initial playback speed
                    ws.setPlaybackRate(playbackSpeed);

                    // Track playback state and time for LivePitchGraph
                    let animationFrameId: number | null = null;

                    const updatePlaybackTime = () => {
                      if (ws && !ws.isDestroyed && ws.isPlaying()) {
                        setPlaybackTime(ws.getCurrentTime());
                        animationFrameId =
                          requestAnimationFrame(updatePlaybackTime);
                      } else {
                        animationFrameId = null;
                      }
                    };

                    ws.on("play", () => {
                      setIsPlaying(true);
                      if (!animationFrameId) {
                        updatePlaybackTime();
                      }
                    });

                    ws.on("pause", () => {
                      setIsPlaying(false);
                      if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                        animationFrameId = null;
                      }
                    });

                    ws.on("finish", () => {
                      setIsPlaying(false);
                      setPlaybackTime(0);
                      if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                        animationFrameId = null;
                      }
                    });
                  }}
                  showControls={true}
                  title='Reference Audio'
                  interact={true}
                  onSeek={handleReferenceSeek}
                  syncProgress={syncProgress}
                  isSyncing={isSyncingRef}
                />
              )}
            </div>
          </div>

          {/* Student Audio Section */}
            <div className='bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-semibold text-blue-700 flex items-center gap-2'>
                <span className='flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg'>
                  <div className='w-2 h-2 bg-blue-600 rounded-full animate-pulse'></div>
                </span>
                Your Recitation
              </h2>
              {studentBlob && (
                <button
                  onClick={() => {
                    setStudentBlob(null);
                    setAnalysisResult(null);
                  }}
                  className='text-xs font-medium text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-red-50'
                >
                  <RefreshCw size={12} /> Retake
                </button>
              )}
            </div>

            {/* Pitch Graph - Show live during recording, preserved after recording, analysis result after analysis */}
            {/* MOVED BEFORE the recording section so it shows during AND after recording */}
            {(() => {
              // Don't show graph if extracting (old graph from previous file)
              if (isExtractingRefPitch ||
                  (pitchDataRefIdRef.current !== undefined &&
                   pitchDataRefIdRef.current !== selectedRef?.id)) {
                return (
                  <div className='mb-4'>
                    <div className='mb-2'>
                      <h3 className='text-sm font-semibold text-slate-700 mb-2'>
                        Pitch Comparison Graph
                      </h3>
                    </div>
                    <div className='bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner'>
                      <div className='text-center py-12 text-slate-500'>
                        <p className='mb-2 text-lg font-medium'>Extracting reference pitch...</p>
                        {selectedRef?.title && (
                          <p className='mb-4 text-sm text-slate-600 font-medium'>
                            {selectedRef.title}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              const hasRefPitch =
                referencePitchData.length > 0 ||
                (analysisResult?.pitchData?.reference &&
                  analysisResult.pitchData.reference.length > 0);
              const hasStudentPitch =
                recordingPitchData.length > 0 || // During/after recording
                followModePitchData.length > 0 || // During/after follow mode
                (analysisResult?.pitchData?.student &&
                  analysisResult.pitchData.student.length > 0); // After analysis
              // Recording/scoring graph only: hide during practice mode.
              const shouldShow =
                !isPracticeMode && (hasRefPitch || hasStudentPitch || isRecording);

              console.log("📈 Pitch graph render check (Test Mode):", {
                hasRefPitch,
                hasStudentPitch,
                isRecording,
                shouldShow,
                recordingPitchLength: recordingPitchData.length,
                practicePitchLength: studentPitchData.length,
                refPitchLength: referencePitchData.length,
                refPitchFirstPoint: referencePitchData[0],
                refPitchLastPoint:
                  referencePitchData[referencePitchData.length - 1],
                analysisRefLength:
                  analysisResult?.pitchData?.reference?.length || 0,
                analysisStudentLength:
                  analysisResult?.pitchData?.student?.length || 0,
              });

              return shouldShow;
            })() && (
              <div className='mb-4'>
                <div className='mb-2 flex items-center justify-between gap-2'>
                  <h3 className='text-sm font-semibold text-slate-700 mb-2'>
                    Pitch Comparison Graph
                  </h3>
                  <div className='flex items-center gap-2'>
                    <button
                      onClick={clearRecordingGraph}
                      className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-red-600 bg-red-50 border border-red-200 hover:bg-red-100'
                      title='Clear student (red) graph'
                    >
                      <X size={14} />
                      Delete Graph
                    </button>
                    <button
                      onClick={() => {
                        setIsRecordingFullScreenOpen(true);
                      }}
                      className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100'
                      title='Open recording graph in full-screen mode'
                    >
                      <Maximize2 size={14} />
                      Full Screen
                    </button>
                  </div>
                </div>
                <CombinedWaveformPitch
                  key={`test-graph-${selectedRef?.id || 'no-ref'}`}
                  referencePitch={
                    // Show reference pitch for comparison
                    analysisResult?.pitchData?.reference &&
                    analysisResult.pitchData.reference.length > 0
                      ? analysisResult.pitchData.reference.map((p: any) => ({
                          time: p.time || 0,
                          f_hz: p.f_hz || null,
                          midi: p.midi || null,
                          confidence: p.confidence || 0.9,
                        }))
                      : referencePitchData.length > 0
                      ? referencePitchData
                      : [] // Empty array if no reference pitch available
                  }
                  referenceAudioUrl={
                    isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
                      ? uploadedRefUrl
                      : (selectedRef?.url || "")
                  }
                  studentAudioUrl={practiceAudioUrl}
                  studentAudioBlob={
                    // Use practiceAudioBlob when available (practice mode or after practice)
                    // Otherwise use studentBlob (from regular recording/test mode)
                    practiceAudioBlob || studentBlob
                  }
                  onSeek={(progress) => {
                    if (refWaveSurfer.current && !refWaveSurfer.current.isDestroyed && referenceDuration > 0) {
                      try {
                        refWaveSurfer.current.seekTo(progress);
                      } catch (error) {
                        console.warn('Error seeking audio:', error);
                      }
                    }
                  }}
                  studentPitch={
                    // Recording/scoring only (practice stays in the Reference Pitch graph above).
                    isRecording
                      ? recordingPitchData
                      : recordingPitchData && recordingPitchData.length > 0
                      ? recordingPitchData
                      : followModePitchData.length > 0
                      ? followModePitchData
                      : [] // No student pitch available yet
                  }
                  isRecording={isRecording || isFollowingReference}
                  isPlaying={false} // Never play audio during recording (unlike practice mode)
                  currentTime={
                    isRecording
                      ? recordingTime // During recording, use recording time - flows like practice mode
                      : isFollowingReference &&
                        refWaveSurfer.current?.isPlaying()
                      ? playbackTime || 0 // Use reference audio playback time during follow mode
                      : isPlaying &&
                        !isPracticeMode &&
                        studentWaveSurfer.current?.isPlaying()
                      ? playbackTime || 0 // After recording, use playback time if student audio is playing
                      : 0 // No cursor when not playing
                  }
                  referenceDuration={
                    referenceDuration > 0
                      ? referenceDuration
                      : analysisResult?.pitchData?.reference &&
                        analysisResult.pitchData.reference.length > 0
                      ? Math.max(
                          ...analysisResult.pitchData.reference.map(
                            (p: any) => p.time || 0
                          )
                        )
                      : recordingPitchData.length > 0
                      ? Math.max(...recordingPitchData.map((p) => p.time))
                      : analysisResult?.pitchData?.student &&
                        analysisResult.pitchData.student.length > 0
                      ? Math.max(
                          ...analysisResult.pitchData.student.map(
                            (p: any) => p.time || 0
                          )
                        )
                      : 0
                  }
                  height={pitchGraphHeight}
                  markers={analysisResult?.pitchData?.markers || []}
                  onMarkerClick={(time) => {
                    // Seek student audio to marker time
                    if (studentWaveSurfer.current && referenceDuration > 0) {
                      studentWaveSurfer.current.seekTo(
                        time / referenceDuration
                      );
                      if (!isPlaying) {
                        studentWaveSurfer.current.play();
                      }
                    }
                  }}
                />
                <div className='mt-3 text-xs text-slate-500 text-center'>
                  {((analysisResult?.pitchData?.reference &&
                    analysisResult.pitchData.reference.length > 0) ||
                    referencePitchData.length > 0) && (
                    <span className='inline-flex items-center gap-1 mr-4'>
                      <span className='w-3 h-3 bg-emerald-500 rounded-full'></span>
                      Reference (Green)
                      {isRecording && (
                        <span className='text-xs text-emerald-600 ml-1 font-medium'>
                          - Follow this pitch contour
                        </span>
                      )}
                    </span>
                  )}
                  {(recordingPitchData.length > 0 ||
                    (analysisResult?.pitchData?.student &&
                      analysisResult.pitchData.student.length > 0) ||
                    isRecording) && (
                    <span className='inline-flex items-center gap-1'>
                      <span className='w-3 h-3 bg-red-500 rounded-full'></span>
                      Your Recitation (Red)
                      {isRecording && (
                        <span className='text-xs text-red-600 ml-1 font-medium'>
                          (Live - Follow the green line)
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!studentBlob ? (
              <div className='bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner'>
                <Recorder
                  isRecording={isRecording}
                  setIsRecording={setIsRecording}
                  onRecordingComplete={handleRecordingComplete}
                  onPitchUpdate={handleRecordingPitchUpdate}
                  onRecordingStart={handleRecordingStart}
                  onError={(message) => setAlertModal({ isOpen: true, title: 'Recording Error', message, variant: 'error' })}
                  recordingPitchData={recordingPitchData}
                  referencePitchData={referencePitchData}
                  referenceDuration={referenceDuration}
                  viewMode='pitch'
                  triggerRecordingStart={triggerRecordingStart}
                  triggerRecordingStop={triggerRecordingStop}
                />
              </div>
            ) : (
              <div className='bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner'>
                {/* Hidden Waveform to load audio for playback controls */}
                <div className='hidden'>
                  <Waveform
                    blob={studentBlob}
                    height={1}
                    waveColor='#94a3b8'
                    progressColor='#3b82f6'
                    onReady={(ws) => {
                      studentWaveSurfer.current = ws;

                      // Set initial playback speed for student audio
                      ws.setPlaybackRate(studentPlaybackSpeed);

                      // Track playback state and time for LivePitchGraph
                      let animationFrameId: number | null = null;

                      const updatePlaybackTime = () => {
                        if (ws && !ws.isDestroyed && ws.isPlaying()) {
                          setPlaybackTime(ws.getCurrentTime());
                          animationFrameId =
                            requestAnimationFrame(updatePlaybackTime);
                        } else {
                          animationFrameId = null;
                        }
                      };

                      ws.on("play", () => {
                        // Only set isPlaying for test mode (not practice mode)
                        if (!isPracticeMode) {
                          setIsPlaying(true);
                        }
                        if (!animationFrameId) {
                          updatePlaybackTime();
                        }
                      });

                      ws.on("pause", () => {
                        // Only set isPlaying for test mode (not practice mode)
                        if (!isPracticeMode) {
                          setIsPlaying(false);
                        }
                        if (animationFrameId) {
                          cancelAnimationFrame(animationFrameId);
                          animationFrameId = null;
                        }
                      });

                      ws.on("finish", () => {
                        // Only set isPlaying for test mode (not practice mode)
                        if (!isPracticeMode) {
                          setIsPlaying(false);
                        }
                        setPlaybackTime(0);
                        if (animationFrameId) {
                          cancelAnimationFrame(animationFrameId);
                          animationFrameId = null;
                        }
                      });
                    }}
                    showControls={false}
                    title=''
                    interact={false}
                  />
                </div>

                {/* Audio Playback Controls */}
                <div className='grid grid-cols-3 gap-2 sm:flex sm:justify-center sm:items-center sm:gap-3 mt-8 w-full'>
                  <button
                    onClick={async () => {
                      // Play reference audio and start real-time pitch extraction
                      if (refWaveSurfer.current) {
                        if (refWaveSurfer.current.isPlaying()) {
                          // Pause reference audio
                          refWaveSurfer.current.pause();
                          setIsPlaying(false);

                          // Stop follow mode pitch extraction
                          if (followModePitchExtractorRef.current) {
                            followModePitchExtractorRef.current.stop();
                            followModePitchExtractorRef.current = null;
                          }
                          if (followModeStreamRef.current) {
                            followModeStreamRef.current
                              .getTracks()
                              .forEach((track) => track.stop());
                            followModeStreamRef.current = null;
                          }
                          setIsFollowingReference(false);
                          followModeStartTimeRef.current = null;
                        } else {
                          // Start reference audio playback
                          refWaveSurfer.current.play();
                          setIsPlaying(true);

                          // Start real-time pitch extraction from microphone
                          try {
                            const stream =
                              await navigator.mediaDevices.getUserMedia({
                                audio: {
                                  echoCancellation: true,
                                  noiseSuppression: true,
                                  autoGainControl: true,
                                  sampleRate: 44100,
                                  channelCount: 1,
                                },
                              });

                            followModeStreamRef.current = stream;

                            // Clear previous follow mode data
                            setFollowModePitchData([]);

                            // Start follow mode
                            setIsFollowingReference(true);
                            followModeStartTimeRef.current = Date.now();

                            // Start pitch extraction
                            const extractor = new RealTimePitchExtractor();
                            followModePitchExtractorRef.current = extractor;
                            await extractor.startFromStream(
                              stream,
                              handleFollowModePitchUpdate,
                              LIVE_PITCH_FILTER_OPTIONS
                            );

                            console.log(
                              "[Follow Mode] ✅ Started real-time pitch extraction"
                            );

                            // Stop extraction when reference audio finishes
                            const finishHandler = () => {
                              if (followModePitchExtractorRef.current) {
                                followModePitchExtractorRef.current.stop();
                                followModePitchExtractorRef.current = null;
                              }
                              // Stop microphone stream
                              if (followModeStreamRef.current) {
                                followModeStreamRef.current
                                  .getTracks()
                                  .forEach((track) => track.stop());
                                followModeStreamRef.current = null;
                              }
                              setIsFollowingReference(false);
                              setIsPlaying(false);
                              console.log(
                                "[Follow Mode] ✅ Pitch extraction stopped, graph preserved"
                              );
                              // Remove listener to prevent multiple calls
                              if (refWaveSurfer.current) {
                                refWaveSurfer.current.un(
                                  "finish",
                                  finishHandler
                                );
                              }
                            };

                            if (refWaveSurfer.current) {
                              refWaveSurfer.current.on("finish", finishHandler);
                            }
                          } catch (error) {
                            console.error(
                              "[Follow Mode] ❌ Failed to start pitch extraction:",
                              error
                            );
                            setAlertModal({ isOpen: true, title: 'Microphone Error', message: "Failed to access microphone. Please check permissions.", variant: 'error' });
                            // Stop reference audio if mic access fails
                            if (refWaveSurfer.current) {
                              refWaveSurfer.current.pause();
                              setIsPlaying(false);
                            }
                          }
                        }
                      }
                    }}
                    className='flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-[11px] sm:text-sm transition-all whitespace-nowrap'
                  >
                    {refWaveSurfer.current?.isPlaying() ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} fill='currentColor' />
                    )}
                    {refWaveSurfer.current?.isPlaying() ? "Pause" : "Play"}
                  </button>
                  <button
                    onClick={() => {
                      // Stop reference audio
                      if (refWaveSurfer.current) {
                        refWaveSurfer.current.stop();
                        setIsPlaying(false);
                        setPlaybackTime(0);
                      }

                      // Stop follow mode pitch extraction (but keep the data)
                      if (followModePitchExtractorRef.current) {
                        followModePitchExtractorRef.current.stop();
                        followModePitchExtractorRef.current = null;
                      }
                      if (followModeStreamRef.current) {
                        followModeStreamRef.current
                          .getTracks()
                          .forEach((track) => track.stop());
                        followModeStreamRef.current = null;
                      }
                      setIsFollowingReference(false);
                      followModeStartTimeRef.current = null;

                      // Also stop student audio if playing
                      if (studentWaveSurfer.current) {
                        studentWaveSurfer.current.stop();
                      }

                      // Note: followModePitchData is preserved for graph display
                    }}
                    className='flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-[11px] sm:text-sm transition-all whitespace-nowrap'
                  >
                    <Square size={16} />
                    Stop
                  </button>
                  <button
                    onClick={async () => {
                      // Restart reference audio and clear follow mode data
                      if (refWaveSurfer.current) {
                        // Stop current playback and extraction
                        if (followModePitchExtractorRef.current) {
                          followModePitchExtractorRef.current.stop();
                          followModePitchExtractorRef.current = null;
                        }
                        if (followModeStreamRef.current) {
                          followModeStreamRef.current
                            .getTracks()
                            .forEach((track) => track.stop());
                          followModeStreamRef.current = null;
                        }
                        setIsFollowingReference(false);
                        followModeStartTimeRef.current = null;

                        // Clear follow mode data
                        setFollowModePitchData([]);

                        // Restart reference audio
                        refWaveSurfer.current.seekTo(0);
                        refWaveSurfer.current.play();
                        setIsPlaying(true);

                        // Start new follow mode pitch extraction
                        try {
                          const stream =
                            await navigator.mediaDevices.getUserMedia({
                              audio: {
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true,
                                sampleRate: 44100,
                                channelCount: 1,
                              },
                            });

                          followModeStreamRef.current = stream;
                          setIsFollowingReference(true);
                          followModeStartTimeRef.current = Date.now();

                          const extractor = new RealTimePitchExtractor();
                          followModePitchExtractorRef.current = extractor;
                          await extractor.startFromStream(
                            stream,
                            handleFollowModePitchUpdate,
                            LIVE_PITCH_FILTER_OPTIONS
                          );

                          console.log(
                            "[Follow Mode] ✅ Restarted real-time pitch extraction"
                          );

                          // Handle finish event
                          const finishHandler = () => {
                            if (followModePitchExtractorRef.current) {
                              followModePitchExtractorRef.current.stop();
                              followModePitchExtractorRef.current = null;
                            }
                            if (followModeStreamRef.current) {
                              followModeStreamRef.current
                                .getTracks()
                                .forEach((track) => track.stop());
                              followModeStreamRef.current = null;
                            }
                            setIsFollowingReference(false);
                            setIsPlaying(false);
                            if (refWaveSurfer.current) {
                              refWaveSurfer.current.un("finish", finishHandler);
                            }
                          };

                          if (refWaveSurfer.current) {
                            refWaveSurfer.current.on("finish", finishHandler);
                          }
                        } catch (error) {
                          console.error(
                            "[Follow Mode] ❌ Failed to start pitch extraction:",
                            error
                          );
                          setAlertModal({ isOpen: true, title: 'Microphone Error', message: "Failed to access microphone. Please check permissions.", variant: 'error' });
                        }
                      }

                      // Also restart student audio if it exists
                      if (studentWaveSurfer.current) {
                        studentWaveSurfer.current.seekTo(0);
                        studentWaveSurfer.current.play();
                      }
                    }}
                    className='flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-[11px] sm:text-sm transition-all whitespace-nowrap'
                  >
                    <RefreshCw size={16} />
                    <span className='sm:hidden'>Reset</span>
                    <span className='hidden sm:inline'>Restart</span>
                  </button>
                </div>

                {/* Student Audio Playback Speed Control */}
                <div className='flex justify-center items-center gap-4 mt-4 flex-wrap max-w-full'>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 w-full sm:w-auto max-w-full'>
                    <label className='text-sm font-medium text-slate-600 whitespace-normal sm:whitespace-nowrap'>
                      Your Recording Speed:
                    </label>
                    <div className='flex flex-wrap items-center gap-1 max-w-full overflow-x-auto'>
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => {
                            setStudentPlaybackSpeed(speed);
                            // Save to localStorage
                            localStorage.setItem(
                              "studentPlaybackSpeed",
                              speed.toString()
                            );
                            if (
                              studentWaveSurfer.current &&
                              !studentWaveSurfer.current.isDestroyed
                            ) {
                              studentWaveSurfer.current.setPlaybackRate(speed);
                            }
                          }}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                            studentPlaybackSpeed === speed
                              ? "bg-blue-600 text-white shadow-sm scale-105"
                              : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400"
                          }`}
                          title={`Set your recording playback speed to ${speed}x`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className='flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 mt-5 sm:mt-6 items-stretch sm:items-center'>
                  <button
                    onClick={handleSyncPlay}
                    className='w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95'
                  >
                    <Play size={18} fill='currentColor' /> Play Both
                  </button>
                  <button
                    onClick={handleStopAll}
                    className='w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium shadow-sm transition-all'
                  >
                    <Pause size={18} fill='currentColor' /> Stop
                  </button>
                  {!analysisResult && (
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className='w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100'
                    >
                      {isAnalyzing ? (
                        "Analyzing..."
                      ) : (
                        <>
                          {" "}
                          <BarChart2 size={18} /> Score Mimic{" "}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className='lg:col-span-4 space-y-4 sm:space-y-6 min-w-0'>
          {/* Progress Tracking Card */}
          {progressData && progressData.totalAttempts > 0 && (
            <div className='bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100'>
              <h3 className='font-semibold text-slate-700 mb-4 flex items-center gap-2'>
                <TrendingUp size={18} className='text-blue-600' />
                Progress Tracking
              </h3>
              <div className='grid grid-cols-2 gap-4'>
                <div className='bg-emerald-50 p-4 rounded-lg border border-emerald-200'>
                  <div className='text-2xl font-bold text-emerald-600'>
                    {progressData.bestScore.toFixed(1)}%
                  </div>
                  <div className='text-xs text-slate-600 mt-1'>Best Score</div>
                </div>
                <div className='bg-blue-50 p-4 rounded-lg border border-blue-200'>
                  <div className='text-2xl font-bold text-blue-600'>
                    {progressData.averageScore.toFixed(1)}%
                  </div>
                  <div className='text-xs text-slate-600 mt-1'>Average</div>
                </div>
                <div className='bg-purple-50 p-4 rounded-lg border border-purple-200'>
                  <div className='text-2xl font-bold text-purple-600'>
                    {progressData.totalAttempts}
                  </div>
                  <div className='text-xs text-slate-600 mt-1'>Attempts</div>
                </div>
                <div
                  className={`p-4 rounded-lg border ${
                    progressData.improvement >= 0
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div
                    className={`text-2xl font-bold ${
                      progressData.improvement >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {progressData.improvement >= 0 ? "+" : ""}
                    {progressData.improvement.toFixed(1)}%
                  </div>
                  <div className='text-xs text-slate-600 mt-1'>Improvement</div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Result Card */}
          {analysisResult ? (
            <div className='bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-emerald-100 h-full flex flex-col animate-fade-in relative overflow-hidden'>
              <div className='absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-blue-500'></div>
              <h3 className='text-xl font-bold text-slate-800 mb-6 flex items-center gap-2'>
                <CheckCircle className='text-emerald-500' />
                Analysis Result
              </h3>

              <div className='flex flex-col items-center justify-center mb-8 relative'>
                <div className='relative w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48'>
                  <svg
                    className='w-full h-full transform -rotate-90'
                    viewBox='0 0 36 36'
                  >
                    <path
                      d='M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831'
                      fill='none'
                      stroke='#f1f5f9'
                      strokeWidth='2'
                    />
                    <path
                      d='M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831'
                      fill='none'
                      stroke={
                        analysisResult.score > 80
                          ? "#10b981"
                          : analysisResult.score > 60
                          ? "#f59e0b"
                          : "#ef4444"
                      }
                      strokeWidth='2'
                      strokeDasharray={`${analysisResult.score}, 100`}
                      className='animate-[dash_1.5s_ease-in-out]'
                      strokeLinecap='round'
                    />
                  </svg>
                  <div className='absolute top-0 left-0 w-full h-full flex items-center justify-center'>
                    <span
                      className={`text-5xl font-bold ${
                        analysisResult.score > 80
                          ? "text-emerald-600"
                          : analysisResult.score > 60
                          ? "text-amber-500"
                          : "text-red-500"
                      }`}
                    >
                      {formatScoreWithPercent(
                        analysisResult.normalizedScore ?? analysisResult.score
                      )}
                    </span>
                  </div>
                </div>
                {/* Label and info icons - positioned below circle */}
                <div className='flex flex-col items-center gap-1.5 mt-4'>
                  <div className='flex items-center justify-center gap-2'>
                    <span className='text-xs text-slate-400 uppercase tracking-wide font-semibold'>
                      Similarity Score
                    </span>
                    <div className='group relative'>
                      <Info
                        size={14}
                        className='text-slate-400 hover:text-slate-600 cursor-help transition-colors'
                        aria-label='Scoring explanation'
                      />
                      <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-max max-w-[min(16rem,90vw)] bg-slate-800 text-white text-xs rounded-lg p-3 z-20 shadow-xl pointer-events-none'>
                        <div className='font-semibold mb-1.5 text-white'>
                          How your score is calculated
                        </div>
                        <p className='text-slate-200 leading-relaxed'>
                          Your score is based on:
                        </p>
                        <ul className='mt-1.5 space-y-1 text-slate-200 list-disc list-inside'>
                          <li>Pitch accuracy</li>
                          <li>Pitch stability</li>
                          <li>Timing alignment</li>
                          <li>Continuity</li>
                        </ul>
                        <p className='mt-2 pt-2 border-t border-slate-700 text-slate-300 italic text-[10px]'>
                          Each segment is normalized to a 0–100% scale. All scores are shown as 0–100%.
                        </p>
                        <div className='absolute top-full left-1/2 transform -translate-x-1/2 -mt-1'>
                          <div className='w-2 h-2 bg-slate-800 rotate-45'></div>
                        </div>
                      </div>
                    </div>
                    <ScoreExplanation
                      score={analysisResult.score}
                      breakdown={
                        analysisResult.scoreBreakdown
                          ? {
                              pitch: analysisResult.scoreBreakdown.pitch,
                              timing: analysisResult.scoreBreakdown.timing,
                              pronunciation:
                                analysisResult.scoreBreakdown.pronunciation,
                              overall: analysisResult.score,
                            }
                          : undefined
                      }
                    />
                  </div>
                  <div className='text-[10px] text-slate-500 text-center max-w-[220px] leading-tight'>
                    Measures pitch, rhythm, and pronunciation similarity
                  </div>
                </div>
              </div>

              <div className='space-y-6 flex-grow'>
                <div className='bg-slate-50 p-4 rounded-xl border border-slate-200'>
                  <h4 className='text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider'>
                    Performance Feedback
                  </h4>

                  {/* Step 3: Display structured training feedback */}
                  {typeof analysisResult.feedback === "object" &&
                  "label" in analysisResult.feedback ? (
                    <div className='space-y-4'>
                      {/* Main label and message */}
                      <div>
                        <div className='flex items-center gap-2 mb-2'>
                          <CheckCircle
                            className={`w-5 h-5 ${
                              analysisResult.feedback.category === "excellent"
                                ? "text-green-600"
                                : analysisResult.feedback.category === "good"
                                ? "text-blue-600"
                                : analysisResult.feedback.category ===
                                  "developing"
                                ? "text-yellow-600"
                                : "text-slate-600"
                            }`}
                          />
                          <h5 className='font-semibold text-lg text-slate-800'>
                            {analysisResult.feedback.label}
                          </h5>
                        </div>
                        <p className='text-sm text-slate-700 leading-relaxed'>
                          {analysisResult.feedback.message}
                        </p>
                      </div>

                      {/* Strengths */}
                      {analysisResult.feedback.strengths &&
                        analysisResult.feedback.strengths.length > 0 && (
                          <div>
                            <h6 className='text-xs font-semibold text-green-700 uppercase mb-2'>
                              What's Working Well
                            </h6>
                            <ul className='list-disc list-inside space-y-1 text-sm text-slate-600 ml-2'>
                              {analysisResult.feedback.strengths.map(
                                (strength, idx) => (
                                  <li key={idx}>{strength}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {/* Focus Areas */}
                      {analysisResult.feedback.focus_areas &&
                        analysisResult.feedback.focus_areas.length > 0 && (
                          <div>
                            <h6 className='text-xs font-semibold text-blue-700 uppercase mb-2'>
                              Areas to Focus On
                            </h6>
                            <ul className='list-disc list-inside space-y-1 text-sm text-slate-600 ml-2'>
                              {analysisResult.feedback.focus_areas.map(
                                (area, idx) => (
                                  <li key={idx}>{area}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {/* Segment Feedback (if available) */}
                      {analysisResult.feedback.segment_feedback &&
                        analysisResult.feedback.segment_feedback.length > 0 && (
                          <div className='pt-2 border-t border-slate-200'>
                            <h6 className='text-xs font-semibold text-slate-600 uppercase mb-2'>
                              Segment Feedback
                            </h6>
                            <div className='space-y-2'>
                              {analysisResult.feedback.segment_feedback.map(
                                (segFb, idx) => {
                                  // Find the corresponding segment from segment breakdown
                                  const correspondingSegment =
                                    analysisResult.segments[
                                      segFb.segment_index
                                    ];

                                  // Use segment breakdown score if available, otherwise fallback to segment feedback score
                                  let segmentScore = segFb.score;
                                  if (
                                    correspondingSegment &&
                                    correspondingSegment.score !== undefined &&
                                    correspondingSegment.score !== null
                                  ) {
                                    segmentScore = correspondingSegment.score;
                                  }
                                  const scoreDisplay = formatSegmentScore(segmentScore);

                                  return (
                                    <div
                                      key={idx}
                                      className='text-xs text-slate-600 bg-slate-100 p-2 rounded'
                                    >
                                      <span className='font-medium'>
                                        Segment {segFb.segment_index + 1}:
                                      </span>{" "}
                                      <span className='text-slate-700'>
                                        {segFb.label}
                                      </span>{" "}
                                      - {segFb.message}
                                      <span className='text-slate-500 ml-1'>
                                        ({scoreDisplay}%)
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}

                      {/* Pronunciation Alerts (Beta) */}
                      {analysisResult.pronunciationAlerts &&
                        analysisResult.pronunciationAlerts.length > 0 && (
                          <PronunciationAlerts
                            alerts={analysisResult.pronunciationAlerts}
                            onSeekToTime={(time) => {
                              if (
                                refWaveSurfer.current &&
                                referenceDuration > 0
                              ) {
                                refWaveSurfer.current.seekTo(
                                  time / referenceDuration
                                );
                                if (!isPlaying) {
                                  refWaveSurfer.current.play();
                                }
                              }
                              if (
                                studentWaveSurfer.current &&
                                referenceDuration > 0
                              ) {
                                studentWaveSurfer.current.seekTo(
                                  time / referenceDuration
                                );
                              }
                              setPlaybackTime(time);
                            }}
                            duration={referenceDuration}
                          />
                        )}
                    </div>
                  ) : (
                    // Legacy string feedback (fallback)
                    <p className='text-sm text-slate-700 leading-relaxed'>
                      "
                      {typeof analysisResult.feedback === "string"
                        ? analysisResult.feedback
                        : "Analysis complete"}
                      "
                    </p>
                  )}
                </div>

                <div>
                  {analysisResult.segments.length > 0 && (
                    <>
                      <h4 className='text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider'>
                        Segment Breakdown
                      </h4>
                      <div className='space-y-3'>
                        {analysisResult.segments.map((seg, idx) => {
                          // Prefer normalized (0-100) from backend; fallback to score
                          let score =
                            seg.normalized !== undefined && seg.normalized !== null
                              ? seg.normalized
                              : seg.score !== undefined && seg.score !== null
                              ? seg.score
                              : analysisResult.score || 0;

                          // Ensure score is valid (but preserve very small positive numbers)
                          if (
                            score === null ||
                            score === undefined ||
                            isNaN(score) ||
                            !isFinite(score)
                          ) {
                            score = 0;
                          }

                          // Don't convert very small positive numbers to 0 - they're valid scores
                          // Only set to 0 if it's actually 0, null, undefined, NaN, or negative

                          // Clamp to valid range (segment scores capped at 100%)
                          const normalizedScore = Math.max(
                            0,
                            Math.min(100, score)
                          );
                          const scoreDisplay = formatSegmentScore(score);

                          // For progress bar, use normalized score but ensure minimum visibility
                          const barWidth =
                            normalizedScore < 0.01 && normalizedScore > 0
                              ? 0.5
                              : normalizedScore;

                          return (
                            <div
                              key={idx}
                              className='flex items-center text-sm'
                            >
                              <span className='w-24 text-slate-500 text-xs font-mono'>
                                {formatSegmentRange(seg)}
                              </span>
                              <div className='flex-1 h-2.5 bg-slate-100 rounded-full mx-3 overflow-hidden'>
                                <div
                                  className={`h-full rounded-full shadow-sm transition-all ${
                                    seg.accuracy === "high"
                                      ? "bg-emerald-500"
                                      : seg.accuracy === "medium"
                                      ? "bg-amber-400"
                                      : "bg-red-400"
                                  }`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span
                                className={`w-20 text-right font-medium text-xs ${
                                  seg.accuracy === "high"
                                    ? "text-emerald-600"
                                    : seg.accuracy === "medium"
                                    ? "text-amber-600"
                                    : "text-red-500"
                                }`}
                              >
                                {scoreDisplay}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Adaptive Learning - Segment Practice */}
              {analysisResult.segments.length > 0 && (
                <div className='mt-6 pt-6 border-t border-slate-200'>
                  <SegmentPractice
                    referenceUrl={
                      isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
                        ? uploadedRefUrl
                        : (selectedRef?.url || "")
                    }
                    studentBlob={studentBlob!}
                    segments={analysisResult.segments.map((s) => ({
                      start: s.start,
                      end: s.end,
                      score: s.score || analysisResult.score,
                      accuracy: s.accuracy,
                    }))}
                    onSegmentComplete={(idx) => {
                      console.log(`Completed practice for segment ${idx + 1}`);
                    }}
                  />
                </div>
              )}

              <button
                onClick={() => {
                  setStudentBlob(null);
                  setAnalysisResult(null);
                  setIsRecording(false);
                }}
                className='mt-8 w-full py-3.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-lg shadow-slate-900/10 active:scale-95'
              >
                Start New Session
              </button>
            </div>
          ) : (
            <div className='bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col justify-center items-center text-center text-slate-400 border-dashed border-2'>
              <div className='w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 animate-pulse'>
                <BarChart2 className='w-10 h-10 text-slate-300' />
              </div>
              <h4 className='text-lg font-semibold text-slate-600 mb-2'>
                Ready to Score
              </h4>
              <p className='text-sm max-w-[200px] leading-relaxed'>
                Record your voice mimicking the reference, then click "Score
                Mimic" to analyze pitch, stress, and rhythm.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Practice Full-Screen Mode (from top/reference practice graph) */}
      <PracticeFullScreenMode
        isOpen={isPracticeFullScreenOpen}
        onClose={() => setIsPracticeFullScreenOpen(false)}
        referencePitch={
          // In test mode, prefer analysisResult pitch (from backend scoring)
          // This ensures fullscreen test graph uses the same reference as scoring
          analysisResult?.pitchData?.reference &&
          analysisResult.pitchData.reference.length > 0
            ? analysisResult.pitchData.reference.map((p: any) => ({
                time: p.time || 0,
                f_hz: p.f_hz || null,
                midi: p.midi || null,
                confidence: p.confidence || 0.9,
              }))
            : referencePitchData
        }
        studentPitch={
          isPracticeMode
            ? studentPitchData // Practice: live pitch from real-time extractor
            : isRecording
            ? recordingPitchData
            : recordingPitchData.length > 0
            ? recordingPitchData // Show live recording data during/after recording
            : // After practice stops, preserve practice data so graph remains visible
            studentPitchData && studentPitchData.length > 0
            ? studentPitchData
            : followModePitchData.length > 0
            ? followModePitchData
            : [] // No student pitch available yet
        }
        isRecording={isPracticeMode || isRecording}
        isPlaying={isPlaying}
        currentTime={
          isPracticeMode
            ? practiceTime
            : isRecording
            ? recordingTime
            : playbackTime || 0
        }
        referenceDuration={referenceDuration}
        onPlay={handleFullScreenPlay}
        onPause={handleFullScreenPause}
        onStop={handleFullScreenStop}
        onRestart={handleFullScreenRestart}
        isPracticeMode={isPracticeMode}
        onPracticeStart={handlePracticeStart}
        onPracticeStop={handlePracticeStop}
        onPracticeRestart={handlePracticeStart}
        practiceTime={practiceTime}
        practiceAttempts={progressData?.totalAttempts || 0}
        isRecordingSession={isRecording}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        practiceAudioUrl={practiceAudioUrl}
        isPlayingPracticeAudio={isPlayingPracticeAudio}
        practiceAudioTime={practiceAudioTime}
        practiceAudioDuration={practiceAudioDuration}
        onPlayPracticeAudio={handlePlayPracticeAudio}
        onPausePracticeAudio={handlePausePracticeAudio}
        onStopPracticeAudio={handleStopPracticeAudio}
        ayatTiming={
          // Only show text if it's a preset (not from analysis result for custom uploads)
          selectedRef?.is_preset && referenceAyahTiming.length > 0
            ? referenceAyahTiming
            : []
        }
        onSeekToTime={handleFullScreenSeekToTime}
        markers={analysisResult?.pitchData?.markers || []}
        referenceUrl={
          isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
            ? uploadedRefUrl
            : (selectedRef?.url || "")
        }
        studentBlob={studentBlob}
        zoomLevel={fullScreenZoomLevel}
        onZoomChange={setFullScreenZoomLevel}
      />

      {/* Recording Full-Screen Mode (from bottom/comparison graph) */}
      <RecordingFullScreenMode
        isOpen={isRecordingFullScreenOpen}
        onClose={() => setIsRecordingFullScreenOpen(false)}
        referencePitch={
          analysisResult?.pitchData?.reference &&
          analysisResult.pitchData.reference.length > 0
            ? analysisResult.pitchData.reference.map((p: any) => ({
                time: p.time || 0,
                f_hz: p.f_hz || null,
                midi: p.midi || null,
                confidence: p.confidence || 0.9,
              }))
            : referencePitchData
        }
        studentPitch={
          isRecording
            ? recordingPitchData
            : recordingPitchData.length > 0
            ? recordingPitchData
            : followModePitchData.length > 0
            ? followModePitchData
            : []
        }
        isRecording={isRecording}
        isPlaying={isPlaying}
        currentTime={
          isRecording
            ? recordingTime
            : playbackTime || 0
        }
        referenceDuration={referenceDuration}
        onPlay={handleFullScreenPlay}
        onPause={handleFullScreenPause}
        onStop={handleFullScreenStop}
        onRestart={handleFullScreenRestart}
        isPracticeMode={isPracticeMode}
        onPracticeStart={handlePracticeStart}
        onPracticeStop={handlePracticeStop}
        onPracticeRestart={handlePracticeStart}
        practiceTime={practiceTime}
        practiceAttempts={progressData?.totalAttempts || 0}
        isRecordingSession={isRecording}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        practiceAudioUrl={practiceAudioUrl}
        isPlayingPracticeAudio={isPlayingPracticeAudio}
        practiceAudioTime={practiceAudioTime}
        practiceAudioDuration={practiceAudioDuration}
        onPlayPracticeAudio={handlePlayPracticeAudio}
        onPausePracticeAudio={handlePausePracticeAudio}
        onStopPracticeAudio={handleStopPracticeAudio}
        ayatTiming={
          selectedRef?.is_preset && referenceAyahTiming.length > 0
            ? referenceAyahTiming
            : []
        }
        onSeekToTime={handleFullScreenSeekToTime}
        markers={analysisResult?.pitchData?.markers || []}
        referenceUrl={
          isCustomUploadRefId(selectedRef?.id) && uploadedRefUrl
            ? uploadedRefUrl
            : (selectedRef?.url || "")
        }
        studentBlob={studentBlob}
        zoomLevel={fullScreenZoomLevel}
        onZoomChange={setFullScreenZoomLevel}
      />

      {/* Countdown Overlay - Shows before practice mode starts */}
      <Countdown
        isActive={showCountdown}
        onComplete={() => {
          setShowCountdown(false);
          handlePracticeStart();
        }}
        onCancel={() => {
          setShowCountdown(false);
        }}
        duration={5}
        showAudioCue={true}
      />

      {/* Countdown Overlay - Shows before recording starts */}
      <Countdown
        isActive={showRecordingCountdown}
        onComplete={() => {
          setShowRecordingCountdown(false);
          startRecordingAfterCountdown();
        }}
        onCancel={() => {
          setShowRecordingCountdown(false);
        }}
        duration={5}
        showAudioCue={true}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
        onClose={() => setAlertModal({ isOpen: false, title: '', message: '', variant: 'info' })}
      />
    </div>
  );
};

export default TrainingStudio;
