import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AnalysisResult, ProgressData } from '../../types';
import { analyzeRecitation } from '../../services/apiService';
import { progressService } from '../../services/progressService';

interface AnalysisState {
  analysisResult: AnalysisResult | null;
  progressData: ProgressData | null;
  isAnalyzing: boolean;
  error: string | null;
}

const initialState: AnalysisState = {
  analysisResult: null,
  progressData: null,
  isAnalyzing: false,
  error: null,
};

// Async thunk for analyzing audio
interface AnalyzeAudioParams {
  studentBlob: Blob;
  referenceBlob: Blob | null;
  referenceTitle: string;
  referenceId?: string;
}

export const analyzeAudio = createAsyncThunk(
  'analysis/analyzeAudio',
  async (
    { studentBlob, referenceBlob, referenceTitle, referenceId }: AnalyzeAudioParams,
    { rejectWithValue, getState, dispatch }
  ) => {
    try {
      const result = await analyzeRecitation(
        studentBlob,
        referenceBlob,
        referenceTitle,
        referenceId
      );
      
      // Save progress (we need selectedRef from state, but for now we'll handle it in the component)
      // Progress saving can be handled in the component or via another thunk
      
      return result;
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Failed to analyze audio');
    }
  }
);

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setAnalysisResult: (state, action: PayloadAction<AnalysisResult | null>) => {
      state.analysisResult = action.payload;
    },
    setProgressData: (state, action: PayloadAction<ProgressData | null>) => {
      state.progressData = action.payload;
    },
    clearAnalysisResult: (state) => {
      state.analysisResult = null;
    },
    clearProgressData: (state) => {
      state.progressData = null;
    },
    resetAnalysisState: (state) => {
      state.analysisResult = null;
      state.progressData = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(analyzeAudio.pending, (state) => {
        state.isAnalyzing = true;
        state.error = null;
      })
      .addCase(analyzeAudio.fulfilled, (state, action) => {
        state.isAnalyzing = false;
        state.analysisResult = action.payload;
        state.error = null;
      })
      .addCase(analyzeAudio.rejected, (state, action) => {
        state.isAnalyzing = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setAnalysisResult,
  setProgressData,
  clearAnalysisResult,
  clearProgressData,
  resetAnalysisState,
} = analysisSlice.actions;

export default analysisSlice.reducer;
