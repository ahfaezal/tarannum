import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  isFullScreenMode: boolean;
  isPlayingPracticeAudio: boolean;
  practiceAudioTime: number;
  practiceAudioDuration: number;
}

const initialState: UiState = {
  isFullScreenMode: false,
  isPlayingPracticeAudio: false,
  practiceAudioTime: 0,
  practiceAudioDuration: 0,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setIsFullScreenMode: (state, action: PayloadAction<boolean>) => {
      state.isFullScreenMode = action.payload;
    },
    setIsPlayingPracticeAudio: (state, action: PayloadAction<boolean>) => {
      state.isPlayingPracticeAudio = action.payload;
    },
    setPracticeAudioTime: (state, action: PayloadAction<number>) => {
      state.practiceAudioTime = action.payload;
    },
    setPracticeAudioDuration: (state, action: PayloadAction<number>) => {
      state.practiceAudioDuration = action.payload;
    },
  },
});

export const {
  setIsFullScreenMode,
  setIsPlayingPracticeAudio,
  setPracticeAudioTime,
  setPracticeAudioDuration,
} = uiSlice.actions;

export default uiSlice.reducer;
