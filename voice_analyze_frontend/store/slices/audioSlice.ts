import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AudioState {
  selectedRef: any;
  studentBlob: Blob | null;
  uploadedRefUrl: string | null;
  isRecording: boolean;
  isPlaying: boolean;
  playbackTime: number;
  recordingTime: number;
  referenceDuration: number;
  playbackSpeed: number;
  studentPlaybackSpeed: number;
  syncProgress: number | null;
  isSyncingRef: boolean;
  isSyncingStudent: boolean;
}

const initialState: AudioState = {
  selectedRef: null,
  studentBlob: null,
  uploadedRefUrl: null,
  isRecording: false,
  isPlaying: false,
  playbackTime: 0,
  recordingTime: 0,
  referenceDuration: 0,
  playbackSpeed: 1.0,
  studentPlaybackSpeed: (() => {
    const saved = localStorage.getItem("studentPlaybackSpeed");
    return saved ? parseFloat(saved) : 1.0;
  })(),
  syncProgress: null,
  isSyncingRef: false,
  isSyncingStudent: false,
};

const audioSlice = createSlice({
  name: 'audio',
  initialState,
  reducers: {
    setSelectedRef: (state, action: PayloadAction<any>) => {
      state.selectedRef = action.payload;
    },
    setStudentBlob: (state, action: PayloadAction<Blob | null>) => {
      state.studentBlob = action.payload;
    },
    setUploadedRefUrl: (state, action: PayloadAction<string | null>) => {
      state.uploadedRefUrl = action.payload;
    },
    setIsRecording: (state, action: PayloadAction<boolean>) => {
      state.isRecording = action.payload;
    },
    setIsPlaying: (state, action: PayloadAction<boolean>) => {
      state.isPlaying = action.payload;
    },
    setPlaybackTime: (state, action: PayloadAction<number>) => {
      state.playbackTime = action.payload;
    },
    setRecordingTime: (state, action: PayloadAction<number>) => {
      state.recordingTime = action.payload;
    },
    setReferenceDuration: (state, action: PayloadAction<number>) => {
      state.referenceDuration = action.payload;
    },
    setPlaybackSpeed: (state, action: PayloadAction<number>) => {
      state.playbackSpeed = action.payload;
    },
    setStudentPlaybackSpeed: (state, action: PayloadAction<number>) => {
      state.studentPlaybackSpeed = action.payload;
      localStorage.setItem("studentPlaybackSpeed", action.payload.toString());
    },
    setSyncProgress: (state, action: PayloadAction<number | null>) => {
      state.syncProgress = action.payload;
    },
    setIsSyncingRef: (state, action: PayloadAction<boolean>) => {
      state.isSyncingRef = action.payload;
    },
    setIsSyncingStudent: (state, action: PayloadAction<boolean>) => {
      state.isSyncingStudent = action.payload;
    },
    resetAudioState: (state) => {
      state.studentBlob = null;
      state.isRecording = false;
      state.isPlaying = false;
      state.playbackTime = 0;
      state.recordingTime = 0;
    },
  },
});

export const {
  setSelectedRef,
  setStudentBlob,
  setUploadedRefUrl,
  setIsRecording,
  setIsPlaying,
  setPlaybackTime,
  setRecordingTime,
  setReferenceDuration,
  setPlaybackSpeed,
  setStudentPlaybackSpeed,
  setSyncProgress,
  setIsSyncingRef,
  setIsSyncingStudent,
  resetAudioState,
} = audioSlice.actions;

export default audioSlice.reducer;
