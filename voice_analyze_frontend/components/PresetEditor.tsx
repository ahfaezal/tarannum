import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, X } from 'lucide-react';
import { referenceLibraryService, ReferenceAudio, TextSegment } from '../services/referenceLibraryService';
import TextAlignmentEditor from './TextAlignmentEditor';
import { extractReferencePitch } from '../services/apiService';
import { PitchData } from '../types';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';

interface PresetEditorProps {
  reference?: ReferenceAudio;
  existingPreset?: ReferenceAudio;
  onSave: (referenceId: string, title: string, textSegments: TextSegment[], maqam?: string) => Promise<void>;
  onCancel: () => void;
}

const PresetEditor: React.FC<PresetEditorProps> = ({
  reference,
  existingPreset,
  onSave,
  onCancel,
}) => {
  const [step, setStep] = useState<'select' | 'edit'>(existingPreset ? 'edit' : 'select');
  const [selectedReference, setSelectedReference] = useState<ReferenceAudio | null>(reference || existingPreset || null);
  const [references, setReferences] = useState<ReferenceAudio[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(existingPreset?.title || '');
  const [maqam, setMaqam] = useState(existingPreset?.maqam || '');
  const [textSegments, setTextSegments] = useState<TextSegment[]>(existingPreset?.text_segments || []);
  const [referencePitch, setReferencePitch] = useState<PitchData[]>([]);
  const [loadingPitch, setLoadingPitch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const [saveConfirm, setSaveConfirm] = useState<{ isOpen: boolean }>({ isOpen: false });

  useEffect(() => {
    if (!existingPreset) {
      loadReferences();
    }
  }, []);

  useEffect(() => {
    if (selectedReference && step === 'edit') {
      loadReferencePitch();
      loadAudioBlobUrl();
    }
    
    // Cleanup blob URL when component unmounts or reference changes
    return () => {
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
        setAudioBlobUrl(null);
      }
    };
  }, [selectedReference, step]);

  const loadAudioBlobUrl = async () => {
    if (!selectedReference) return;
    
    try {
      setLoadingAudio(true);
      // Clean up previous blob URL
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
        setAudioBlobUrl(null);
      }
      
      const blobUrl = await referenceLibraryService.getReferenceAudioBlobUrl(selectedReference.id);
      setAudioBlobUrl(blobUrl);
    } catch (error) {
      console.error('Failed to load reference audio blob URL:', error);
      // Don't set blob URL if it fails - TextAlignmentEditor will handle empty URL
    } finally {
      setLoadingAudio(false);
    }
  };

  const loadReferences = async () => {
    try {
      setLoading(true);
      const refs = await referenceLibraryService.getReferences();
      setReferences(refs);
    } catch (error) {
      console.error('Failed to load references:', error);
      setAlertModal({ isOpen: true, message: 'Failed to load references. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const loadReferencePitch = async () => {
    if (!selectedReference) return;
    
    try {
      setLoadingPitch(true);
      const audioUrl = referenceLibraryService.getReferenceAudioUrl(selectedReference.id);
      const pitchData = await extractReferencePitch(undefined, 'reference.mp3', selectedReference.id);
      setReferencePitch(pitchData.reference || []);
    } catch (error) {
      console.error('Failed to load pitch data:', error);
      // Continue without pitch data
    } finally {
      setLoadingPitch(false);
    }
  };

  const handleSelectReference = (ref: ReferenceAudio) => {
    setSelectedReference(ref);
    setTitle(ref.title);
    setStep('edit');
  };

  const handleSegmentsChange = (segments: TextSegment[]) => {
    setTextSegments(segments);
  };

  const handleSave = () => {
    if (!selectedReference) {
      setAlertModal({ isOpen: true, message: 'Please select a reference audio' });
      return;
    }
    if (!title.trim()) {
      setAlertModal({ isOpen: true, message: 'Please enter a title for the preset' });
      return;
    }
    if (textSegments.length === 0) {
      setSaveConfirm({ isOpen: true });
      return;
    }
    performSave();
  };

  const performSave = async () => {

    try {
      setSaving(true);
      await onSave(selectedReference.id, title.trim(), textSegments, maqam.trim() || undefined);
    } catch (error) {
      // Error already handled in parent
    } finally {
      setSaving(false);
    }
  };

  if (step === 'select') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Select Reference Audio</h2>
          <p className="text-slate-600">Choose a reference audio to create a preset from</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-slate-500">Loading references...</div>
          </div>
        ) : references.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
            <p className="text-slate-500 mb-4">No references available.</p>
            <p className="text-sm text-slate-400">
              Please upload a reference audio first in the Training Studio.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {references.map((ref) => (
              <button
                key={ref.id}
                onClick={() => handleSelectReference(ref)}
                className="text-left p-4 bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-emerald-300 transition-all"
              >
                <h3 className="font-semibold text-slate-800 mb-1">{ref.title}</h3>
                <p className="text-sm text-slate-500">
                  Duration: {Math.floor(ref.duration / 60)}:{(ref.duration % 60).toFixed(0).padStart(2, '0')}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!selectedReference) {
    return null;
  }

  // Use blob URL if available, otherwise empty string (will show loading or error)
  const audioUrl = audioBlobUrl || "";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {existingPreset ? 'Edit Preset' : 'Create New Preset'}
        </h2>
      </div>

      <div className="space-y-6">
        {/* Preset Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Preset Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g., Al-Fatihah - Ust Hazman"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Maqam (Optional)
              </label>
              <input
                type="text"
                value={maqam}
                onChange={(e) => setMaqam(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g., Bayati, Rast"
              />
            </div>
            <div>
              <p className="text-sm text-slate-500">
                Reference: {selectedReference.title} ({Math.floor(selectedReference.duration / 60)}:{(selectedReference.duration % 60).toFixed(0).padStart(2, '0')})
              </p>
            </div>
          </div>
        </div>

        {/* Text Alignment Editor */}
        {loadingPitch || loadingAudio ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
            <div className="text-slate-500">Loading audio and pitch data...</div>
          </div>
        ) : !audioUrl ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
            <div className="text-red-500">Failed to load audio. Please try again.</div>
          </div>
        ) : (
          <TextAlignmentEditor
            audioUrl={audioUrl}
            duration={selectedReference.duration}
            referencePitch={referencePitch}
            onSegmentsChange={handleSegmentsChange}
            initialSegments={textSegments}
          />
        )}

        {/* Save/Cancel Buttons */}
        <div className="flex items-center justify-end gap-4">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            <X size={18} />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Preset'}
          </button>
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        title="Error"
        message={alertModal.message}
        variant="error"
        onClose={() => setAlertModal({ isOpen: false, message: '' })}
      />

      {/* Save Confirmation Modal */}
      <ConfirmModal
        isOpen={saveConfirm.isOpen}
        title="No Text Segments"
        message="No text segments added. Save preset without text segments?"
        confirmText="Save"
        cancelText="Cancel"
        variant="warning"
        onConfirm={() => {
          setSaveConfirm({ isOpen: false });
          performSave();
        }}
        onCancel={() => setSaveConfirm({ isOpen: false })}
      />
    </div>
  );
};

export default PresetEditor;

