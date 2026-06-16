import { getAuthHeader } from "./authService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const EVENT_DEBOUNCE_MS = 750;

export type StudentActivityEventType =
  | "practice_started"
  | "practice_stopped"
  | "reference_play"
  | "reference_pause"
  | "recording_started"
  | "recording_submitted"
  | "analysis_completed";

export interface StudentActivityEventPayload {
  event_type: StudentActivityEventType;
  reference_id?: string;
  session_id?: string;
  duration_seconds?: number;
  playback_position?: number;
  metadata?: Record<string, unknown>;
}

export interface StudentActivitySummary {
  total_practice_sessions: number;
  total_practice_minutes: number;
  total_reference_plays: number;
  total_recordings_started: number;
  total_recordings_submitted: number;
  total_analysis_completed: number;
  practice_streak_days: number;
  last_practice_at: string | null;
  weekly_activity: Array<{
    date: string;
    practice_sessions: number;
    practice_minutes: number;
    recordings: number;
  }>;
  recent_activity: Array<{
    event_type: string;
    created_at: string;
    reference_id: string | null;
    duration_seconds: number | null;
    metadata: Record<string, unknown> | null;
  }>;
  qari?: {
    qari_id: string;
    qari_name: string;
  } | null;
}

const lastSentAt = new Map<string, number>();

const buildDebounceKey = (payload: StudentActivityEventPayload): string =>
  [
    payload.event_type,
    payload.reference_id || "",
    payload.session_id || "",
  ].join(":");

export const sendStudentActivityEvent = (
  payload: StudentActivityEventPayload
): void => {
  const authHeader = getAuthHeader();
  if (!authHeader.Authorization) {
    return;
  }

  const key = buildDebounceKey(payload);
  const now = Date.now();
  const previousSentAt = lastSentAt.get(key) || 0;
  if (now - previousSentAt < EVENT_DEBOUNCE_MS) {
    return;
  }
  lastSentAt.set(key, now);

  const body = {
    ...payload,
    occurred_at: new Date().toISOString(),
  };

  void fetch(`${API_URL}/api/platform/student/activity-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    if (import.meta.env.VITE_DEBUG_ACTIVITY_EVENTS === "true") {
      console.warn("Student activity event failed:", error);
    }
  });
};

export const getStudentActivitySummary =
  async (): Promise<StudentActivitySummary> => {
    const response = await fetch(`${API_URL}/api/platform/student/activity-summary`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get student activity summary");
    }

    return response.json();
  };
