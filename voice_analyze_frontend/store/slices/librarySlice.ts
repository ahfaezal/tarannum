import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ReferenceAudio, referenceLibraryService } from '../../services/referenceLibraryService';

interface LibraryState {
  references: ReferenceAudio[];
  isLoading: boolean;
  uploadProgress: number;
  error: string | null;
  isUploading: boolean;
}

const initialState: LibraryState = {
  references: [],
  isLoading: false,
  uploadProgress: 0,
  error: null,
  isUploading: false,
};

// Async thunk for loading references
export const loadReferences = createAsyncThunk(
  'library/loadReferences',
  async (_, { rejectWithValue }) => {
    try {
      // Check cache first
      const cached = referenceLibraryService.getCachedReferences();
      if (cached && cached.length > 0) {
        // Still fetch from backend to refresh
        const refs = await referenceLibraryService.getReferences();
        referenceLibraryService.cacheReferences(refs);
        return refs;
      }
      const refs = await referenceLibraryService.getReferences();
      referenceLibraryService.cacheReferences(refs);
      return refs;
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Failed to load references');
    }
  }
);

// Async thunk for uploading references with progress tracking
interface UploadReferenceParams {
  file: File;
  title: string;
  maqam?: string;
  onProgress?: (progress: number) => void;
}

export const uploadReference = createAsyncThunk(
  'library/uploadReference',
  async (
    { file, title, maqam, onProgress }: UploadReferenceParams,
    { rejectWithValue, dispatch }
  ) => {
    try {
      const savedReference = await referenceLibraryService.uploadReference(
        file,
        title,
        maqam,
        (progress) => {
          dispatch(setUploadProgress(progress));
          if (onProgress) {
            onProgress(progress);
          }
        }
      );
      
      // Refresh library after upload
      const refs = await referenceLibraryService.getReferences();
      referenceLibraryService.cacheReferences(refs);
      
      return { savedReference, references: refs };
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Failed to upload reference');
    }
  }
);

const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    setReferences: (state, action: PayloadAction<ReferenceAudio[]>) => {
      state.references = action.payload;
    },
    addReference: (state, action: PayloadAction<ReferenceAudio>) => {
      state.references.push(action.payload);
    },
    removeReference: (state, action: PayloadAction<string>) => {
      state.references = state.references.filter(ref => ref.id !== action.payload);
    },
    updateReference: (state, action: PayloadAction<ReferenceAudio>) => {
      const index = state.references.findIndex(ref => ref.id === action.payload.id);
      if (index !== -1) {
        state.references[index] = action.payload;
      }
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearUploadProgress: (state) => {
      state.uploadProgress = 0;
    },
  },
  extraReducers: (builder) => {
    // Load references
    builder
      .addCase(loadReferences.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadReferences.fulfilled, (state, action) => {
        state.isLoading = false;
        state.references = action.payload;
        state.error = null;
      })
      .addCase(loadReferences.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Upload reference
    builder
      .addCase(uploadReference.pending, (state) => {
        state.isUploading = true;
        state.uploadProgress = 0;
        state.error = null;
      })
      .addCase(uploadReference.fulfilled, (state, action) => {
        state.isUploading = false;
        state.uploadProgress = 100;
        state.references = action.payload.references;
        state.error = null;
      })
      .addCase(uploadReference.rejected, (state, action) => {
        state.isUploading = false;
        state.uploadProgress = 0;
        state.error = action.payload as string;
      });
  },
});

export const {
  setReferences,
  addReference,
  removeReference,
  updateReference,
  setUploadProgress,
  clearError,
  clearUploadProgress,
} = librarySlice.actions;

export default librarySlice.reducer;

