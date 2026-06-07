import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { TextSegment } from '../services/referenceLibraryService';
import Waveform from './Waveform';
import LivePitchGraph from './LivePitchGraph';
import { PitchData } from '../types';
import AlertModal from './AlertModal';

interface TextAlignmentEditorProps {
  audioUrl: string;
  duration: number;
  referencePitch?: PitchData[];
  onSegmentsChange: (segments: TextSegment[]) => void;
  initialSegments?: TextSegment[];
}

const TextAlignmentEditor: React.FC<TextAlignmentEditorProps> = ({
  audioUrl,
  duration,
  referencePitch = [],
  onSegmentsChange,
  initialSegments = [],
}) => {
  // Initialize segments and sort by start time (ascending - smallest first)
  const [segments, setSegments] = useState<TextSegment[]>(() => {
    const sorted = [...initialSegments].sort((a, b) => (a.start || 0) - (b.start || 0));
    return sorted;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState<number>(0);
  const [editEnd, setEditEnd] = useState<number>(0);
  const [markingStart, setMarkingStart] = useState(false);
  const [markingEnd, setMarkingEnd] = useState(false);
  const [tempStart, setTempStart] = useState(0);
  const [tempEnd, setTempEnd] = useState(0);
  const [tempText, setTempText] = useState('');
  const [showTextModal, setShowTextModal] = useState(false);
  const [pendingSegment, setPendingSegment] = useState<{ start: number; end: number } | null>(null);
  const [segmentText, setSegmentText] = useState('');
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<any>(null);
  const onSegmentsChangeRef = useRef(onSegmentsChange);
  const prevInitialSegmentsRef = useRef<string>('');

  // Keep the callback ref up to date
  useEffect(() => {
    onSegmentsChangeRef.current = onSegmentsChange;
  }, [onSegmentsChange]);

  // Update segments when initialSegments actually change (deep comparison)
  useEffect(() => {
    // Stringify to compare actual content, not reference
    // Handle null/undefined explicitly
    const safeInitialSegments = initialSegments || [];
    const currentInitialStr = JSON.stringify(safeInitialSegments);
    
    // Only update if the content actually changed
    if (currentInitialStr !== prevInitialSegmentsRef.current) {
      prevInitialSegmentsRef.current = currentInitialStr;
      
      if (safeInitialSegments.length > 0) {
        const sorted = [...safeInitialSegments].sort((a, b) => (a.start || 0) - (b.start || 0));
        setSegments(sorted);
      } else {
        setSegments([]);
      }
    }
  }, [initialSegments]);

  // Call onSegmentsChange only when segments actually change (not when callback reference changes)
  useEffect(() => {
    onSegmentsChangeRef.current(segments);
  }, [segments]);

  // Focus text input when modal opens
  useEffect(() => {
    if (showTextModal && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [showTextModal]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const handleSeek = (progress: number) => {
    if (audioRef.current && duration > 0) {
      const time = progress * duration;
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMarkStart = () => {
    setTempStart(currentTime);
    setMarkingStart(false);
    setMarkingEnd(true);
  };

  const handleMarkEnd = () => {
    if (tempStart >= currentTime) {
      setAlertModal({ isOpen: true, message: 'End time must be after start time' });
      return;
    }
    setTempEnd(currentTime);
    setMarkingEnd(false);
    // Show modal for text input
    setPendingSegment({ start: tempStart, end: currentTime });
    setSegmentText('');
    setShowTextModal(true);
  };

  const handleConfirmSegment = () => {
    if (pendingSegment && segmentText.trim()) {
      addSegment(segmentText.trim(), pendingSegment.start, pendingSegment.end);
    }
    setShowTextModal(false);
    setPendingSegment(null);
    setSegmentText('');
    setTempStart(0);
    setTempEnd(0);
  };

  const handleCancelSegment = () => {
    setShowTextModal(false);
    setPendingSegment(null);
    setSegmentText('');
    setTempStart(0);
    setTempEnd(0);
  };

  const addSegment = (text: string, start: number, end: number) => {
    const newSegment: TextSegment = { text, start, end };
    // Sort by start time (ascending - smallest first)
    const updated = [...segments, newSegment].sort((a, b) => (a.start || 0) - (b.start || 0));
    setSegments(updated);
  };

  const handleDeleteSegment = (index: number) => {
    const updated = segments.filter((_, i) => i !== index);
    setSegments(updated);
  };

  const handleEditSegment = (index: number) => {
    setEditingIndex(index);
    setEditText(segments[index].text);
    setEditStart(segments[index].start);
    setEditEnd(segments[index].end);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null) {
      // Validate: end must be greater than start
      if (editEnd <= editStart) {
        setAlertModal({ 
          isOpen: true, 
          message: 'End time must be greater than start time.' 
        });
        return;
      }
      
      // Validate: times must be within audio duration
      if (editStart < 0 || editEnd > duration) {
        setAlertModal({ 
          isOpen: true, 
          message: `Times must be between 0 and ${formatTime(duration)}.` 
        });
        return;
      }
      
      const updated = [...segments];
      updated[editingIndex] = { 
        ...updated[editingIndex], 
        text: editText,
        start: editStart,
        end: editEnd
      };
      // Sort by start time (ascending - smallest first)
      const sorted = updated.sort((a, b) => (a.start || 0) - (b.start || 0));
      setSegments(sorted);
      setEditingIndex(null);
      setEditText('');
      setEditStart(0);
      setEditEnd(0);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditText('');
    setEditStart(0);
    setEditEnd(0);
  };

  const handleSeekToSegment = (start: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = start;
      setCurrentTime(start);
    }
  };

  return (
    <div className="space-y-6">
      {/* Audio Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
            </button>
            <button
              onClick={handleStop}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-600 hover:bg-slate-700 text-white transition-colors"
            >
              <Square size={14} />
            </button>
          </div>
          <div className="text-sm font-mono text-slate-600">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        {/* Waveform */}
        <div className="mb-4">
          <Waveform
            url={audioUrl}
            height={100}
            interact={true}
            onSeek={handleSeek}
            syncProgress={duration > 0 ? currentTime / duration : null}
            showControls={false}
          />
        </div>

        {/* Pitch Contour */}
        {referencePitch.length > 0 && (
          <div className="mb-4" style={{ height: '200px' }}>
            <LivePitchGraph
              referencePitch={referencePitch}
              studentPitch={[]}
              isRecording={false}
              isPlaying={isPlaying}
              currentTime={currentTime}
              referenceDuration={duration}
              height={200}
            />
          </div>
        )}

        {/* Marking Controls */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (!markingStart && !markingEnd) {
                setMarkingStart(true);
                handleMarkStart();
              } else if (markingEnd) {
                handleMarkEnd();
              }
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {markingEnd ? 'Mark End' : 'Mark Start'}
          </button>
          {markingEnd && (
            <button
              onClick={() => {
                setMarkingEnd(false);
                setTempStart(0);
                setTempEnd(0);
              }}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Text Segments List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          Text Segments ({segments.length})
        </h3>

        {segments.length === 0 ? (
          <p className="text-slate-500 text-center py-8">
            No segments yet. Use "Mark Start" and "Mark End" to create segments.
          </p>
        ) : (
          <div className="space-y-3">
            {[...segments].sort((a, b) => (a.start || 0) - (b.start || 0)).map((segment, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1">
                  {editingIndex === index ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        dir="auto"
                        className="w-full p-2 border border-slate-300 rounded-lg text-lg font-medium"
                        style={{ fontFamily: 'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif' }}
                        rows={2}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Start Time (seconds)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={duration}
                            value={editStart}
                            onChange={(e) => setEditStart(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            End Time (seconds)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={duration}
                            value={editEnd}
                            onChange={(e) => setEditEnd(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        dir="rtl"
                        className="text-lg font-medium text-slate-800 mb-2"
                        style={{ fontFamily: 'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif' }}
                      >
                        {segment.text}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                        <button
                          onClick={() => handleSeekToSegment(segment.start)}
                          className="text-blue-600 hover:text-blue-700 underline"
                        >
                          Jump to
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {editingIndex !== index && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditSegment(index)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteSegment(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Text Input Modal */}
      {showTextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Enter Arabic Text</h2>
              <button
                onClick={handleCancelSegment}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Enter Arabic text for this segment:
                </label>
                {pendingSegment && (
                  <p className="text-xs text-slate-500 mb-3">
                    Time range: {formatTime(pendingSegment.start)} - {formatTime(pendingSegment.end)}
                  </p>
                )}
                <textarea
                  ref={textInputRef}
                  value={segmentText}
                  onChange={(e) => setSegmentText(e.target.value)}
                  dir="auto"
                  className="w-full p-3 border border-slate-300 rounded-lg text-lg font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  style={{ 
                    fontFamily: 'Arial, "Arabic Typesetting", "Traditional Arabic", sans-serif',
                    minHeight: '100px'
                  }}
                  placeholder="اكتب النص العربي هنا..."
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      handleConfirmSegment();
                    } else if (e.key === 'Escape') {
                      handleCancelSegment();
                    }
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={handleCancelSegment}
                className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSegment}
                disabled={!segmentText.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        title="Error"
        message={alertModal.message}
        variant="error"
        onClose={() => setAlertModal({ isOpen: false, message: '' })}
      />
    </div>
  );
};

export default TextAlignmentEditor;

