import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, X } from 'lucide-react';
import { getQariContent, updateQariContent, QariContent } from '../services/platformService';
import { referenceLibraryService, TextSegment } from '../services/referenceLibraryService';
import TextAlignmentEditor from './TextAlignmentEditor';
import { extractReferencePitch } from '../services/apiService';
import { PitchData } from '../types';

const QariContentEditor: React.FC = () => {
  const navigate = useNavigate();
  const { contentId } = useParams<{ contentId: string }>();
  const [content, setContent] = useState<QariContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [surahNumber, setSurahNumber] = useState<string>('');
  const [surahName, setSurahName] = useState<string>('');
  const [ayahNumber, setAyahNumber] = useState<string>('');
  const [maqam, setMaqam] = useState<string>('');
  
  // Text segments state
  const [textSegments, setTextSegments] = useState<TextSegment[]>([]);
  
  // Audio and pitch data
  const [referenceAudio, setReferenceAudio] = useState<any>(null);
  const [referencePitch, setReferencePitch] = useState<PitchData[]>([]);
  const [loadingPitch, setLoadingPitch] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  useEffect(() => {
    if (contentId) {
      loadContent();
    }
  }, [contentId]);

  useEffect(() => {
    if (content && content.reference_id) {
      loadReferenceAudio();
      loadReferencePitch();
      loadAudioBlobUrl();
    }
    
    return () => {
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
        setAudioBlobUrl(null);
      }
    };
  }, [content]);

  const loadContent = async () => {
    try {
      setLoading(true);
      const contentData = await getQariContent();
      const foundContent = contentData.content.find((c: QariContent) => c.id === contentId);
      
      if (!foundContent) {
        setError('Content not found');
        return;
      }
      
      setContent(foundContent);
      setSurahNumber(foundContent.surah_number?.toString() || '');
      setSurahName(foundContent.surah_name || '');
      setAyahNumber(foundContent.ayah_number?.toString() || '');
      setMaqam(foundContent.maqam || '');
      
      // Load existing text segments if available
      if (foundContent.text_segments && foundContent.text_segments.length > 0) {
        const segments = foundContent.text_segments.map((seg: any) => ({
          text: seg.text || '',
          start: seg.start || 0,
          end: seg.end || 0,
        }));
        // Sort by start time
        segments.sort((a, b) => (a.start || 0) - (b.start || 0));
        setTextSegments(segments);
      } else {
        setTextSegments([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceAudio = async () => {
    if (!content?.reference_id) return;
    
    try {
      const refs = await referenceLibraryService.getReferences();
      const ref = refs.find(r => r.id === content.reference_id);
      if (ref) {
        setReferenceAudio(ref);
      }
    } catch (error) {
      console.error('Failed to load reference audio:', error);
    }
  };

  const loadAudioBlobUrl = async () => {
    if (!content?.reference_id) return;
    
    try {
      setLoadingAudio(true);
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
        setAudioBlobUrl(null);
      }
      
      const blobUrl = await referenceLibraryService.getReferenceAudioBlobUrl(content.reference_id);
      setAudioBlobUrl(blobUrl);
    } catch (error) {
      console.error('Failed to load reference audio blob URL:', error);
    } finally {
      setLoadingAudio(false);
    }
  };

  const loadReferencePitch = async () => {
    if (!content?.reference_id) return;
    
    try {
      setLoadingPitch(true);
      const pitchData = await extractReferencePitch(undefined, 'reference.mp3', content.reference_id);
      setReferencePitch(pitchData.reference || []);
    } catch (error) {
      console.error('Failed to load pitch data:', error);
    } finally {
      setLoadingPitch(false);
    }
  };

  const handleSegmentsChange = (segments: TextSegment[]) => {
    setTextSegments(segments);
  };

  const handleSave = async () => {
    if (!contentId || !content?.reference_id) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // First, save the metadata (surah/ayah/maqam)
      await updateQariContent(
        contentId,
        {
          surah_number: surahNumber ? parseInt(surahNumber) : undefined,
          surah_name: surahName || undefined,
          ayah_number: ayahNumber ? parseInt(ayahNumber) : undefined,
          maqam: maqam || undefined,
        }
      );
      
      // Then, save text segments using the preset endpoint
      if (textSegments.length > 0) {
        // Check if reference is already a preset
        const refs = await referenceLibraryService.getReferences();
        const ref = refs.find(r => r.id === content.reference_id);
        
        if (ref?.is_preset) {
          // Update existing preset
          await referenceLibraryService.updatePreset(
            content.reference_id,
            textSegments,
            ref.title || content.reference_title || 'Untitled',
            maqam || undefined
          );
        } else {
          // Create new preset
          await referenceLibraryService.createPreset(
            content.reference_id,
            content.reference_title || 'Untitled',
            textSegments,
            maqam || undefined
          );
        }
      }
      
      // Navigate back to dashboard
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading content...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-6 max-w-md w-full">
          <div className="flex items-center gap-3 text-red-700 mb-2">
            <X className="w-5 h-5" />
            <h3 className="font-semibold text-lg">Error</h3>
          </div>
          <p className="text-slate-600 mb-4">{error || 'Content not found'}</p>
          <button
            onClick={handleCancel}
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const audioUrl = audioBlobUrl || '';

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          Edit Content Settings
        </h2>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Content Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Surah Number
              </label>
              <input
                type="number"
                min="1"
                max="114"
                value={surahNumber}
                onChange={(e) => setSurahNumber(e.target.value)}
                placeholder="Enter surah number (1-114)"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Surah Name (Optional)
              </label>
              <input
                type="text"
                value={surahName}
                onChange={(e) => setSurahName(e.target.value)}
                placeholder="Enter surah name (e.g., Al-Fatiha, Al-Baqarah)"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ayah Number (Optional)
              </label>
              <input
                type="number"
                min="1"
                value={ayahNumber}
                onChange={(e) => setAyahNumber(e.target.value)}
                placeholder="Enter ayah number"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave empty if this reference covers multiple ayahs or the entire surah.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Maqam (Optional)
              </label>
              <input
                type="text"
                value={maqam}
                onChange={(e) => setMaqam(e.target.value)}
                placeholder="e.g., Bayati, Rast"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            {referenceAudio && (
              <div>
                <p className="text-sm text-slate-500">
                  Reference: {referenceAudio.title || content.reference_title || 'Untitled'} 
                  ({Math.floor((referenceAudio.duration || 0) / 60)}:{(Math.floor((referenceAudio.duration || 0) % 60)).toString().padStart(2, '0')})
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Audio and Pitch Visualization */}
        {content && content.reference_id && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {loadingPitch || loadingAudio || !referenceAudio || !audioUrl ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <div className="text-slate-500">Loading audio and pitch data...</div>
              </div>
            ) : (
              <TextAlignmentEditor
                audioUrl={audioUrl}
                duration={referenceAudio.duration || 0}
                referencePitch={referencePitch}
                onSegmentsChange={handleSegmentsChange}
                initialSegments={textSegments}
              />
            )}
          </div>
        )}

        {/* Save/Cancel Buttons */}
        <div className="flex items-center justify-end gap-4">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            <X size={18} />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QariContentEditor;
