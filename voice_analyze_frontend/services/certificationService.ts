import { getAuthHeader } from "./authService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}/api/certification${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...getAuthHeader(), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Certification request failed");
  }
  return response.json();
};

export interface CourseProgress {
  course_id: string;
  enrollment_id: string;
  title: string;
  starts_at: string;
  attendance_status: "registered" | "attended" | "absent";
  reference_duration_seconds: number;
  required_practice_seconds: number;
  required_recording_count: number;
  valid_recording_count: number;
  remaining_recording_count: number;
  eligible: boolean;
  certificate_id?: string | null;
  deadline: string;
}

export interface CertificateSummary {
  id: string;
  certificate_number: string;
  certificate_type: "attendance" | "competency_tarannum" | "competency_azan";
  status: string;
  issued_at: string;
  details: Record<string, any>;
}

export interface CertificationCourse {
  id: string;
  title: string;
  certificate_category: "tarannum" | "azan";
  reference_id: string;
  reference_title: string;
  reference_duration_seconds: number;
  required_practice_seconds: number;
  required_recording_count: number;
  starts_at: string;
  duration_minutes: number;
  location?: string;
  completion_window_days: number;
  status: string;
}

export interface QariApplication {
  id: string;
  student_name: string;
  session_id: string;
  reference_id: string;
  certificate_type: string;
  score_snapshot: number;
  suggested_grade: string;
  final_grade?: string;
  status: string;
  qari_notes?: string;
  submitted_at: string;
}

export const getStudentCourseProgress = () => request<CourseProgress[]>("/student/courses");
export const getCompetencyEligibility = () => request<any[]>("/student/competency-eligibility");
export const submitCompetencyApplication = (sessionId: string, certificateType: string) => request<any>("/student/competency-applications", { method: "POST", body: JSON.stringify({ session_id: sessionId, certificate_type: certificateType }) });
export const getMyCertificates = () => request<CertificateSummary[]>("/certificates/mine");
export const getCertificationNotifications = () => request<any[]>("/notifications");
export const getAdminCourses = () => request<CertificationCourse[]>("/admin/courses");
export const createCertificationCourse = (payload: Record<string, any>) => request<CertificationCourse>("/admin/courses", { method: "POST", body: JSON.stringify(payload) });
export const enrollCourseStudents = (courseId: string, studentIds: string[]) => request<{ created: number; required_recording_count: number }>(`/admin/courses/${courseId}/enroll`, { method: "POST", body: JSON.stringify({ student_ids: studentIds }) });
export const getCourseEnrollments = (courseId: string) => request<any[]>(`/admin/courses/${courseId}/enrollments`);
export const setEnrollmentAttendance = (enrollmentId: string, attendance_status: string) => request<any>(`/admin/enrollments/${enrollmentId}/attendance`, { method: "PATCH", body: JSON.stringify({ attendance_status }) });
export const getQariApplications = () => request<QariApplication[]>("/qari/applications");
export const decideQariApplication = (id: string, payload: Record<string, any>) => request<{ status: string; certificate_id?: string }>(`/qari/applications/${id}/decision`, { method: "POST", body: JSON.stringify(payload) });

export const uploadQariSignature = async (file: File) => {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch(`${API_URL}/api/certification/qari/signature`, { method: "POST", headers: getAuthHeader(), body: data });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Signature upload failed");
  return response.json();
};

export const downloadCertificate = async (id: string, number: string) => {
  const response = await fetch(`${API_URL}/api/certification/certificates/${id}/download`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Certificate download failed");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${number}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const verifyCertificate = async (token: string) => {
  const response = await fetch(`${API_URL}/api/certification/verify/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(response.status === 404 ? "Sijil tidak ditemui" : "Semakan sijil gagal");
  return response.json();
};
