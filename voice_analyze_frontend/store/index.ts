import { configureStore } from '@reduxjs/toolkit';
import audioReducer from './slices/audioSlice';
import pitchReducer from './slices/pitchSlice';
import uiReducer from './slices/uiSlice';
import libraryReducer from './slices/librarySlice';
import practiceReducer from './slices/practiceSlice';
import analysisReducer from './slices/analysisSlice';
import authReducer from './slices/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    audio: audioReducer,
    pitch: pitchReducer,
    ui: uiReducer,
    library: libraryReducer,
    practice: practiceReducer,
    analysis: analysisReducer,
  },
  // Redux Thunk is included by default in Redux Toolkit
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for non-serializable values (Blobs, etc.)
        ignoredActions: [
          'library/uploadReference/fulfilled',
          'audio/setStudentBlob',
          'practice/setPracticeAudioBlob',
        ],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.file', 'payload.blob', 'meta.arg'],
        // Ignore these paths in the state
        ignoredPaths: ['audio.studentBlob', 'practice.practiceAudioBlob'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
