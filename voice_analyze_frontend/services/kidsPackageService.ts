import { getAuthHeader } from "./authService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export type PackageStatus = "draft" | "published" | "archived";
export type PackageType = "page" | "surah";
export type ActivityType = "iqra_reading" | "tarannum_listen" | "tarannum_practice" | "tarannum_record";
export type AssessmentEngine = "azure_speech" | "fastconformer" | "tarannum";
export type AgentAction = "advance" | "retain" | "remedial" | "foundation" | "human_review" | "notify_parent" | "notify_teacher";
export type TransitionOutcome = "advance" | "remedial" | "foundation";

export interface KidsPackageUnit {
  id?: string;
  unit_key: string;
  sequence: number;
  title: string;
  instruction?: string | null;
  activity_type: ActivityType;
  reference_text?: string | null;
  reference_id?: string | null;
  sample_id?: string | null;
  required: boolean;
  assessment_config: Record<string, unknown>;
}

export interface KidsPackageTransition {
  id?: string;
  to_package_id: string;
  outcome: TransitionOutcome;
  priority: number;
  conditions: Record<string, unknown>;
  requires_human_approval: boolean;
  is_active: boolean;
}

export interface KidsLearningPackage {
  id: string;
  package_key: string;
  version: number;
  title: string;
  description?: string | null;
  package_type: PackageType;
  level?: string | null;
  source_metadata: Record<string, unknown>;
  assessment_engines: AssessmentEngine[];
  completion_rules: {
    required_unit_pass_rate?: number;
    minimum_valid_attempts_per_unit?: number;
    require_in_sequence?: boolean;
    [key: string]: unknown;
  };
  allowed_agent_actions: AgentAction[];
  status: PackageStatus;
  created_by: string;
  published_at?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  units: KidsPackageUnit[];
  transitions: KidsPackageTransition[];
}

export interface KidsStudent {
  id: string;
  name: string;
  email: string;
}

export interface KidsAssignment {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  package_id: string;
  package_title: string;
  package_key: string;
  package_version: number;
  source: "admin" | "agent";
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  reason?: string | null;
  assigned_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  latest_run?: {
    id: string;
    status: string;
    valid_activity_seconds: number;
    started_at?: string | null;
    completed_at?: string | null;
  } | null;
}

export type PackageDraft = Omit<
  KidsLearningPackage,
  "id" | "version" | "status" | "created_by" | "published_at" | "archived_at" | "created_at" | "updated_at" | "transitions"
>;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeader(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Permintaan gagal (${response.status})`);
  }
  return response.json();
};

export const listKidsPackages = (status?: PackageStatus): Promise<KidsLearningPackage[]> =>
  request(`/api/admin/kids/packages${status ? `?status=${encodeURIComponent(status)}` : ""}`);

export const createKidsPackage = (payload: PackageDraft): Promise<KidsLearningPackage> =>
  request("/api/admin/kids/packages", { method: "POST", body: JSON.stringify(payload) });

export const updateKidsPackage = (id: string, payload: Partial<PackageDraft>): Promise<KidsLearningPackage> =>
  request(`/api/admin/kids/packages/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });

export const createKidsPackageVersion = (id: string): Promise<KidsLearningPackage> =>
  request(`/api/admin/kids/packages/${encodeURIComponent(id)}/versions`, { method: "POST" });

export const replaceKidsPackageTransitions = (id: string, transitions: KidsPackageTransition[]): Promise<KidsLearningPackage> =>
  request(`/api/admin/kids/packages/${encodeURIComponent(id)}/transitions`, {
    method: "PUT",
    body: JSON.stringify(transitions.map(({ id: _id, ...transition }) => transition)),
  });

export const publishKidsPackage = (id: string): Promise<KidsLearningPackage> =>
  request(`/api/admin/kids/packages/${encodeURIComponent(id)}/publish`, { method: "POST" });

export const archiveKidsPackage = (id: string): Promise<KidsLearningPackage> =>
  request(`/api/admin/kids/packages/${encodeURIComponent(id)}/archive`, { method: "POST" });

export const listKidsStudents = (search = ""): Promise<KidsStudent[]> =>
  request(`/api/admin/kids/students?search=${encodeURIComponent(search)}`);

export const listKidsAssignments = (status?: KidsAssignment["status"]): Promise<KidsAssignment[]> =>
  request(`/api/admin/kids/assignments${status ? `?status=${encodeURIComponent(status)}` : ""}`);

export const createKidsAssignment = (payload: {
  student_id: string;
  package_id: string;
  reason?: string;
}): Promise<KidsAssignment> => request("/api/admin/kids/assignments", {
  method: "POST",
  body: JSON.stringify(payload),
});
