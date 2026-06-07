import React from "react";
import LivePitchGraph from "./LivePitchGraph";
import Waveform from "./Waveform";
import { PitchPoint } from "../services/pitchExtractor";
import { PitchData, PitchMarker } from "../types";

interface CombinedWaveformPitchProps {
  // Pitch graph props (for LivePitchGraph)
  referencePitch: PitchData[];
  studentPitch: PitchPoint[];
  isRecording: boolean;
  isPlaying: boolean;
  currentTime: number;
  referenceDuration?: number;
  markers?: PitchMarker[];
  onMarkerClick?: (time: number) => void;

  // Waveform props
  referenceAudioUrl?: string | null;
  studentAudioUrl?: string | null;
  studentAudioBlob?: Blob | null;
  onSeek?: (progress: number) => void;

  // Shared props
  height?: number; // Total height - split between pitch (60%) and waveform (40%)
  isFullScreen?: boolean;
  zoomLevel?: number; // External zoom level control (optional)
  onZoomChange?: (zoom: number) => void; // Callback when zoom changes externally
}

/**
 * Combined Waveform + Pitch Display Component
 *
 * Displays both waveform (articulation, breath, sound shape) and pitch contour (melodic flow)
 * Waveform: 40% height (bottom)
 * Pitch: 60% height (top)
 */
const CombinedWaveformPitch: React.FC<CombinedWaveformPitchProps> = ({
  referencePitch,
  studentPitch,
  isRecording,
  isPlaying,
  currentTime,
  referenceDuration,
  markers = [],
  onMarkerClick,
  referenceAudioUrl,
  studentAudioUrl,
  studentAudioBlob,
  onSeek,
  height = 600, // Default total height
  isFullScreen = false,
  zoomLevel,
  onZoomChange,
}) => {
  const pitchHeight = Math.max(280, Math.min(400, Math.floor(height * 0.55)));
  const waveformHeight = Math.max(100, height - pitchHeight);

  // Determine if student waveform should be shown
  // Show during practice (isRecording) OR when there's a completed recording
  const shouldShowStudentWaveform = isRecording || (studentAudioUrl || studentAudioBlob);

  // Calculate equal heights for both waveforms when both are shown
  // Label height: ~24px (px-2 py-1 = 8px top + 8px bottom + ~8px text)
  const labelHeight = 24;
  const gapHeight = 8; // Gap between waveforms
  const scrollbarHeight = 32; // Scrollbar at bottom
  
  // When both waveforms are shown, split the available height equally
  const availableHeight = waveformHeight - (shouldShowStudentWaveform ? (labelHeight * 2 + gapHeight + scrollbarHeight) : (labelHeight + scrollbarHeight));
  const singleWaveformHeight = availableHeight;
  const dualWaveformHeight = Math.floor(availableHeight / 2); // Equal heights for both

  // Full screen vs regular mode styling
  const containerClass = isFullScreen
    ? "w-full flex flex-col overflow-hidden bg-transparent"
    : "w-full flex flex-col border border-slate-200 rounded-lg overflow-hidden bg-white";

  // Calculate progress for waveform sync (0-1)
  const progress = referenceDuration && referenceDuration > 0 
    ? currentTime / referenceDuration 
    : 0;

  // Keep pitch view in a human-voice-friendly range to avoid vertical compression.
  const graphMaxFreq = 600;

  return (
    <div className={`${containerClass} mb-4`} style={{ position: 'relative' }}>
      {/* Pitch Contour Section */}
      <div
        className='w-full overflow-hidden relative'
        style={{
          zIndex: 1,
          height: isFullScreen ? `${height}px` : undefined,
        }}
      >
        <LivePitchGraph
          referencePitch={referencePitch}
          studentPitch={studentPitch}
          isRecording={isRecording}
          isPlaying={isPlaying}
          currentTime={currentTime}
          referenceDuration={referenceDuration}
          height={isFullScreen ? height : pitchHeight}
          isFullScreen={isFullScreen}
          markers={markers}
          onMarkerClick={onMarkerClick}
          fixedYAxis={isFullScreen}
          minFreq={60}
          maxFreq={graphMaxFreq}
          zoomLevel={zoomLevel}
          onZoomChange={onZoomChange}
        />
      </div>

      {/* Waveform Section (40% height) - Hidden in full-screen mode */}
      {!isFullScreen && (
      <div
        className='w-full overflow-hidden relative'
        style={{
          height: `${waveformHeight}px`,
          minHeight: `${waveformHeight}px`,
          maxHeight: `${waveformHeight}px`,
          zIndex: 0,
        }}
      >
        <div className="flex flex-col h-full">
          {/* Two waveforms: Reference + Student (only show student during practice or after recording) */}
          {referenceAudioUrl && shouldShowStudentWaveform ? (
            <>
              {/* Reference Waveform */}
              <div className="flex-shrink-0">
                <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50">
                  Reference
                </div>
                <div style={{ height: `${dualWaveformHeight}px`, minHeight: `${dualWaveformHeight}px`, maxHeight: `${dualWaveformHeight}px`, overflow: 'hidden' }}>
                  <Waveform
                    url={referenceAudioUrl}
                    height={dualWaveformHeight}
                    waveColor="#94a3b8"
                    progressColor="#3b82f6"
                    interact={true}
                    onSeek={onSeek}
                    syncProgress={progress}
                    showControls={false}
                  />
                </div>
              </div>

              {/* Gap between waveforms */}
              <div className="h-2 border-b border-slate-200 flex-shrink-0"></div>

              {/* Student Waveform */}
              <div className="flex-shrink-0">
                <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50">
                  Your Recording
                </div>
                <div style={{ height: `${dualWaveformHeight}px`, minHeight: `${dualWaveformHeight}px`, maxHeight: `${dualWaveformHeight}px`, overflow: 'hidden' }}>
                  <Waveform
                    url={studentAudioUrl || undefined}
                    blob={studentAudioBlob || undefined}
                    height={dualWaveformHeight}
                    waveColor="#94a3b8"
                    progressColor="#ef4444"
                    interact={true}
                    onSeek={onSeek}
                    syncProgress={progress}
                    showControls={false}
                  />
                </div>
              </div>
            </>
          ) : (
            /* Single waveform: Reference only */
            referenceAudioUrl && (
              <div className="flex-1 flex flex-col">
                <div className="px-2 py-1 text-xs text-slate-500 bg-slate-50 flex-shrink-0">
                  Reference
                </div>
                <div className="flex-1" style={{ minHeight: `${singleWaveformHeight}px`, maxHeight: `${singleWaveformHeight}px`, overflow: 'hidden' }}>
                  <Waveform
                    url={referenceAudioUrl}
                    height={singleWaveformHeight}
                    waveColor="#94a3b8"
                    progressColor="#3b82f6"
                    interact={true}
                    onSeek={onSeek}
                    syncProgress={progress}
                    showControls={false}
                  />
                </div>
              </div>
            )
          )}

          {/* Shared scrollbar/scrubber at the bottom of both waveforms */}
          {referenceAudioUrl && (
            <div className="h-8 border-t border-slate-200 bg-slate-50 flex items-center px-4 flex-shrink-0">
              <div 
                className="flex-1 relative h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer group"
                onClick={(e) => {
                  if (onSeek && referenceDuration && referenceDuration > 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
                    onSeek(newProgress);
                  }
                }}
              >
                <div 
                  className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${progress * 100}%` }}
                ></div>
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-slate-800 rounded-full z-10 transition-all group-hover:w-2 group-hover:h-5"
                  style={{ left: `${progress * 100}%`, marginLeft: '-2px' }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

export default CombinedWaveformPitch;
