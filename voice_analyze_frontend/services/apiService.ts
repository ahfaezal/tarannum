import { AnalysisResult, AyahTiming, PitchDataResponse, PitchData, TrainingFeedback } from "../types";
import { getAuthHeader } from "./authService";

// Helper function to convert AudioBuffer to WAV Blob
const audioBufferToWav = (audioBuffer: AudioBuffer): Blob => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  // WAV header helper
  const writeString = (offset: number, string: string): void => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length, true);

  // Write audio data
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

// Helper function to convert Blob to WAV format
const convertBlobToWav = async (blob: Blob): Promise<Blob> => {
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to WAV
    const wavBlob = audioBufferToWav(audioBuffer);
    return wavBlob;
  } finally {
    await audioContext.close();
  }
};

export type ScoringCapacity = {
  active: number;
  waiting: number;
  limit: number;
};

export type ScoringJobProgress = {
  jobId: string;
  status: 'queued' | 'processing';
  stage?: string;
  queuePosition?: number | null;
};

export const getScoringCapacity = async (): Promise<ScoringCapacity> => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const response = await fetch(`${API_URL}/api/scoring/capacity`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(`Scoring capacity unavailable (${response.status})`);
  return response.json();
};

export const analyzeRecitation = async (
  studentBlob: Blob,
  referenceBlob: Blob | null,
  referenceTitle: string,
  referenceId?: string,
  metadata?: {
    clientSessionId?: string;
    recordingMode?: 'R1' | 'R2' | 'R3';
    scoringVersion?: 'V2.3';
    recordingAttempt?: number;
    challengeId?: string;
    onProgress?: (stage: 'preparing' | 'processing' | 'finalizing') => void;
    onQueueUpdate?: (progress: ScoringJobProgress) => void;
  }
): Promise<AnalysisResult> => {
  try {
    const clientStartedAt = performance.now();
    metadata?.onProgress?.('preparing');
    const formData = new FormData();

    // Always send WAV to avoid backend ffmpeg dependency for WebM conversion.
    let userAudioFile: File;
    if ((studentBlob.type || "").toLowerCase().includes("wav")) {
      userAudioFile = new File([studentBlob], "recitation.wav", {
        type: "audio/wav",
      });
    } else {
      try {
        const wavBlob = await convertBlobToWav(studentBlob);
        userAudioFile = new File([wavBlob], "recitation.wav", {
          type: "audio/wav",
        });
      } catch (error) {
        console.error("WAV conversion failed in browser:", error);
        throw new Error(
          "Could not convert recording to WAV in browser. " +
            "Retry in Chrome/Edge, or install ffmpeg on backend to support WebM."
        );
      }
    }

    formData.append("user_audio", userAudioFile, userAudioFile.name);

    // Use reference_id if provided, otherwise use referenceBlob
    if (referenceId) {
      formData.append("reference_id", referenceId);
    } else if (referenceBlob) {
      // Determine extension based on type if possible, default to mp3
      const ext = referenceBlob.type.includes("wav")
        ? "wav"
        : referenceBlob.type.includes("mp3")
        ? "mp3"
        : "mp3";
      formData.append("reference_audio", referenceBlob, `reference.${ext}`);
    }

    if (metadata?.clientSessionId) formData.append("client_session_id", metadata.clientSessionId);
    if (metadata?.recordingMode) formData.append("recording_mode", metadata.recordingMode);
    formData.append("scoring_version", metadata?.scoringVersion || "V2.3");
    formData.append("recording_attempt", String(metadata?.recordingAttempt || 1));
    if (metadata?.challengeId) formData.append("challenge_id", metadata.challengeId);

    // Use environment variable or default to production backend URL
    // Vite requires VITE_ prefix, but also support REACT_APP_ for compatibility
    const API_URL =
      import.meta.env.VITE_API_URL || "http://localhost:8000";
    console.log(API_URL);
    
    // Include authentication header for authenticated users
    const headers: HeadersInit = {};
    const authHeader = getAuthHeader();
    if ('Authorization' in authHeader && authHeader.Authorization) {
      headers['Authorization'] = authHeader.Authorization;
    }

    const audioPreparedAt = performance.now();
    // Fetch does not expose upload progress reliably across Safari versions, so
    // upload and server analysis are represented as one honest processing stage.
    metadata?.onProgress?.('processing');
    const uploadStartedAt = performance.now();
    const response = await fetch(`${API_URL}/api/scoring/jobs`, {
      method: "POST",
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);

      // Special handling: reference from library no longer exists on server
      if (
        response.status === 404 &&
        errorText.includes("Reference with ID") &&
        errorText.includes("not found")
      ) {
        throw new Error(
          "The selected reference audio no longer exists on the server. " +
            "Please reselect a reference from the library or upload it again."
        );
      }

      throw new Error(`Server error ${response.status}: ${errorText}`);
    }

    const submittedJob = await response.json();
    const jobAcknowledgedAt = performance.now();
    const jobId = submittedJob.job_id as string | undefined;
    if (!jobId) throw new Error("The scoring server did not return a Job ID.");

    const pollingStartedAt = Date.now();
    const maximumPollingTime = 15 * 60 * 1000;
    let transientStatusFailures = 0;
    let data: any = null;
    let finalJobStatus: any = null;
    while (Date.now() - pollingStartedAt < maximumPollingTime) {
      try {
        const statusResponse = await fetch(`${API_URL}/api/scoring/jobs/${encodeURIComponent(jobId)}`, {
          headers: headers,
        });
        if (!statusResponse.ok) {
          throw new Error(`Unable to read scoring job status (${statusResponse.status})`);
        }
        transientStatusFailures = 0;
        const jobStatus = await statusResponse.json();
        finalJobStatus = jobStatus;
        if (jobStatus.status === 'completed' && jobStatus.result) {
          data = jobStatus.result;
          break;
        }
        if (jobStatus.status === 'failed') {
          const terminalError = new Error(jobStatus.error || "The scoring worker could not complete this recording.");
          (terminalError as Error & { terminal?: boolean }).terminal = true;
          throw terminalError;
        }
        metadata?.onProgress?.('processing');
        metadata?.onQueueUpdate?.({
          jobId,
          status: jobStatus.status === 'processing' ? 'processing' : 'queued',
          stage: jobStatus.stage,
          queuePosition: jobStatus.queue_position,
        });
      } catch (statusError) {
        if ((statusError as Error & { terminal?: boolean }).terminal) throw statusError;
        transientStatusFailures += 1;
        if (transientStatusFailures >= 5) throw statusError;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
    }
    if (!data) throw new Error("Scoring is taking longer than expected. The Job ID remains safe; please retry status recovery.");
    const resultReceivedAt = performance.now();
    const parseServerTime = (value?: string | null) => value ? Date.parse(value) : NaN;
    const queuedAt = parseServerTime(finalJobStatus?.queued_at);
    const startedAt = parseServerTime(finalJobStatus?.started_at);
    const completedAt = parseServerTime(finalJobStatus?.completed_at);
    const timing = {
      jobId,
      audioPreparationMs: Math.round(audioPreparedAt - clientStartedAt),
      uploadAndAcknowledgementMs: Math.round(jobAcknowledgedAt - uploadStartedAt),
      pollingAfterAcknowledgementMs: Math.round(resultReceivedAt - jobAcknowledgedAt),
      totalClientMs: Math.round(resultReceivedAt - clientStartedAt),
      serverQueueMs: Number.isFinite(queuedAt) && Number.isFinite(startedAt) ? Math.round(startedAt - queuedAt) : null,
      serverProcessingMs: Number.isFinite(startedAt) && Number.isFinite(completedAt) ? Math.round(completedAt - startedAt) : null,
      capturedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem('tarannum_last_scoring_timing', JSON.stringify(timing));
    } catch {
      // Private browsing/storage restrictions must never block scoring.
    }
    console.info('[Tarannum scoring timing]', timing);
    metadata?.onProgress?.('finalizing');

    // Map backend response to AnalysisResult interface (Milestone 5: normalized 0-100)
    const score = typeof data.score === "number" ? data.score : 0;
    const normalizedScore = typeof data.normalizedScore === "number" ? data.normalizedScore : score;
    
    // Step 3: Handle training feedback (can be object or legacy string)
    let feedback: string | TrainingFeedback;
    if (data.feedback && typeof data.feedback === 'object' && 'label' in data.feedback) {
      // New structured feedback object from backend
      feedback = data.feedback as TrainingFeedback;
    } else if (typeof data.feedback === 'string') {
      // Legacy string feedback
      feedback = data.feedback;
    } else {
      // Fallback
      feedback = `Analysis complete. Score: ${score}%`;
    }

    let segments = [];
    if (Array.isArray(data.segments)) {
      console.log("Raw segments from backend:", data.segments);
      console.log("First segment from backend:", data.segments[0]);

      // Ensure each segment has the required fields and score is a number
      segments = data.segments.map((seg: any, index: number) => {
        let score: number;

        // Check if score exists and is a valid number
        if (seg.score === null || seg.score === undefined) {
          console.warn(`Segment ${index} has no score field`);
          score = 0;
        } else if (typeof seg.score === "number") {
          score = seg.score;
        } else if (typeof seg.score === "string") {
          // Try to parse string to number
          const parsed = parseFloat(seg.score);
          score = isNaN(parsed) ? 0 : parsed;
        } else {
          console.warn(
            `Segment ${index} has invalid score type:`,
            typeof seg.score,
            seg.score
          );
          score = 0;
        }

        // Ensure score is a valid number - preserve actual values, don't convert to 0
        if (isNaN(score) || !isFinite(score)) {
          console.warn(`Segment ${index} has NaN/Inf score, setting to 0`);
          score = 0;
        } else {
          // Clamp to valid range but preserve the actual value (even if very small)
          // Don't convert small numbers to 0 - keep the original value
          score = Math.max(0, Math.min(100, Number(score)));
        }

        const normalized = seg.normalized !== undefined && seg.normalized !== null
          ? Math.max(0, Math.min(100, Number(seg.normalized)))
          : score;
        const result: {
          segmentId?: string;
          start: number;
          end: number;
          score: number;
          normalized?: number;
          raw?: number;
          max?: number;
          accuracy: 'high' | 'medium' | 'low';
          text?: string;
        } = {
          start: typeof seg.start === "number" ? seg.start : 0,
          end: typeof seg.end === "number" ? seg.end : 0,
          score: normalized,
          accuracy: normalized >= 80 ? "high" : normalized >= 50 ? "medium" : "low",
        };
        if (seg.segmentId != null) result.segmentId = String(seg.segmentId);
        if (seg.normalized != null) result.normalized = normalized;
        if (seg.raw != null) result.raw = Number(seg.raw);
        if (seg.max != null) result.max = Number(seg.max);
        if (seg.text != null) result.text = seg.text;
        return result;
      });
      console.log("Final parsed segments:", segments);
    } else {
      // Create a default segment if backend doesn't provide detailed breakdown
      // This prevents the UI from breaking
      segments = [
        {
          start: 0,
          end: 0, // 0 indicates full duration in some UI logic, or we can leave it vague
          score: score,
          accuracy: score >= 80 ? "high" : score >= 50 ? "medium" : "low",
        },
      ];
    }

    // Handle pitch data from backend
    let pitchData: PitchDataResponse | undefined = undefined;
    if (data.pitchData) {
      pitchData = {
        reference: data.pitchData.reference || [],
        student: data.pitchData.student || [],
        errorPoints: data.pitchData.errorPoints || [],
      };
    }

    // Handle ayah timing from backend
    const ayatTiming = data.ayatTiming || [];

    // Handle score breakdown from backend (if available)
    const scoreBreakdown = data.scoreBreakdown
      ? {
          scoringVersion: data.scoreBreakdown.scoringVersion,
          pitch: data.scoreBreakdown.pitch || 0,
          timing: data.scoreBreakdown.timing || 0,
          pronunciation: data.scoreBreakdown.pronunciation || 0,
          consistency: data.scoreBreakdown.consistency,
          audioMatch: data.scoreBreakdown.audioMatch,
          pitchContour: data.scoreBreakdown.pitchContour,
          ayatTiming: data.scoreBreakdown.ayatTiming,
          graphStability: data.scoreBreakdown.graphStability,
          graphPosition: data.scoreBreakdown.graphPosition,
          contourDetail: data.scoreBreakdown.contourDetail,
          ayatGraph: data.scoreBreakdown.ayatGraph,
          segmentCoverage: data.scoreBreakdown.segmentCoverage,
          recitationValidity: data.scoreBreakdown.recitationValidity,
          tonalPattern: data.scoreBreakdown.tonalPattern,
          audioClarity: data.scoreBreakdown.audioClarity,
          micStability: data.scoreBreakdown.micStability,
          rawBase: data.scoreBreakdown.rawBase,
          rawPitch: data.scoreBreakdown.rawPitch,
          segmentOverall: data.scoreBreakdown.segmentOverall,
          finalAfterSegmentFusion: data.scoreBreakdown.finalAfterSegmentFusion,
          weights: data.scoreBreakdown.weights,
          featureScores: data.scoreBreakdown.featureScores,
          assessmentValidity: data.scoreBreakdown.assessmentValidity,
        }
      : undefined;

    const quranCorrectness = data.quranCorrectness || undefined;
    const aiNotes = data.aiNotes || undefined;
    const assessmentValidity =
      data.assessmentValidity || scoreBreakdown?.assessmentValidity || undefined;

    return {
      sessionId: data.session_id,
      analysisResultId: data.analysis_result_id,
      clientSessionId: data.client_session_id,
      recordingMode: data.recording_mode,
      scoringVersion: data.scoring_version,
      recordingAttempt: data.recording_attempt,
      dataSchemaVersion: data.data_schema_version,
      integrityStatus: data.integrity_status,
      score,
      normalizedScore,
      feedback,
      segments,
      pitchData,
      ayatTiming,
      scoreBreakdown,
      quranCorrectness,
      aiNotes,
      assessmentValidity,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || "");
    console.error("Scoring Service Error:", error);
    // A transport, conversion or backend failure is not a valid assessment.
    // Propagate it so RecordingPage displays Retry and does not unlock the
    // next recording mode with a fabricated empty 0% result.
    throw new Error(
      error instanceof Error
        ? errorMessage.toLowerCase().includes("ffmpeg not found")
          ? "Backend ffmpeg is unavailable for this recording format. Please retry the recording."
          : error.message
        : "Failed to connect to the scoring server. Please try again."
    );
  }
};

export interface AssessmentRecordingSummary {
  session_id: string;
  analysis_result_id: string;
  recording_mode: 'R1' | 'R2' | 'R3';
  score: number;
  attempt: number;
  created_at?: string;
  scoring_version?: string;
  integrity_status?: AnalysisResult['integrityStatus'];
}

export interface RecordingSessionStatus {
  client_session_id: string;
  reference_id?: string;
  completed_modes: Partial<Record<'R1' | 'R2' | 'R3', {
    session_id: string;
    analysis_result_id: string;
    score: number;
    attempt: number;
    created_at?: string;
    scoring_version?: string;
    data_schema_version?: string;
    integrity_status?: AnalysisResult['integrityStatus'];
    segments?: AnalysisResult['segments'];
    pitch_data?: PitchDataResponse;
    ayat_timing?: AyahTiming[];
    feedback?: AnalysisResult['feedback'];
    score_breakdown?: AnalysisResult['scoreBreakdown'];
  }>>;
  assessment?: {
    baseline: AssessmentRecordingSummary | null;
    progress_attempts: AssessmentRecordingSummary[];
    progress_count: number;
    median_progress: AssessmentRecordingSummary | null;
    best_progress: AssessmentRecordingSummary | null;
  };
  next_mode: 'R1' | 'R2' | null;
  complete: boolean;
}

export const restoreCompletedRecordingResult = (
  status: RecordingSessionStatus,
  mode: 'R1' | 'R2' | 'R3',
): AnalysisResult | null => {
  const saved = status.completed_modes[mode];
  if (!saved) return null;
  return {
    sessionId: saved.session_id,
    analysisResultId: saved.analysis_result_id,
    clientSessionId: status.client_session_id,
    recordingMode: mode,
    scoringVersion: saved.scoring_version || 'V2.3',
    recordingAttempt: saved.attempt,
    dataSchemaVersion: saved.data_schema_version,
    integrityStatus: saved.integrity_status,
    score: saved.score,
    normalizedScore: saved.score,
    feedback: saved.feedback || `Analysis complete. Score: ${saved.score}%`,
    segments: saved.segments || [],
    pitchData: saved.pitch_data,
    ayatTiming: saved.ayat_timing || [],
    scoreBreakdown: saved.score_breakdown,
  };
};

export const getRecordingSessionStatus = async (
  clientSessionId: string,
  referenceId?: string,
): Promise<RecordingSessionStatus> => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const query = referenceId ? `?reference_id=${encodeURIComponent(referenceId)}` : "";
  const response = await fetch(`${API_URL}/api/recording-sessions/${encodeURIComponent(clientSessionId)}/status${query}`, {
    headers: { ...getAuthHeader() },
  });
  if (!response.ok) throw new Error(`Unable to restore recording session (${response.status})`);
  return response.json();
};

