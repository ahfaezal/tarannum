/**
 * Platform service for Qari, Student, and Admin functionality.
 */
import { getAuthHeader } from "./authService";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface QariContent {
  id: string;
  reference_id: string;
  surah_number?: number;
  surah_name?: string;
  ayah_number?: number;
  maqam?: string;
  reference_title?: string;
  reference_duration?: number;
  created_at?: string;
  filename?: string;
  file_path?: string;
  duration?: number;
  upload_date?: string;
  text_segments?: Array<{ text: string; start: number; end: number }>;
}

export interface StudentInfo {
  student_id: string;
  student_email: string;
  student_name?: string;
  joined_at: string;
  last_active: string;
  latest_score?: number;
  improvement?: number;
  statistics?: StudentStatistics;
}

export interface StudentStatistics {
  total_sessions: number;
  average_score: number;
  best_score: number;
  latest_score: number;
  improvement_trend: number[];
  weakest_verses: Array<{ text: string; frequency: number }>;
}

export interface StudentProgress {
  id: string;
  session_id: string;
  overall_score: number;
  previous_score?: number;
  improvement?: number;
  verse_scores?: Array<{
    start: number;
    end: number;
    score: number;
    text: string;
  }>;
  weakest_verses?: Array<{
    start: number;
    end: number;
    score: number;
    text: string;
  }>;
  reference_id?: string;
  created_at: string;
  file_path?: string;
}

export interface QariInfo {
  qari_id: string;
  qari_email: string;
  qari_name?: string;
  joined_at: string;
}

/**
 * Get available content based on user role
 */
export const getAvailableContent = async (): Promise<{
  content: QariContent[];
  qari?: string;
  message?: string;
}> => {
  const response = await fetch(`${API_URL}/api/platform/content/available`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get available content");
  }

  return response.json();
};

/**
 * Qari: Add content to library
 */
export const addQariContent = async (content: {
  reference_id: string;
  surah_number?: number;
  surah_name?: string;
  ayah_number?: number;
  maqam?: string;
}): Promise<{ success: boolean; content_id: string }> => {
  const response = await fetch(`${API_URL}/api/platform/qari/content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(content),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to add content");
  }

  return response.json();
};

/**
 * Qari: Get my content library
 */
export const getQariContent = async (): Promise<{
  content: QariContent[];
  count: number;
}> => {
  const response = await fetch(`${API_URL}/api/platform/qari/content`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Qari content");
  }

  return response.json();
};

/**
 * Qari: Update content metadata (surah/ayah settings)
 */
export const updateQariContent = async (
  contentId: string,
  content: {
    surah_number?: number;
    surah_name?: string;
    ayah_number?: number;
    maqam?: string;
  }
): Promise<{ success: boolean; content_id: string }> => {
  const response = await fetch(`${API_URL}/api/platform/qari/content/${contentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(content),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to update content");
  }

  return response.json();
};

/**
 * Qari: Delete/remove content from library
 */
export const deleteQariContent = async (
  contentId: string
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_URL}/api/platform/qari/content/${contentId}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to delete Qari content");
  }

  return response.json();
};

/**
 * Qari: Get my students (Dashboard)
 */
export const getQariStudents = async (): Promise<{
  students: StudentInfo[];
  count: number;
}> => {
  const response = await fetch(`${API_URL}/api/platform/qari/students`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Qari students");
  }

  return response.json();
};

/**
 * Qari: Get detailed information about a specific student
 */
export interface StudentDetails {
  student: {
    id: string;
    email: string;
    full_name?: string;
    joined_at?: string;
    last_active?: string;
  };
  statistics: StudentStatistics;
  progress: StudentProgress[];
  recordings: Array<{
    session_id: string;
    reference?: {
      id: string;
      title: string;
      maqam?: string;
      filename?: string;
    };
    file_path?: string;
    duration?: number;
    file_size?: number;
    created_at?: string;
    score?: number;
    analysis?: {
      score?: number;
      segments?: any[];
      pitch_data?: any;
      regions?: any;
      ayat_timing?: any;
      feedback?: any;
      score_breakdown?: any;
      pronunciation_alerts?: any;
    };
    progress?: {
      overall_score: number;
      improvement?: number;
      verse_scores?: any[];
      weakest_verses?: any[];
    };
  }>;
  total_recordings: number;
  total_progress_records: number;
}

