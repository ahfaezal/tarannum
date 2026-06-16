/**
 * Authentication service for user login, registration, and token management.
 */
export interface User {
  id: string;
  email: string;
  role: "admin" | "qari" | "student" | "public";
  full_name?: string;
  ic_number?: string | null;
  address?: string | null;
  phone_number?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  last_login?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
  ic_number?: string;
  address?: string;
  referral_code?: string;
  role: "student" | "qari"; // Allow both student and qari registration
}

export interface MessageResponse {
  message: string;
}

export interface AssignedQari {
  id: string;
  name: string;
}

export interface StudentProfile extends User {
  email_verified?: boolean;
  assigned_qari?: AssignedQari | null;
  referral_code?: string | null;
}

export interface QariProfile extends User {
  email_verified?: boolean;
  organization?: string | null;
  state?: string | null;
  bio?: string | null;
  maqam_specialization?: string | null;
  referral_code?: string | null;
  commission_rate?: number;
  total_students?: number;
  content_library_count?: number;
}

export interface ProfileUpdateData {
  full_name?: string | null;
  ic_number?: string | null;
  address?: string | null;
  phone_number?: string | null;
  organization?: string | null;
  state?: string | null;
  bio?: string | null;
  maqam_specialization?: string | null;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: string;
  full_name?: string;
}

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

const TOKEN_KEY = "tarannum_auth_token";
const USER_KEY = "tarannum_user";

/**
 * Get stored authentication token
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Get stored user data
 */
export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

/**
 * Store authentication token and user data
 */
export const storeAuth = (token: string, user: User): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

/**
 * Clear authentication data
 */
export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/**
 * Get authorization header for API requests
 */
export const getAuthHeader = (): { Authorization: string } | {} => {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/**
 * Register a new user
 */
export const register = async (data: RegisterData): Promise<User> => {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Registration failed");
  }

  return response.json();
};

/**
 * Verify email with a 6-digit OTP code
 */
export const verifyEmail = async (email: string, otpCode: string): Promise<MessageResponse> => {
  const response = await fetch(`${API_URL}/api/auth/verify-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, otp_code: otpCode }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Email verification failed");
  }

  return response.json();
};

/**
 * Request a new email verification OTP
 */
export const resendOtp = async (email: string): Promise<MessageResponse> => {
  const response = await fetch(`${API_URL}/api/auth/resend-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to resend OTP");
  }

  return response.json();
};

/**
 * Validate a public Qari referral code
 */
export const validateReferralCode = async (code: string): Promise<{
  valid: boolean;
  referralCode?: string;
  qariName?: string;
}> => {
  const response = await fetch(`${API_URL}/api/auth/referral/validate?code=${encodeURIComponent(code)}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to validate referral code");
  }

  return response.json();
};

/**
 * Login and get authentication token
 */
export const login = async (credentials: LoginCredentials): Promise<AuthToken> => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    // Preserve the specific error message from backend (especially for approval status)
    const errorMessage = error.detail || response.statusText || "Login failed";
    throw new Error(errorMessage);
  }

  const tokenData: AuthToken = await response.json();
  
  // Store token and fetch user info
  const user = await getCurrentUser(tokenData.access_token);
  storeAuth(tokenData.access_token, user);
  
  return tokenData;
};

/**
 * Get current user information
 */
export const getCurrentUser = async (token?: string): Promise<User> => {
  const authToken = token || getAuthToken();
  if (!authToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      throw new Error("Session expired. Please login again.");
    }
    throw new Error("Failed to get user information");
  }

  const user = await response.json();
  if (!token) {
    // Update stored user if not using provided token
    storeAuth(authToken, user);
  }
  return user;
};

/**
 * Get authenticated student profile details
 */
export const getStudentProfile = async (): Promise<StudentProfile> => {
  const response = await fetch(`${API_URL}/api/auth/me/profile`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to load profile");
  }

  return response.json();
};

export const getQariProfile = async (): Promise<QariProfile> => {
  const response = await fetch(`${API_URL}/api/auth/me/profile`, {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to load profile");
  }

  return response.json();
};

/**
 * Update authenticated student profile details
 */
export const updateStudentProfile = async (data: ProfileUpdateData): Promise<StudentProfile> => {
  const response = await fetch(`${API_URL}/api/auth/me/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to update profile");
  }

  return response.json();
};

export const updateQariProfile = async (data: ProfileUpdateData): Promise<QariProfile> => {
  const response = await fetch(`${API_URL}/api/auth/me/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to update profile");
  }

  return response.json();
};

/**
 * Upload authenticated student avatar
 */
export const uploadStudentAvatar = async (file: File): Promise<{ message: string; avatar_path?: string; avatar_url?: string }> => {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(`${API_URL}/api/auth/me/avatar`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to upload avatar");
  }

  return response.json();
};

export const uploadQariAvatar = uploadStudentAvatar;

/**
 * Remove authenticated student avatar
 */
export const removeStudentAvatar = async (): Promise<MessageResponse> => {
  const response = await fetch(`${API_URL}/api/auth/me/avatar`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to remove avatar");
  }

  return response.json();
};

export const removeQariAvatar = removeStudentAvatar;

/**
 * Change authenticated student password
 */
export const changeStudentPassword = async (data: ChangePasswordData): Promise<MessageResponse> => {
  const response = await fetch(`${API_URL}/api/auth/me/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Failed to change password");
  }

  return response.json();
};

export const changeQariPassword = changeStudentPassword;

/**
 * Logout current user
 */
export const logout = (): void => {
  clearAuth();
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return getAuthToken() !== null;
};

/**
 * Check if user has specific role
 */
export const hasRole = (role: User["role"]): boolean => {
  const user = getStoredUser();
  return user?.role === role;
};

/**
 * Check if user is admin
 */
export const isAdmin = (): boolean => {
  return hasRole("admin");
};

/**
 * Check if user is Qari
 */
export const isQari = (): boolean => {
  return hasRole("qari");
};

/**
 * Check if user is Student
 */
export const isStudent = (): boolean => {
  return hasRole("student");
};
