/**
 * Authentication service for user login, registration, and token management.
 */
export interface User {
  id: string;
  email: string;
  role: "admin" | "qari" | "student" | "public";
  full_name?: string;
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
  role: "student" | "qari"; // Allow both student and qari registration
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
