import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';

interface WaveformProps {
  url?: string | null;
  blob?: Blob | null;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  interact?: boolean;
  onReady?: (ws: WaveSurfer) => void;
  onFinish?: () => void;
  regions?: { start: number; end: number; color: string }[];
  showControls?: boolean;
  title?: string;
  onSeek?: (progress: number) => void;
  syncProgress?: number | null; // External progress to sync to (0-1)
  isSyncing?: boolean; // Flag to prevent sync loops
}

const Waveform: React.FC<WaveformProps> = ({ 
  url, 
  blob, 
  height = 80, 
  waveColor = '#94a3b8', 
  progressColor = '#059669',
  interact = true,
  onReady,
  onFinish,
  regions = [],
  showControls = false,
  title,
  onSeek,
  syncProgress = null,
  isSyncing = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const updateIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: waveColor,
      progressColor: progressColor,
      cursorColor: '#333',
      barWidth: 2,
      barRadius: 3,
      height: height,
      normalize: true,
      minPxPerSec: 50,
      interact: interact,
    });

    wavesurferRef.current = ws;

    ws.on('ready', () => {
      try {
        const dur = ws.getDuration();
        setDuration(dur);
        if (onReady) onReady(ws);
      } catch (e: any) {
        // Ignore AbortError during cleanup
        if (e?.name !== 'AbortError' && e?.message !== 'BodyStreamBuffer was aborted') {
          console.warn('Error in ready handler:', e);
        }
      }
    });

    ws.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(ws.getDuration());
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      if (onFinish) onFinish();
    });

    ws.on('play', () => {
      setIsPlaying(true);
      // Start updating current time during playback
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      updateIntervalRef.current = window.setInterval(() => {
        try {
          if (wavesurferRef.current) {
            const current = wavesurferRef.current.getCurrentTime();
            setCurrentTime(current);
          }
        } catch (e: any) {
          // Ignore AbortError and other errors during cleanup
          if (e?.name !== 'AbortError' && e?.message !== 'BodyStreamBuffer was aborted') {
            console.warn('Progress tracking error:', e);
          }
        }
      }, 100); // Update every 100ms for smooth progress
    });

    ws.on('pause', () => {
      setIsPlaying(false);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      // Update time one more time when paused
      try {
        if (wavesurferRef.current) {
          setCurrentTime(wavesurferRef.current.getCurrentTime());
        }
      } catch (e: any) {
        // Ignore AbortError during cleanup
        if (e?.name !== 'AbortError' && e?.message !== 'BodyStreamBuffer was aborted') {
          console.warn('Error getting current time:', e);
        }
      }
    });

    // Handle seeking (when user clicks on waveform)
    ws.on('interaction', () => {
      try {
        if (wavesurferRef.current && !isSyncing) {
          const current = wavesurferRef.current.getCurrentTime();
          const duration = wavesurferRef.current.getDuration();
          setCurrentTime(current);
          // Notify parent of seek (progress 0-1)
          if (onSeek && duration > 0) {
            onSeek(current / duration);
          }
        }
      } catch (e: any) {
        // Ignore AbortError during cleanup
        if (e?.name !== 'AbortError' && e?.message !== 'BodyStreamBuffer was aborted') {
          console.warn('Error handling interaction:', e);
        }
      }
    });

    // Handle errors gracefully
    ws.on('error', (error: any) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error?.name !== 'AbortError') {
        console.warn('WaveSurfer error:', error);
      }
    });

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      // Stop playback before destroying
      try {
        if (ws) {
          ws.stop();
          ws.destroy();
        }
      } catch (e: any) {
        // Ignore AbortError - it's expected during cleanup
        if (e?.name !== 'AbortError' && e?.message !== 'BodyStreamBuffer was aborted') {
          console.warn('Error destroying WaveSurfer:', e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, waveColor, progressColor, interact]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    // Reset time when loading new audio
    setCurrentTime(0);
    setDuration(0);

    let blobUrl: string | null = null;
    let isCancelled = false;

    // Load audio (handle both promise and non-promise returns)
    const loadPromise = (() => {
      try {
        if (url) {
          const result = ws.load(url);
          return result instanceof Promise ? result : Promise.resolve();
        } else if (blob) {
          blobUrl = URL.createObjectURL(blob);
          const result = ws.load(blobUrl);
          return result instanceof Promise ? result : Promise.resolve();
        }
        return Promise.resolve();
      } catch (error: any) {
        return Promise.reject(error);
      }
    })();

    loadPromise.catch((error: any) => {
      // Ignore AbortError - it's expected during component cleanup
      if (error?.name !== 'AbortError' && !isCancelled) {
        console.warn('Error loading audio:', error);
      }
      if (blobUrl && !isCancelled) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    });

    return () => {
      isCancelled = true;
      // Stop any ongoing load operation
      try {
        const currentWs = wavesurferRef.current;
        if (currentWs && typeof currentWs.stop === 'function') {
          currentWs.stop();
        }
      } catch (e) {
        // Ignore errors during cleanup - instance might be destroyed
        console.debug('Error stopping WaveSurfer during cleanup:', e);
      }
      // Clean up blob URL if created
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [url, blob]);

  // Sync to external progress (for synchronized scrubbing)
  // This is used when the other waveform seeks, to keep them in sync
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || syncProgress === null || isSyncing) return;
    
    // Wait for waveform to be ready
    const checkAndSync = () => {
      try {
        const currentWs = wavesurferRef.current;
        if (!currentWs) return;
        
        const dur = currentWs.getDuration();
        if (dur > 0) {
          const currentProgress = currentWs.getCurrentTime() / dur;
          
          // Only sync if there's a meaningful difference (avoid micro-adjustments and loops)
          if (Math.abs(currentProgress - syncProgress) > 0.01) {
            currentWs.seekTo(syncProgress);
            setCurrentTime(syncProgress * dur);
          }
        }
      } catch (e) {
        // Waveform might not be ready yet, ignore
        console.debug('Waveform not ready for sync:', e);
      }
    };
    
    // Try immediately, and also wait for ready event if needed
    checkAndSync();
    
    // If duration is 0, wait for ready event
    let readyHandler: (() => void) | null = null;
    if (duration === 0) {
      readyHandler = () => {
        checkAndSync();
        // Use un() method to remove listener (WaveSurfer.js API)
        const currentWs = wavesurferRef.current;
        if (currentWs && typeof currentWs.un === 'function' && readyHandler) {
          try {
            currentWs.un('ready', readyHandler);
          } catch (e) {
            // Ignore errors during cleanup
            console.debug('Error removing ready listener:', e);
          }
        }
      };
      
      if (ws && typeof ws.on === 'function') {
        ws.on('ready', readyHandler);
      }
    }
    
    return () => {
      // Safely remove listener - check if instance exists and method is available
      const currentWs = wavesurferRef.current;
      if (currentWs && typeof currentWs.un === 'function' && readyHandler) {
        try {
          currentWs.un('ready', readyHandler);
        } catch (e) {
          // Ignore errors during cleanup - instance might already be destroyed
          console.debug('Error removing ready listener in cleanup:', e);
        }
      }
    };
  }, [syncProgress, isSyncing, duration]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    
    if (isPlaying) {
      ws.pause();
    } else {
      ws.play();
    }
  };

  const handleStop = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.stop();
    setCurrentTime(0);
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
  };

  const handleRepeat = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.seekTo(0);
    setCurrentTime(0);
    ws.play();
  };

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full" />
      {showControls && (
        <div className="mt-4 space-y-3">
          {title && (
            <div className="text-sm font-medium text-slate-700 text-center">{title}</div>
          )}
          <div className="flex items-center justify-center gap-2">
            {/* Play/Pause Button */}
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>

            {/* Stop Button */}
            <button
              onClick={handleStop}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-600 hover:bg-slate-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95"
              title="Stop"
            >
              <Square size={14} fill="currentColor" />
            </button>

            {/* Repeat Button */}
            <button
              onClick={handleRepeat}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all hover:scale-105 active:scale-95"
              title="Repeat"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Time Display */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-2">
            <span>{formatTime(currentTime)}</span>
            <span className="text-slate-400">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Progress Bar (additional visual feedback) */}
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-100"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Waveform;