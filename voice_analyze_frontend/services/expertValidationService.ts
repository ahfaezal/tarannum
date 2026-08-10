import { getAuthHeader } from "./authService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface ExpertQariOption {
  id: string;
  name: string;
  email: string;
}

export interface CandidateSummary {
  eligible_recordings: number;
  participants: number;
  references: Array<{ reference_id: string; title: string; count: number }>;
  filters: { scoring_version: string; integrity_status: string };
}

export interface ExpertBatchSummary {
  id: string;
  name: string;
  status: string;
  rubric_version: string;
  recording_count: number;
  duplicate_count: number;
  evaluator_count: number;
  submitted_tasks: number;
  total_tasks: number;
  created_at: string;
}

export interface ExpertAssignmentSummary {
  id: string;
  batch_id: string;
  name: string;
  description?: string;
  status: string;
  rubric_version: string;
  total_tasks: number;
  submitted_tasks: number;
  assigned_at: string;
}

export interface RubricDefinition {
  key: RubricKey;
  label: string;
  weight: number;
}

export type RubricKey =
  | "melodic_contour"
  | "pitch_control"
  | "rhythm_continuity"
  | "voice_stability"
  | "tarannum_suitability";

export interface ExpertRatingForm {
  melodic_contour: number | null;
  pitch_control: number | null;
  rhythm_continuity: number | null;
  voice_stability: number | null;
  tarannum_suitability: number | null;
  audio_evaluable: boolean;
  tarannum_identifiable: "yes" | "no" | "unsure";
  confidence: "low" | "medium" | "high";
  primary_issue: string;
  comments: string;
}

export interface ExpertTaskSummary {
  id: string;
  code: string;
  order: number;
  status: "pending" | "draft" | "submitted";
}

export interface ExpertTaskDetail {
  id: string;
  code: string;
  order: number;
  reference: { title: string; maqam?: string | null };
  participant_audio_url: string;
  reference_audio_url: string;
  rating: (ExpertRatingForm & { status: "draft" | "submitted" }) | null;
}

const jsonOrError = async (response: Response) => {
  const body = await response.json().catch(() => ({ detail: response.statusText }));
  if (!response.ok) throw new Error(body.detail || "Request failed");
  return body;
};

export const getExpertQariOptions = async (): Promise<ExpertQariOption[]> => {
  const response = await fetch(`${API_URL}/api/expert-validation/admin/qari-options`, { headers: getAuthHeader() });
  return (await jsonOrError(response)).qaris;
};

export const getExpertCandidateSummary = async (start?: string, end?: string): Promise<CandidateSummary> => {
  const params = new URLSearchParams();
  if (start) params.set("cohort_start", `${start}T00:00:00`);
  if (end) params.set("cohort_end", `${end}T00:00:00`);
  const response = await fetch(`${API_URL}/api/expert-validation/admin/candidates?${params.toString()}`, { headers: getAuthHeader() });
  return jsonOrError(response);
};

export const getExpertBatches = async (): Promise<ExpertBatchSummary[]> => {
  const response = await fetch(`${API_URL}/api/expert-validation/admin/batches`, { headers: getAuthHeader() });
  return (await jsonOrError(response)).batches;
};

export const createExpertBatch = async (payload: {
  name: string;
  description?: string;
  evaluator_ids: string[];
  cohort_start?: string;
  cohort_end?: string;
  target_count: number;
  duplicate_count: number;
  random_seed: number;
  consent_confirmed: boolean;
}) => {
  const response = await fetch(`${API_URL}/api/expert-validation/admin/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({
      ...payload,
      cohort_start: payload.cohort_start ? `${payload.cohort_start}T00:00:00` : null,
      cohort_end: payload.cohort_end ? `${payload.cohort_end}T00:00:00` : null,
    }),
  });
  return jsonOrError(response);
};

export const getMyExpertAssignments = async (): Promise<ExpertAssignmentSummary[]> => {
  const response = await fetch(`${API_URL}/api/expert-validation/qari/assignments`, { headers: getAuthHeader() });
  return (await jsonOrError(response)).assignments;
};

export const getExpertAssignment = async (assignmentId: string): Promise<{
  assignment: { id: string; name: string; status: string; rubric_version: string };
  rubric: RubricDefinition[];
  tasks: ExpertTaskSummary[];
}> => {
  const response = await fetch(`${API_URL}/api/expert-validation/qari/assignments/${assignmentId}`, { headers: getAuthHeader() });
  return jsonOrError(response);
};

export const getExpertTask = async (taskId: string): Promise<ExpertTaskDetail> => {
  const response = await fetch(`${API_URL}/api/expert-validation/qari/tasks/${taskId}`, { headers: getAuthHeader() });
  return jsonOrError(response);
};

export type ManagedExpertAudio = HTMLAudioElement & { cleanup: () => void };

export const playExpertAudio = async (relativeUrl: string): Promise<ManagedExpertAudio> => {
  const response = await fetch(`${API_URL}${relativeUrl}`, { headers: getAuthHeader() });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || "Audio gagal dimuatkan");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const audio = new Audio(objectUrl) as ManagedExpertAudio;
  let cleaned = false;
  audio.cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(objectUrl);
  };
  audio.addEventListener("ended", audio.cleanup, { once: true });
  audio.addEventListener("error", audio.cleanup, { once: true });
  await audio.play();
  return audio;
};

export const saveExpertRating = async (taskId: string, form: ExpertRatingForm, submit: boolean) => {
  const response = await fetch(`${API_URL}/api/expert-validation/qari/tasks/${taskId}/rating`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ ...form, submit }),
  });
  return jsonOrError(response);
};
