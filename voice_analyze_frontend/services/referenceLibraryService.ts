/**
 * Reference Audio Library Service
 * Manages storage and retrieval of reference audio files.
 *
 * IMPORTANT: Uses the same API base URL as the main scoring API,
 * so it works both in local dev and on your deployed server.
 */
import { getAuthHeader, getAuthToken } from "./authService";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface TextSegment {
  text: string;
  start: number;
  end: number;
}

export interface ReferenceAudio {
  id: string;
  title: string;
  maqam?: string;
  filename: string;
  file_path: string;
  duration: number;
  upload_date: string;
  file_size: number;
  is_preset?: boolean;
  text_segments?: TextSegment[];
  preset_updated?: string;
}

export interface ReferenceListResponse {
  references: ReferenceAudio[];
  count: number;
}

class ReferenceLibraryService {
  /**
   * Upload a new reference audio file to the library
   */
  async uploadReference(
    audioFile: File,
    title: string,
    maqam?: string,
    onProgress?: (progress: number) => void,
    isPublic: boolean = false
  ): Promise<ReferenceAudio> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', audioFile);
      if (title) formData.append('title', title);
      if (maqam) formData.append('maqam', maqam);
      formData.append('is_public', isPublic.toString());

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            console.error('Failed to parse server response:', xhr.responseText);
            reject(new Error('Failed to parse server response'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.detail || 'Failed to upload reference audio'));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was cancelled'));
      });

      // Start upload
      xhr.open('POST', `${API_BASE_URL}/api/references/upload`);

      // Add authentication header
      const authHeader = getAuthHeader();
      if (authHeader.Authorization) {
        xhr.setRequestHeader('Authorization', authHeader.Authorization);
      }


      xhr.send(formData);
    });
  }

  /**
   * Get all saved references
   */
  async getReferences(): Promise<ReferenceAudio[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/references`, {
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        // If 404 or empty response, return empty array (no references yet)
        if (response.status === 404) {
          return [];
        }
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to fetch references: ${response.status} ${errorText}`);
      }

      const data: ReferenceListResponse = await response.json();
      return data.references || [];
    } catch (error: any) {
      // If it's a network error, return empty array instead of throwing
      if (error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('Failed to fetch')) {
        console.warn('Network error loading references, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific reference by ID
   */
  async getReference(refId: string): Promise<ReferenceAudio> {
    const response = await fetch(`${API_BASE_URL}/api/references/${refId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Reference not found');
      }
      throw new Error('Failed to fetch reference');
    }

    return response.json();
  }

  /**
   * Get reference audio file URL (for direct use in audio elements)
   * Note: This URL requires authentication. For audio elements that can't send headers,
   * use getReferenceAudioBlobUrl() instead.
   */
  getReferenceAudioUrl(refId: string): string {
    return `${API_BASE_URL}/api/references/${refId}/audio`;
  }

  /**
   * Get reference audio as a blob URL (for use in audio elements with authentication)
   * This fetches the audio with auth headers and creates a blob URL that can be used
   * in <audio> tags or WaveSurfer without authentication issues.
   */
  async getReferenceAudioBlobUrl(refId: string): Promise<string> {
    try {
      // Check if token exists before making request
      const token = getAuthToken();
      if (!token) {
        const errorMsg = `Authentication required. Please log in to access reference audio.`;
        console.error(`[getReferenceAudioBlobUrl] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const authHeader = getAuthHeader();
      const headers: HeadersInit = {
        ...authHeader,
      };
      
      // Verify Authorization header was set
      if (!headers.Authorization || !headers.Authorization.startsWith('Bearer ')) {
        const errorMsg = `Failed to get authentication token. Please log in again.`;
        console.error(`[getReferenceAudioBlobUrl] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const response = await fetch(`${API_BASE_URL}/api/references/${refId}/audio`, {
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        const errorMessage = error.detail || `Failed to fetch reference audio: ${response.status}`;
        console.error(`[getReferenceAudioBlobUrl] Error ${response.status}:`, errorMessage);
        
        // If 401/403, suggest re-login
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed. Please log in again.`);
        }
        
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    } catch (error: any) {
      console.error(`[getReferenceAudioBlobUrl] Error fetching reference audio for ${refId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a reference from the library
   */
  async deleteReference(refId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/references/${refId}`, {
      headers: {
        ...getAuthHeader(),
      },
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Delete failed' }));
      throw new Error(error.detail || 'Failed to delete reference');
    }
  }

  /**
   * Cache references in localStorage
   */
  cacheReferences(references: ReferenceAudio[]): void {
    try {
      localStorage.setItem('referenceLibrary', JSON.stringify(references));
      localStorage.setItem('referenceLibraryTimestamp', Date.now().toString());
    } catch (e) {
      console.warn('Failed to cache references:', e);
    }
  }

  /**
   * Get cached references from localStorage
   */
  getCachedReferences(): ReferenceAudio[] | null {
    try {
      const cached = localStorage.getItem('referenceLibrary');
      const timestamp = localStorage.getItem('referenceLibraryTimestamp');

      // Cache valid for 1 hour
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (age < 3600000) { // 1 hour
          return JSON.parse(cached);
        }
      }
    } catch (e) {
      console.warn('Failed to load cached references:', e);
    }
    return null;
  }

  /**
   * Clear cached references
   */
  clearCache(): void {
    localStorage.removeItem('referenceLibrary');
    localStorage.removeItem('referenceLibraryTimestamp');
  }

  /**
   * Create or update a training preset with text segments
   */
  async createPreset(
    referenceId: string,
    title: string,
    textSegments: TextSegment[],
    maqam?: string
  ): Promise<ReferenceAudio> {
    const formData = new FormData();
    formData.append('reference_id', referenceId);
    formData.append('title', title);
    formData.append('text_segments', JSON.stringify(textSegments));
    if (maqam) formData.append('maqam', maqam);

    const response = await fetch(`${API_BASE_URL}/api/admin/presets`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to create preset' }));
      throw new Error(error.detail || 'Failed to create preset');
    }

    return response.json();
  }

  /**
   * Get all admin-created presets
   */
  async getPresets(): Promise<ReferenceAudio[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/presets`, {
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        // If 404 or empty response, return empty array (no presets yet)
        if (response.status === 404) {
          return [];
        }
        // For other errors, try to get error message
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to fetch presets: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.presets || [];
    } catch (error: any) {
      // If it's a network error, return empty array instead of throwing
      if (error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('Failed to fetch')) {
        console.warn('Network error loading presets, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific preset by ID
   */
  async getPreset(presetId: string): Promise<ReferenceAudio> {
    const response = await fetch(`${API_BASE_URL}/api/admin/presets/${presetId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Preset not found');
      }
      throw new Error('Failed to fetch preset');
    }

    return response.json();
  }

  /**
   * Update preset text segments
   */
  async updatePreset(
    presetId: string,
    textSegments: TextSegment[],
    title?: string,
    maqam?: string
  ): Promise<ReferenceAudio> {
    const formData = new FormData();
    formData.append('text_segments', JSON.stringify(textSegments));
    if (title) formData.append('title', title);
    if (maqam) formData.append('maqam', maqam);

    const response = await fetch(`${API_BASE_URL}/api/admin/presets/${presetId}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to update preset' }));
      throw new Error(error.detail || 'Failed to update preset');
    }

    return response.json();
  }

  /**
   * Delete a preset (converts back to regular reference)
   */
  async deletePreset(presetId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/admin/presets/${presetId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete preset' }));
      throw new Error(error.detail || 'Failed to delete preset');
    }
  }
}

export const referenceLibraryService = new ReferenceLibraryService();