export const getStudentDetails = async (studentId: string): Promise<StudentDetails> => {
  const response = await fetch(`${API_URL}/api/platform/qari/students/${studentId}`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to get student details");
  }

  return response.json();
};

/**
 * Student: Assign to a Qari
 */
export const assignToQari = async (qariId: string, referralCode?: string): Promise<{
  success: boolean;
  relationship_id: string;
}> => {
  const response = await fetch(`${API_URL}/api/platform/student/assign-qari`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({
      qari_id: qariId,
      referral_code: referralCode,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to assign to Qari");
  }

  return response.json();
};

/**
 * Student: Get my active Qari
 */
export const getMyQari = async (): Promise<{
  qari: QariInfo | null;
  message?: string;
}> => {
  const response = await fetch(`${API_URL}/api/platform/student/my-qari`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Qari");
  }

  return response.json();
};

/**
 * Student: Get my progress
 */
export const getStudentProgress = async (limit: number = 50): Promise<{
  progress: StudentProgress[];
  count: number;
}> => {
  const response = await fetch(
    `${API_URL}/api/platform/student/progress?limit=${limit}`,
    {
      headers: {
        ...getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get progress");
  }

  return response.json();
};

/**
 * Student: Get my statistics
 */
export const getStudentStatistics = async (): Promise<StudentStatistics> => {
  const response = await fetch(`${API_URL}/api/platform/student/statistics`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get statistics");
  }

  return response.json();
};

/**
 * Get available Qaris (for students to select from)
 */
export const getAvailableQaris = async (): Promise<{
  qaris: Array<{
    id: string;
    email: string;
    full_name?: string;
    is_approved: boolean;
    is_active: boolean;
    created_at?: string;
  }>;
}> => {
  const response = await fetch(`${API_URL}/api/platform/qaris/available`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list Qaris");
  }

  return response.json();
};

/**
 * Admin: List all Qaris
 */
export const listAllQaris = async (): Promise<{
  qaris: Array<{
    id: string;
    email: string;
    full_name?: string;
    is_approved: boolean;
    is_active: boolean;
    created_at: string;
  }>;
}> => {
  const response = await fetch(`${API_URL}/api/platform/admin/qaris`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list Qaris");
  }

  return response.json();
};

/**
 * Admin: Approve Qari
 */
export const approveQari = async (qariId: string): Promise<{
  success: boolean;
  message: string;
  referral_code?: string;
}> => {
  const response = await fetch(
    `${API_URL}/api/platform/admin/approve-qari/${qariId}`,
    {
      method: "POST",
      headers: {
        ...getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to approve Qari");
  }

  return response.json();
};

/**
 * Qari: Get referral code
 */
export const getQariReferralCode = async (): Promise<{
  referral_code: string;
  commission_rate: number;
}> => {
  const response = await fetch(`${API_URL}/api/platform/qari/referral-code`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get referral code");
  }

  return response.json();
};

/**
 * Qari: Get commission statistics
 */
export const getQariCommissionStats = async (): Promise<{
  active_students: number;
  referral_code: string;
  commission_rate: number;
  referral_breakdown: Array<{ code: string; count: number }>;
}> => {
  const response = await fetch(`${API_URL}/api/platform/qari/commission-stats`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get commission stats");
  }

  return response.json();
};

/**
 * Admin: List all users
 */
export interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  role: "admin" | "qari" | "student" | "public";
  is_approved: boolean;
  is_active: boolean;
  referral_code?: string;
  commission_rate: number;
  created_at: string;
  last_login?: string;
}

export const listAllUsers = async (role?: string): Promise<{
  users: AdminUser[];
  count: number;
}> => {
  const url = role 
    ? `${API_URL}/api/platform/admin/users?role=${role}`
    : `${API_URL}/api/platform/admin/users`;
  const response = await fetch(url, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list users");
  }

  return response.json();
};

/**
 * Admin: Get user by ID
 */
export const getUser = async (userId: string): Promise<AdminUser> => {
  const response = await fetch(`${API_URL}/api/platform/admin/users/${userId}`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get user");
  }

  return response.json();
};

/**
 * Admin: Update user
 */
export const updateUser = async (
  userId: string,
  data: {
    full_name?: string;
    role?: string;
    is_approved?: boolean;
    is_active?: boolean;
    commission_rate?: number;
  }
): Promise<AdminUser> => {
  const response = await fetch(`${API_URL}/api/platform/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to update user");
  }

  return response.json();
};

/**
 * Admin: Create user
 */
export const createUser = async (data: {
  email: string;
  password: string;
  full_name?: string;
  role: "admin" | "qari" | "student";
  is_approved?: boolean;
  is_active?: boolean;
  commission_rate?: number;
}): Promise<AdminUser> => {
  const response = await fetch(`${API_URL}/api/platform/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to create user");
  }

  return response.json();
};

/**
 * Admin: Delete user
 */
export const deleteUser = async (userId: string): Promise<{
  success: boolean;
  message: string;
}> => {
  const response = await fetch(`${API_URL}/api/platform/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to delete user");
  }

  return response.json();
};

/**
 * Admin: Get platform statistics
 */
export interface PlatformStatistics {
  users: {
    total: number;
    by_role: Record<string, number>;
    active: number;
    approved_qaris: number;
    pending_qaris: number;
    new_users_7d: number;
    new_users_30d: number;
    growth: Array<{ date: string; count: number }>;
  };
  sessions: {
    total: number;
    authenticated: number;
    public: number;
    by_role: Record<string, number>;
    recent_7d: number;
    activity: Array<{ date: string; count: number }>;
  };
  analyses: {
    total: number;
    average_score: number;
  };
  progress: {
    total_records: number;
    students_with_progress: number;
  };
  relationships: {
    total: number;
    active: number;
  };
  content: {
    total_references: number;
    public_references: number;
    qari_content: number;
    top_references: Array<{ id: string; title: string; usage_count: number }>;
  };
  recent_activity: Array<{
    session_id: string;
    user_email?: string;
    is_public: boolean;
    reference_id?: string;
    score?: number;
    duration?: number;
    created_at?: string;
  }>;
}

export const getPlatformStatistics = async (): Promise<PlatformStatistics> => {
  const response = await fetch(`${API_URL}/api/platform/admin/statistics`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get platform statistics");
  }

  return response.json();
};

/**
 * Admin: Get detailed users with activity stats
 */
export interface DetailedUser extends AdminUser {
  session_count?: number;
  analysis_count?: number;
  student_count?: number; // For Qari
  content_count?: number; // For Qari
  progress_count?: number; // For Student
  assigned_qari?: string; // For Student
  average_score?: number; // For Student
}

export const getDetailedUsers = async (): Promise<{
  users: DetailedUser[];
  count: number;
}> => {
  const response = await fetch(`${API_URL}/api/platform/admin/users/detailed`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get detailed users");
  }

  return response.json();
};

/**
 * Admin: Get all sessions with details
 */
export interface DetailedSession {
  session_id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  user_role?: string;
  reference_id?: string;
  qari_id?: string;
  qari_name?: string;
  file_path?: string;
  duration?: number;
  file_size?: number;
  is_public_demo: boolean;
  created_at?: string;
  score?: number;
  verse_scores?: any;
  weak_verses?: any;
  has_analysis: boolean;
}

export const getAllSessions = async (
  limit: number = 100,
  offset: number = 0,
  userId?: string
): Promise<{
  sessions: DetailedSession[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const url = userId
    ? `${API_URL}/api/platform/admin/sessions?limit=${limit}&offset=${offset}&user_id=${userId}`
    : `${API_URL}/api/platform/admin/sessions?limit=${limit}&offset=${offset}`;
  
  const response = await fetch(url, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get sessions");
  }

  return response.json();
};

/**
 * Admin: Get usage metrics
 */
export interface UsageMetrics {
  active_students: {
    today: number;
    this_week: number;
  };
  recordings: {
    today: number;
    this_week: number;
    total: number;
  };
  assessments: {
    today: number;
    this_week: number;
    total: number;
  };
  most_active_qari: {
    id?: string;
    name?: string;
    email?: string;
    session_count: number;
  };
  storage: {
    total_mb: number;
    total_gb: number;
    by_qari: Record<string, { qari_name: string; estimated_mb: number }>;
  };
}

export const getUsageMetrics = async (): Promise<UsageMetrics> => {
  const response = await fetch(`${API_URL}/api/platform/admin/usage-metrics`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get usage metrics");
  }

  return response.json();
};
