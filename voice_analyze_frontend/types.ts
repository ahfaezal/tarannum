// NOTE:
// The main authentication/user type is defined in `services/authService.ts`,
// which already matches the backend roles: "admin" | "qari" | "student" | "public".
// This legacy UserRole/User definition was from an earlier prototype and is no longer used.
// We replace it with a lightweight alias that stays compatible with the backend.

export type UserRole = "admin" | "qari" | "student" | "public";

export interface PracticeSession {
  id: string;
  referenceId: string;
  studentAudioBlob: Blob | null;
  timestamp: number;
  similarityScore: number; // 0-100
  feedback: string;
}

export interface PitchData {
  time: number; // Time in seconds
  pitch?: number; // Pitch in Hz (deprecated, use f_hz instead) - kept for backward compatibility
  f_hz?: number | null; // Frequency in Hz (null if unvoiced)
  midi?: number | null; // MIDI note number (null if unvoiced)
  confidence?: number; // Confidence score (0-1) from pitch detection
}

export interface PitchStabilityMetrics {
  reference: {
    score: number; // 0-100 stability score
    stdDev: number; // Standard deviation in semitones
    coefficientOfVariation: number; // CV = std/mean
    changeRate: number; // Semitones per second
  };
  student: {
    score: number;
    stdDev: number;
    coefficientOfVariation: number;
    changeRate: number;
  };
  comparison: {
    rangeNormalized: boolean;
    octaveAgnostic: boolean;
    meanDifference: number; // Semitones
    rangeDifference: number; // Semitones
  };
}

export interface PitchMarker {
  time: number;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface PitchDataResponse {
  reference: PitchData[];
  student: PitchData[];
  errorPoints?: number[]; // Time points where pitch deviates significantly
  ayah_timing?: AyahTiming[]; // Optional text timing from reference audio
  stability?: PitchStabilityMetrics; // NEW: Pitch stability metrics
  markers?: PitchMarker[]; // NEW: Training markers for unclear/unstable segments
}

export interface AyahTiming {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string; // Arabic text for this segment
}

// Enhanced Training-friendly feedback interface (non-judgmental)
export interface SegmentFeedback {
  segment_index: number;
  start: number;
  end: number;
  score: number;
  label: string;
  message: string;
  issues?: string[]; // NEW: Specific issues (pitch_too_high, pitch_too_low, timing_too_fast, timing_too_slow)
  practiceTechnique?: string; // NEW: Suggested practice technique
}

export interface TrainingFeedback {
  label: string;
  category: 'excellent' | 'good' | 'developing' | 'beginning';
  message: string;
  strengths: string[];
  focus_areas: string[];
  segment_feedback?: SegmentFeedback[];

  // NEW: Enhanced feedback features
  progress?: {
    previousAverage?: number;
    previousBest?: number;
    improvement?: number;
    improvementPercent?: number;
    isImproving?: boolean;
    isNewBest?: boolean;
  };
  milestones?: string[]; // NEW: Achieved milestones (first_excellent, new_personal_best, etc.)
  suggestions?: string[]; // NEW: Specific improvement suggestions
}

export interface PronunciationAlert {
  time: number;
  expected: string; // Expected Arabic character
  detected: string; // Detected Arabic character
  confidence: number; // Confidence score (0-1)
  word?: string; // Recognized word
  expected_word?: string; // Expected word (if available)
  note?: string; // Optional note
}

export interface AnalysisResult {
  score: number;
  /** Normalized overall score 0-100 (Milestone 5) */
  normalizedScore?: number;
  feedback: string | TrainingFeedback; // Support both legacy string and new structured feedback
  segments: {
    segmentId?: string;
    start: number;
    end: number;
    score?: number;
    /** Normalized segment score 0-100 */
    normalized?: number;
    raw?: number;
    max?: number;
    accuracy: 'high' | 'medium' | 'low';
    text?: string;
  }[];
  pitchData?: PitchDataResponse; // Optional pitch data from backend
  ayatTiming?: AyahTiming[]; // Optional ayah text with timing
  pronunciationAlerts?: PronunciationAlert[]; // Beta: Pronunciation confusion alerts
  scoreBreakdown?: {
    pitch: number; // Pitch accuracy (0-100)
    timing: number; // Timing/rhythm (0-100)
    pronunciation: number; // Pronunciation (0-100)
  };
}

export interface PracticeAttempt {
  id: string;
  referenceId: string;
  referenceTitle: string;
  timestamp: number;
  score: number;
  segments: AnalysisResult['segments'];
  date: string;
}

export interface VarianceMetrics {
  standardDeviation: number;
  coefficientOfVariation: number;
  scoreRange: { min: number; max: number; spread: number };
  trend: 'improving' | 'declining' | 'stable' | 'erratic';
}

export interface ConsistencyFlag {
  type: 'outlier' | 'sudden_drop' | 'sudden_rise' | 'erratic' | 'low_consistency';
  severity: 'low' | 'medium' | 'high';
  message: string;
  attemptIndex: number;
}

export interface ConsistencyAnalysis {
  isConsistent: boolean;
  flags: ConsistencyFlag[];
  outlierIndices: number[];
  suddenChanges: Array<{
    fromIndex: number;
    toIndex: number;
    change: number;
    reason: string;
  }>;
}

export interface ConfidenceIntervals {
  interval95: { lower: number; upper: number };
  interval99: { lower: number; upper: number };
  predictionInterval: { lower: number; upper: number };
  sampleSize: number;
}

export interface ProgressData {
  attempts: PracticeAttempt[];
  bestScore: number;
  averageScore: number;
  improvement: number; // percentage improvement
  totalAttempts: number;

  // Enhanced: Variance metrics
  variance?: VarianceMetrics;

  // Enhanced: Consistency analysis
  consistency?: ConsistencyAnalysis;

  // Enhanced: Confidence intervals
  confidence?: ConfidenceIntervals;
}