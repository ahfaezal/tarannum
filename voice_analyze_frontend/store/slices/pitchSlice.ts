import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { PitchData, PitchDataResponse } from '../../types';
import { PitchPoint } from '../../services/pitchExtractor';
import { extractReferencePitch } from '../../services/apiService';

interface PitchState {
  referencePitchData: PitchData[];
  studentPitchData: PitchPoint[];
  recordingPitchData: PitchPoint[];
  followModePitchData: PitchPoint[];
  referenceAyahTiming: any[];
  isExtractingRefPitch: boolean;
  pitchExtractionProgress: number;
  isFollowingReference: boolean;
  error: string | null;
}

const initialState: PitchState = {
  referencePitchData: [],
  studentPitchData: [],
  recordingPitchData: [],
  followModePitchData: [],
  referenceAyahTiming: [],
  isExtractingRefPitch: false,
  pitchExtractionProgress: 0,
  isFollowingReference: false,
  error: null,
};

// Async thunk for extracting reference pitch
interface ExtractPitchParams {
  audioBlob?: Blob;
  filename?: string;
  referenceId?: string;
  onProgress?: (progress: number) => void;
}

export const extractReferencePitchThunk = createAsyncThunk(
  'pitch/extractReferencePitch',
  async (
    { audioBlob, filename, referenceId, onProgress }: ExtractPitchParams,
    { rejectWithValue, dispatch }
  ) => {
    try {
      // Note: extractReferencePitch doesn't currently support onProgress callback
      // Progress tracking would need to be added to the API service
      const pitchData = await extractReferencePitch(
        audioBlob,
        filename || 'reference.mp3',
        referenceId
      );
      
      // Simulate progress completion
      dispatch(setPitchExtractionProgress(100));
      if (onProgress) {
        onProgress(100);
      }
      
      return pitchData;
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Failed to extract pitch');
    }
  }
);

const pitchSlice = createSlice({
  name: 'pitch',
  initialState,
  reducers: {
    setReferencePitchData: (state, action: PayloadAction<PitchData[]>) => {
      state.referencePitchData = action.payload;
    },
    clearReferencePitchData: (state) => {
      state.referencePitchData = [];
    },
    setStudentPitchData: (state, action: PayloadAction<PitchPoint[]>) => {
      state.studentPitchData = action.payload;
    },
    setRecordingPitchData: (state, action: PayloadAction<PitchPoint[]>) => {
      state.recordingPitchData = action.payload;
    },
    setFollowModePitchData: (state, action: PayloadAction<PitchPoint[]>) => {
      state.followModePitchData = action.payload;
    },
    setReferenceAyahTiming: (state, action: PayloadAction<any[]>) => {
      state.referenceAyahTiming = action.payload;
    },
    clearReferenceAyahTiming: (state) => {
      state.referenceAyahTiming = [];
    },
    setPitchExtractionProgress: (state, action: PayloadAction<number>) => {
      state.pitchExtractionProgress = action.payload;
    },
    setIsFollowingReference: (state, action: PayloadAction<boolean>) => {
      state.isFollowingReference = action.payload;
    },
    resetPitchState: (state) => {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(extractReferencePitchThunk.pending, (state) => {
        state.isExtractingRefPitch = true;
        state.pitchExtractionProgress = 0;
        state.referencePitchData = []; // Clear old data when starting new extraction
        state.error = null;
      })
      .addCase(extractReferencePitchThunk.fulfilled, (state, action) => {
        state.isExtractingRefPitch = false;
        state.pitchExtractionProgress = 100;
        state.referencePitchData = action.payload.reference || [];
        if (action.payload.ayah_timing && action.payload.ayah_timing.length > 0) {
          state.referenceAyahTiming = action.payload.ayah_timing;
        }
        state.error = null;
      })
      .addCase(extractReferencePitchThunk.rejected, (state, action) => {
        state.isExtractingRefPitch = false;
        state.pitchExtractionProgress = 0;
        state.error = action.payload as string;
      });
  },
});

export const {
  setReferencePitchData,
  clearReferencePitchData,
  setStudentPitchData,
  setRecordingPitchData,
  setFollowModePitchData,
  setReferenceAyahTiming,
  clearReferenceAyahTiming,
  setPitchExtractionProgress,
  setIsFollowingReference,
  resetPitchState,
} = pitchSlice.actions;

export default pitchSlice.reducer;
