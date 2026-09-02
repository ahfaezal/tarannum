import { getAuthHeader } from "./authService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export type LearningAnnotationType =
  | "letter" | "mad" | "makhraj" | "ghunnah" | "stop"
  | "breath" | "repeat" | "pitch" | "note";

export interface LearningAnnotation {
  id: string;
  reference_id: string;
  qari_id: string;
  annotation_type: LearningAnnotationType;
  label: string;
  arabic_text?: string | null;
  note?: string | null;
  start_time: number;
  end_time?: number | null;
  vertical_position?: number | null;
  status?: "draft" | "published";
}

export type LearningAnnotationInput = Omit<LearningAnnotation, "id" | "reference_id" | "qari_id">;

const parseResponse = async (response: Response) => {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.detail || "Learning annotation request failed");
};

export const learningAnnotationService = {
  async list(referenceId: string, includeDrafts = false): Promise<LearningAnnotation[]> {
    const query = includeDrafts ? "?include_drafts=true" : "";
    const response = await fetch(`${API_URL}/api/references/${encodeURIComponent(referenceId)}/learning-annotations${query}`, {
      headers: getAuthHeader(),
    });
    return parseResponse(response);
  },
  async saveAll(referenceId: string, annotations: LearningAnnotation[], status: "draft" | "published", inactiveIds: string[] = []): Promise<{ status: string; annotations: LearningAnnotation[] }> {
    const response = await fetch(`${API_URL}/api/references/${encodeURIComponent(referenceId)}/learning-annotations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        status,
        inactive_ids: inactiveIds,
        annotations: annotations.map(({ id, reference_id: _referenceId, qari_id: _qariId, status: _status, ...item }) => ({
          ...item,
          id: id.startsWith("local-") ? null : id,
        })),
      }),
    });
    return parseResponse(response);
  },
  async create(referenceId: string, input: LearningAnnotationInput): Promise<LearningAnnotation> {
    const response = await fetch(`${API_URL}/api/references/${encodeURIComponent(referenceId)}/learning-annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify(input),
    });
    return parseResponse(response);
  },
  async remove(referenceId: string, annotationId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/references/${encodeURIComponent(referenceId)}/learning-annotations/${annotationId}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    });
    await parseResponse(response);
  },
};
