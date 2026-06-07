import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PracticeState {
  isPracticeMode: boolean;
  practiceStartTime: number | null;
  practiceTime: number;
  practiceError: string | null;
  showCountdown: boolean;
  practiceAudioBlob: Blob | null;
  practiceAudioUrl: string | null;
}

const initialState: PracticeState = {
  isPracticeMode: false,
  practiceStartTime: null,
  practiceTime: 0,
  practiceError: null,
  showCountdown: false,
  practiceAudioBlob: null,
  practiceAudioUrl: null,
};

const practiceSlice = createSlice({
  name: 'practice',
  initialState,
  reducers: {
    setIsPracticeMode: (state, action: PayloadAction<boolean>) => {
      state.isPracticeMode = action.payload;
      if (!action.payload) {
        state.practiceStartTime = null;
        state.practiceTime = 0;
      }
    },
    setPracticeStartTime: (state, action: PayloadAction<number | null>) => {
      state.practiceStartTime = action.payload;
    },
    setPracticeTime: (state, action: PayloadAction<number>) => {
      state.practiceTime = action.payload;
    },
    setPracticeError: (state, action: PayloadAction<string | null>) => {
      state.practiceError = action.payload;
    },
    setShowCountdown: (state, action: PayloadAction<boolean>) => {
      state.showCountdown = action.payload;
    },
    setPracticeAudioBlob: (state, action: PayloadAction<Blob | null>) => {
      state.practiceAudioBlob = action.payload;
    },
    setPracticeAudioUrl: (state, action: PayloadAction<string | null>) => {
      state.practiceAudioUrl = action.payload;
    },
    resetPracticeState: (state) => {
      state.isPracticeMode = false;
      state.practiceStartTime = null;
      state.practiceTime = 0;
      state.practiceError = null;
      state.showCountdown = false;
      state.practiceAudioBlob = null;
      state.practiceAudioUrl = null;
    },
  },
});

export const {
  setIsPracticeMode,
  setPracticeStartTime,
  setPracticeTime,
  setPracticeError,
  setShowCountdown,
  setPracticeAudioBlob,
  setPracticeAudioUrl,
  resetPracticeState,
} = practiceSlice.actions;

export default practiceSlice.reducer;