export const generateAIRecitationNotes = async (
  analysisResultId: string
): Promise<Pick<AnalysisResult, "quranCorrectness" | "aiNotes">> => {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const response = await fetch(`${API_URL}/api/analysis/${analysisResultId}/ai-notes`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`AI notes error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    quranCorrectness: data.quranCorrectness || undefined,
    aiNotes: data.aiNotes || undefined,
  };
};

/**
 * Extract pitch data from reference audio (backend extraction)
 * This provides accurate pitch data using librosa.pyin
 * Used to pre-extract reference pitch when audio loads
 * 
 * @param audioBlob - Optional audio blob (if not using reference_id)
 * @param filename - Optional filename for blob upload
 * @param referenceId - Optional reference ID from library (preferred - uses backend-stored file)
 */
export const extractReferencePitch = async (
  audioBlob?: Blob,
  filename: string = "reference.mp3",
  referenceId?: string
): Promise<PitchDataResponse> => {
  // Use environment variable or default to production backend URL
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  console.log(API_URL);
  
  const formData = new FormData();
  
  // Prefer reference_id (uses backend-stored file)
  if (referenceId) {
    formData.append("reference_id", referenceId);
    console.log(`Extracting pitch using reference_id: ${referenceId}`);
  } else if (audioBlob) {
    // Fallback: upload blob
    formData.append("audio", audioBlob, filename);
    console.log(`Extracting pitch from uploaded blob: ${filename}`);
  } else {
    throw new Error("Either audioBlob or referenceId must be provided");
  }

  try {
    const response = await fetch(`${API_URL}/api/extract-pitch`, {
      headers: {
        ...getAuthHeader(),
      },
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Pitch extraction failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    // Convert backend format to frontend format
    // Backend returns: { reference: [{time, f_hz, midi, confidence}, ...], student: [], ayah_timing: [...] }
    // Frontend expects: { reference: PitchData[], student: PitchData[], ayah_timing?: AyahTiming[] }
    const pitchData: PitchDataResponse = {
      reference: (data.reference || []).map(
        (p: any) =>
          ({
            time: p.time,
            f_hz: p.f_hz,
            midi: p.midi,
            confidence: p.confidence || 0.9,
          } as PitchData)
      ),
      student: data.student || [],
      ayah_timing: data.ayah_timing || [], // Include text timing if available
    };

    // Debug: Log received ayah_timing data
    if (pitchData.ayah_timing && pitchData.ayah_timing.length > 0) {
      console.log(`[apiService] Received ${pitchData.ayah_timing.length} text segments from backend`);
      console.log(`[apiService] Segments:`, pitchData.ayah_timing);
    } else {
      console.log(`[apiService] No text segments received from backend`);
    }

    return pitchData;
  } catch (error) {
    console.error("Error extracting reference pitch:", error);
    throw error;
  }
};
