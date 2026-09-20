import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Users, BookOpen, CheckCircle, XCircle, UserPlus, Save, X, BarChart3, Activity, TrendingUp, FileAudio, UserCheck, Monitor, HardDrive, PlayCircle, Award, Download, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { referenceLibraryService, ReferenceAudio, TextSegment } from '../services/referenceLibraryService';
import { 
  listAllUsers, getUser, updateUser, createUser, deleteUser, approveQari, AdminUser, 
  getPlatformStatistics, PlatformStatistics, getDetailedUsers, DetailedUser,
  getAllSessions, DetailedSession, getUsageMetrics, UsageMetrics, mergeStudentAccount
} from '../services/platformService';
import PresetEditor from '../components/PresetEditor';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import { getScoringCapacity, getScoringOperations, retryScoringJob, ScoringCapacity, ScoringOperations } from '../services/apiService';
import PasswordInput from '../components/PasswordInput';
import { CertificateSummary, QariFlowPreview, StudentFlowPreview, competencyGradeForScore, downloadCertificate, getAdminQariFlowPreview, getAdminStudentFlowPreview, getAdminUserCertificates, getCertificatePdfBlob } from '../services/certificationService';

const QARI_PREVIEW_RUBRIC = [
  { key: 'lafaz_completion', label: 'Kelengkapan dan susunan lafaz', link: 'Completion • Voice coverage', weight: 15 },
  { key: 'pronunciation', label: 'Ketepatan lafaz dan sebutan', link: 'Recitation validity', weight: 20 },
  { key: 'melodic_contour', label: 'Bentuk melodi keseluruhan', link: 'Melodic contour', weight: 15 },
  { key: 'contour_detail', label: 'Perincian lenggok setiap frasa', link: 'Contour detail • Melody similarity', weight: 10 },
  { key: 'pitch_control', label: 'Kedudukan dan kawalan nada', link: 'Pitch position', weight: 10 },
  { key: 'timing', label: 'Tempo, jeda dan kesinambungan', link: 'Timing consistency', weight: 10 },
  { key: 'vocal_breath', label: 'Kestabilan suara dan kawalan nafas', link: 'Vocal stability', weight: 10 },
  { key: 'overall_azan', label: 'Kesesuaian persembahan azan keseluruhan', link: 'Pertimbangan profesional qari', weight: 10 },
] as const;

type TabType = 'presets' | 'users' | 'monitoring';

interface AdminModeProps {
  view?: 'presets' | 'users' | 'monitoring';
}

const AdminMode: React.FC<AdminModeProps> = ({ view = 'presets' }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>(view);
  
  // Update activeTab when view prop changes
  useEffect(() => {
    setActiveTab(view);
  }, [view]);
  
  // Preset Manager State
  const [presets, setPresets] = useState<ReferenceAudio[]>([]);
  const [references, setReferences] = useState<ReferenceAudio[]>([]);
  const [presetLoading, setPresetLoading] = useState(true);
  const [editingPreset, setEditingPreset] = useState<ReferenceAudio | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedReference, setSelectedReference] = useState<ReferenceAudio | null>(null);

  // User Management State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userFilter, setUserFilter] = useState<string>('all');
  const [certificateUser, setCertificateUser] = useState<AdminUser | null>(null);
  const [userCertificates, setUserCertificates] = useState<CertificateSummary[]>([]);
  const [certificatesLoading, setCertificatesLoading] = useState(false);
  const [certificatesError, setCertificatesError] = useState('');
  const [previewCertificate, setPreviewCertificate] = useState<CertificateSummary | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const certificateRequestId = useRef(0);
  const [flowPreviewUser, setFlowPreviewUser] = useState<AdminUser | null>(null);
  const [flowPreview, setFlowPreview] = useState<StudentFlowPreview | null>(null);
  const [flowPreviewLoading, setFlowPreviewLoading] = useState(false);
  const [flowPreviewError, setFlowPreviewError] = useState('');
  const [qariFlowPreviewUser, setQariFlowPreviewUser] = useState<AdminUser | null>(null);
  const [qariFlowPreview, setQariFlowPreview] = useState<QariFlowPreview | null>(null);
  const [qariFlowPreviewLoading, setQariFlowPreviewLoading] = useState(false);
  const [qariFlowPreviewError, setQariFlowPreviewError] = useState('');
  const [qariPreviewAssessment, setQariPreviewAssessment] = useState<Record<string, number>>({});
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userFormData, setUserFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'student' as 'admin' | 'qari' | 'student',
    is_approved: false,
    is_active: true,
    commission_rate: 0.0
  });

  // Monitoring State
  const [statistics, setStatistics] = useState<PlatformStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [detailedUsers, setDetailedUsers] = useState<DetailedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [sessions, setSessions] = useState<DetailedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [monitoringView, setMonitoringView] = useState<'overview' | 'users' | 'sessions' | 'usage'>('overview');
  const [scoringCapacity, setScoringCapacity] = useState<ScoringCapacity | null>(null);
  const [scoringCapacityError, setScoringCapacityError] = useState(false);
  const [capacityLatencyMs, setCapacityLatencyMs] = useState<number | null>(null);
  const [capacityUpdatedAt, setCapacityUpdatedAt] = useState<Date | null>(null);
  const [scoringOperations, setScoringOperations] = useState<ScoringOperations | null>(null);
  
  // Modal states
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<{ isOpen: boolean; presetId: string }>({
    isOpen: false,
    presetId: '',
  });
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ isOpen: boolean; userId: string; userEmail: string }>({
    isOpen: false,
    userId: '',
    userEmail: '',
  });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'warning' | 'info' }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
  });

  useEffect(() => {
    if (activeTab === 'presets') {
      loadPresetData();
    } else if (activeTab === 'users') {
      loadUserData();
    } else if (activeTab === 'monitoring') {
      if (monitoringView === 'overview') {
        loadStatistics();
      } else if (monitoringView === 'users') {
        loadDetailedUsers();
      } else if (monitoringView === 'sessions') {
        loadSessions();
      } else if (monitoringView === 'usage') {
        loadUsageMetrics();
      }
    }
  }, [activeTab, userFilter, monitoringView]);

  useEffect(() => {
    if (activeTab !== 'monitoring' || monitoringView !== 'overview') return;
    let active = true;
    const refreshCapacity = async () => {
      const startedAt = performance.now();
      try {
        const [capacity, operations] = await Promise.all([getScoringCapacity(), getScoringOperations()]);
        if (active) {
          setScoringCapacity(capacity);
          setScoringOperations(operations);
          setScoringCapacityError(false);
          setCapacityLatencyMs(Math.round(performance.now() - startedAt));
          setCapacityUpdatedAt(new Date());
        }
      } catch (error) {
        console.error('Failed to load scoring queue:', error);
        if (active) {
          setScoringCapacityError(true);
          setCapacityLatencyMs(null);
        }
      }
    };
    refreshCapacity();
    const interval = window.setInterval(refreshCapacity, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeTab, monitoringView]);

  const handleRetryScoringJob = async (jobId: string) => {
    try {
      await retryScoringJob(jobId);
      setScoringOperations(await getScoringOperations());
    } catch (error: any) {
      setAlertModal({isOpen: true, title: 'Retry tidak berjaya', message: error.message, variant: 'error'});
    }
  };

  const loadStatistics = async () => {
    try {
      setStatsLoading(true);
      const data = await getPlatformStatistics();
      setStatistics(data);
    } catch (error: any) {
      console.error('Failed to load statistics:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load platform statistics. Please try again.', variant: 'error' });
    } finally {
      setStatsLoading(false);
    }
  };

  const loadDetailedUsers = async () => {
    try {
      setUsersLoading(true);
      const data = await getDetailedUsers();
      setDetailedUsers(data.users);
    } catch (error: any) {
      console.error('Failed to load detailed users:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load user details. Please try again.', variant: 'error' });
    } finally {
      setUsersLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      setSessionsLoading(true);
      const data = await getAllSessions(100, 0);
      setSessions(data.sessions);
    } catch (error: any) {
      console.error('Failed to load sessions:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load sessions. Please try again.', variant: 'error' });
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadUsageMetrics = async () => {
    try {
      setMetricsLoading(true);
      const data = await getUsageMetrics();
      setUsageMetrics(data);
    } catch (error: any) {
      console.error('Failed to load usage metrics:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load usage metrics. Please try again.', variant: 'error' });
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadPresetData = async () => {
    try {
      setPresetLoading(true);
      
      let presetsData: ReferenceAudio[] = [];
      let refsData: ReferenceAudio[] = [];
      
      try {
        presetsData = await referenceLibraryService.getPresets();
      } catch (error: any) {
        console.error('Failed to load presets:', error);
        presetsData = [];
      }
      
      try {
        refsData = await referenceLibraryService.getReferences();
      } catch (error: any) {
        console.error('Failed to load references:', error);
        refsData = [];
      }
      
      setPresets(presetsData);
      setReferences(refsData);
    } catch (error: any) {
      console.error('Unexpected error loading data:', error);
    } finally {
      setPresetLoading(false);
    }
  };

  const loadUserData = async () => {
    try {
      setUserLoading(true);
      const role = userFilter === 'all' ? undefined : userFilter;
      const data = await listAllUsers(role);
      setUsers(data.users);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load users. Please try again.', variant: 'error' });
    } finally {
      setUserLoading(false);
    }
  };

  const handleCreateNew = () => {
    setCreatingNew(true);
    setEditingPreset(null);
    setSelectedReference(null);
  };

  const handleEdit = (preset: ReferenceAudio) => {
    setEditingPreset(preset);
    setCreatingNew(false);
    setSelectedReference(preset);
  };

  const handleDelete = (presetId: string) => {
    setDeletePresetConfirm({ isOpen: true, presetId });
  };

  const confirmDeletePreset = async () => {
    try {
      await referenceLibraryService.deletePreset(deletePresetConfirm.presetId);
      await loadPresetData();
      setDeletePresetConfirm({ isOpen: false, presetId: '' });
    } catch (error) {
      console.error('Failed to delete preset:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to delete preset. Please try again.', variant: 'error' });
      setDeletePresetConfirm({ isOpen: false, presetId: '' });
    }
  };

  const handleSavePreset = async (
    referenceId: string,
    title: string,
    textSegments: TextSegment[],
    maqam?: string
  ) => {
    try {
      if (editingPreset) {
        await referenceLibraryService.updatePreset(
          editingPreset.id,
          textSegments,
          title,
          maqam
        );
      } else {
        await referenceLibraryService.createPreset(
          referenceId,
          title,
          textSegments,
          maqam
        );
      }
      await loadPresetData();
      setCreatingNew(false);
      setEditingPreset(null);
      setSelectedReference(null);
    } catch (error) {
      console.error('Failed to save preset:', error);
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to save preset. Please try again.', variant: 'error' });
      throw error;
    }
  };

  const handleCancel = () => {
    setCreatingNew(false);
    setEditingPreset(null);
    setSelectedReference(null);
  };

  // User Management Handlers
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const closeUserCertificates = () => {
    certificateRequestId.current += 1;
    setCertificateUser(null);
    setUserCertificates([]);
    setPreviewCertificate(null);
    setPreviewUrl(null);
    setCertificatesError('');
  };

  const handleViewUserCertificates = async (user: AdminUser) => {
    const requestId = ++certificateRequestId.current;
    setCertificateUser(user);
    setUserCertificates([]);
    setPreviewCertificate(null);
    setPreviewUrl(null);
    setCertificatesError('');
    setCertificatesLoading(true);
    try {
      const certificates = await getAdminUserCertificates(user.id);
      if (requestId === certificateRequestId.current) setUserCertificates(certificates);
    } catch (error: any) {
      if (requestId === certificateRequestId.current) setCertificatesError(error.message || 'Gagal memuatkan sijil pengguna.');
    } finally {
      if (requestId === certificateRequestId.current) setCertificatesLoading(false);
    }
  };

  const handlePreviewStudentFlow = async (user: AdminUser) => {
    setFlowPreviewUser(user);
    setFlowPreview(null);
    setFlowPreviewError('');
    setFlowPreviewLoading(true);
    try {
      setFlowPreview(await getAdminStudentFlowPreview(user.id));
    } catch (error: any) {
      setFlowPreviewError(error.message || 'Gagal memuatkan pratonton aliran peserta.');
    } finally {
      setFlowPreviewLoading(false);
    }
  };

  const handlePreviewQariFlow = async (user: AdminUser) => {
    setQariFlowPreviewUser(user);
    setQariFlowPreview(null);
    setQariFlowPreviewError('');
    setQariPreviewAssessment({});
    setQariFlowPreviewLoading(true);
    try {
      setQariFlowPreview(await getAdminQariFlowPreview(user.id));
    } catch (error: any) {
      setQariFlowPreviewError(error.message || 'Gagal memuatkan pratonton aliran qari.');
    } finally {
      setQariFlowPreviewLoading(false);
    }
  };

  const handlePreviewCertificate = async (certificate: CertificateSummary) => {
    const requestId = ++certificateRequestId.current;
    setPreviewCertificate(certificate);
    setPreviewUrl(null);
    setCertificatesError('');
    setPreviewLoading(true);
    try {
      const pdf = await getCertificatePdfBlob(certificate.id);
      if (requestId === certificateRequestId.current) setPreviewUrl(URL.createObjectURL(pdf));
    } catch (error: any) {
      if (requestId === certificateRequestId.current) setCertificatesError(error.message || 'Gagal membuka sijil.');
    } finally {
      if (requestId === certificateRequestId.current) setPreviewLoading(false);
    }
  };

  const handleApproveQari = async (userId: string) => {
    try {
      await approveQari(userId);
      await loadUserData();
    } catch (error: any) {
      setAlertModal({ isOpen: true, title: 'Error', message: error.message || 'Failed to approve Qari', variant: 'error' });
    }
  };

  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setCreatingUser(false);
    setUserFormData({
      email: user.email,
      password: '', // Don't pre-fill password
      full_name: user.full_name || '',
      role: user.role as 'admin' | 'qari' | 'student',
      is_approved: user.is_approved,
      is_active: user.is_active,
      commission_rate: user.commission_rate
    });
  };

  const handleCreateUser = () => {
    setCreatingUser(true);
    setEditingUser(null);
    setUserFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'student',
      is_approved: false,
      is_active: true,
      commission_rate: 0.0
    });
  };

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update existing user
        await updateUser(editingUser.id, {
          full_name: userFormData.full_name.trim().toUpperCase() || undefined,
          role: userFormData.role,
          is_approved: userFormData.is_approved,
          is_active: userFormData.is_active,
          commission_rate: userFormData.commission_rate
        });
      } else {
        // Create new user
        if (!userFormData.email || !userFormData.password) {
          setAlertModal({ isOpen: true, title: 'Validation Error', message: 'Email and password are required', variant: 'warning' });
          return;
        }
        await createUser({
          email: userFormData.email,
          password: userFormData.password,
          full_name: userFormData.full_name.trim().toUpperCase() || undefined,
          role: userFormData.role,
          is_approved: userFormData.is_approved,
          is_active: userFormData.is_active,
          commission_rate: userFormData.commission_rate
        });
      }
      await loadUserData();
      setEditingUser(null);
      setCreatingUser(false);
    } catch (error: any) {
      setAlertModal({ isOpen: true, title: 'Error', message: error.message || 'Failed to save user', variant: 'error' });
    }
  };

  const handleDeleteUser = (userId: string, userEmail: string) => {
    setDeleteUserConfirm({ isOpen: true, userId, userEmail });
  };

  const confirmDeleteUser = async () => {
    try {
      await deleteUser(deleteUserConfirm.userId);
      await loadUserData();
      setDeleteUserConfirm({ isOpen: false, userId: '', userEmail: '' });
    } catch (error: any) {
      setAlertModal({ isOpen: true, title: 'Error', message: error.message || 'Failed to delete user', variant: 'error' });
      setDeleteUserConfirm({ isOpen: false, userId: '', userEmail: '' });
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMergeStudent = async (source: AdminUser) => {
    const targetEmail = window.prompt(`Akaun sementara: ${source.email}\n\nMasukkan e-mel akaun asal peserta:`)?.trim().toLowerCase();
    if (!targetEmail) return;
    const target = users.find(user => user.email.toLowerCase() === targetEmail);
    if (!target || target.role !== 'student') {
      setAlertModal({isOpen: true, title: 'Akaun tidak ditemui', message: 'Pilih akaun pelajar asal yang wujud dalam senarai semasa.', variant: 'warning'});
      return;
    }
    if (target.id === source.id) return;
    const confirmed = window.prompt(`Semua rakaman, skor dan pendaftaran ${source.email} akan dipindahkan ke ${target.email}. Akaun sementara akan dinyahaktifkan.\n\nTaip e-mel akaun asal untuk mengesahkan:`)?.trim().toLowerCase();
    if (confirmed !== target.email.toLowerCase()) return;
    try {
      const result = await mergeStudentAccount(source.id, target.id, confirmed);
      await loadUserData();
      setAlertModal({isOpen: true, title: 'Akaun berjaya digabungkan', message: `${source.email} telah dipindahkan ke ${result.target_email}. Jumlah sesi pada akaun asal: ${result.target_sessions}.`, variant: 'success'});
    } catch (error: any) {
      setAlertModal({isOpen: true, title: 'Penggabungan dibatalkan', message: error.message || 'Tiada data diubah.', variant: 'error'});
    }
  };

  const formatDisplayName = (name?: string | null, fallback?: string) =>
    (name?.trim() || fallback || '').toUpperCase();

  const classroomHealth = (() => {
    if (scoringCapacityError || !scoringCapacity) {
      return {
        label: 'MERAH — Hentikan penghantaran',
        detail: 'API pemantauan tidak dapat dihubungi. Rakaman sedia ada mungkin masih selamat; jangan submit semula.',
        panel: 'border-red-300 bg-red-50',
        badge: 'bg-red-600 text-white',
      };
    }
    const failed = scoringCapacity.failed_last_hour ?? 0;
    const oldestWait = scoringCapacity.oldest_wait_seconds ?? 0;
    const oldestActive = scoringCapacity.oldest_processing_seconds ?? 0;
    const waiting = scoringCapacity.waiting ?? 0;
    const apiSlow = (capacityLatencyMs ?? 0) >= 2500;
    if (failed > 0 || oldestWait >= 300 || oldestActive >= 600 || apiSlow) {
      return {
        label: 'MERAH — Hentikan penghantaran',
        detail: 'Terdapat kegagalan, tugasan terlalu lama atau API sangat perlahan. Tunggu queue pulih sebelum kumpulan seterusnya.',
        panel: 'border-red-300 bg-red-50',
        badge: 'bg-red-600 text-white',
      };
    }
    if (waiting >= 10 || oldestWait >= 90 || oldestActive >= 300 || (capacityLatencyMs ?? 0) >= 1000) {
      return {
        label: 'KUNING — Tunggu sebentar',
        detail: 'Sistem sedang sibuk. Jangan mulakan kumpulan baharu sehingga angka Waiting dan Oldest wait menurun.',
        panel: 'border-amber-300 bg-amber-50',
        badge: 'bg-amber-500 text-white',
      };
    }
    return {
      label: 'HIJAU — Boleh teruskan',
      detail: waiting > 0 ? 'Queue masih terkawal. Teruskan secara berperingkat.' : 'API dan scoring queue berada dalam keadaan baik.',
      panel: 'border-emerald-300 bg-emerald-50',
      badge: 'bg-emerald-600 text-white',
    };
  })();

  if (creatingNew || editingPreset) {
    return (
      <PresetEditor
        reference={selectedReference || undefined}
        existingPreset={editingPreset || undefined}
        onSave={handleSavePreset}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          {activeTab === 'presets' && 'Preset Manager'}
          {activeTab === 'users' && 'User Management'}
          {activeTab === 'monitoring' && 'Platform Monitoring'}
        </h1>
        <p className="text-slate-600">
          {activeTab === 'presets' && 'Manage Quran text presets and reference audios'}
          {activeTab === 'users' && 'Approve and manage Qari accounts, edit, delete and create users'}
          {activeTab === 'monitoring' && 'Monitor all users, sessions, and platform usage'}
        </p>
      </div>

      {/* Preset Manager Tab */}
      {activeTab === 'presets' && (
        <>
          <div className="mb-6">
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={20} />
              Create New Preset
            </button>
          </div>

          {presetLoading ? (
            <div className="text-center py-12">
              <div className="text-slate-500">Loading presets...</div>
            </div>
          ) : presets.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
              <p className="text-slate-500 mb-4">No presets created yet.</p>
              <p className="text-sm text-slate-400">
                Click "Create New Preset" to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">
                      {preset.filename || preset.title}
                    </h3>
                    {preset.maqam && (
                      <p className="text-sm text-slate-500">Maqam: {preset.maqam}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      Duration: {formatDuration(preset.duration)}
                    </p>
                    {preset.text_segments && (
                      <p className="text-xs text-slate-400">
                        {preset.text_segments.length} text segments
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(preset)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Edit size={16} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* User Management Tab */}
      {activeTab === 'users' && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleCreateUser}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                <UserPlus size={20} />
                Create User
              </button>
              
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="all">All Users</option>
                <option value="admin">Admins</option>
                <option value="qari">Qaris</option>
                <option value="student">Students</option>
              </select>
            </div>
          </div>

          {/* Create/Edit User Form */}
          {(creatingUser || editingUser) && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    disabled={!!editingUser}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Password {editingUser && '(leave empty to keep current)'}
                  </label>
                  <PasswordInput
                    autoComplete="new-password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={userFormData.full_name}
                    onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as 'admin' | 'qari' | 'student' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="student">Student</option>
                    <option value="qari">Qari</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {userFormData.role === 'qari' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Commission Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={userFormData.commission_rate}
                      onChange={(e) => setUserFormData({ ...userFormData, commission_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={userFormData.is_approved}
                      onChange={(e) => setUserFormData({ ...userFormData, is_approved: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">Approved</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={userFormData.is_active}
                      onChange={(e) => setUserFormData({ ...userFormData, is_active: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">Active</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleSaveUser}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Save size={18} />
                  Save
                </button>
                <button
                  onClick={() => {
                    setCreatingUser(false);
                    setEditingUser(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {userLoading ? (
            <div className="text-center py-12">
              <div className="text-slate-500">Loading users...</div>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
              <p className="text-slate-500 mb-4">No users found.</p>
              <p className="text-sm text-slate-400">
                Click "Create User" to add a new user.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {formatDisplayName(user.full_name, user.email)}
                            </div>
                            <div className="text-sm text-slate-500">{user.email}</div>
                            {user.referral_code && (
                              <div className="text-xs text-slate-400 mt-1">
                                Code: {user.referral_code}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'qari' ? 'bg-blue-100 text-blue-800' :
                            user.role === 'student' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                          {user.role === 'qari' && user.commission_rate > 0 && (
                            <div className="text-xs text-slate-500 mt-1">
                              {user.commission_rate}% commission
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {user.is_approved ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded">
                                <CheckCircle size={12} />
                                Approved
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 rounded">
                                <XCircle size={12} />
                                Pending
                              </span>
                            )}
                            {user.is_active ? (
                              <span className="text-xs text-green-600">Active</span>
                            ) : (
                              <span className="text-xs text-red-600">Inactive</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {user.role === 'qari' && !user.is_approved && (
                              <button
                                onClick={() => handleApproveQari(user.id)}
                                className="text-emerald-600 hover:text-emerald-900 font-medium"
                              >
                                Approve
                              </button>
                            )}
                            {user.role === 'qari' && (
                              <button
                                onClick={() => navigate(`/admin/qari/${user.id}/content`)}
                                className="text-emerald-600 hover:text-emerald-900 font-medium"
                              >
                                Content
                              </button>
                            )}
                            {user.role === 'qari' && (
                              <button
                                onClick={() => void handlePreviewQariFlow(user)}
                                className="text-violet-700 hover:text-violet-900 font-medium"
                              >
                                Pratonton Aliran Qari
                              </button>
                            )}
                            <button
                              onClick={() => void handleViewUserCertificates(user)}
                              className="text-emerald-700 hover:text-emerald-900 font-medium"
                            >
                              Lihat Sijil
                            </button>
                            <button
                              onClick={() => handleEditUser(user)}
                              className="text-blue-600 hover:text-blue-900 font-medium"
                            >
                              Edit
                            </button>
                            {user.role === 'student' && user.is_active && (
                              <button
                                onClick={() => void handlePreviewStudentFlow(user)}
                                className="text-violet-700 hover:text-violet-900 font-medium"
                              >
                                Pratonton Aliran
                              </button>
                            )}
                            {user.role === 'student' && user.is_active && (
                              <button
                                onClick={() => void handleMergeStudent(user)}
                                className="text-amber-700 hover:text-amber-900 font-medium"
                              >
                                Gabung Akaun
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              className="text-red-600 hover:text-red-900 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {certificateUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="admin-user-certificates-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <h2 id="admin-user-certificates-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Award size={22} /> Sijil Pengguna</h2>
                  <p className="mt-1 text-sm text-slate-600">{formatDisplayName(certificateUser.full_name, certificateUser.email)} · {certificateUser.email}</p>
                </div>
                <button type="button" onClick={closeUserCertificates} aria-label="Tutup senarai sijil" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={20} /></button>
              </div>
              <div className="space-y-4 overflow-y-auto p-5">
                {certificatesLoading && <p className="text-slate-600">Memuatkan sijil…</p>}
                {certificatesError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{certificatesError}</p>}
                {!certificatesLoading && !certificatesError && userCertificates.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-slate-600">Pengguna ini belum mempunyai sijil.</p>}
                {userCertificates.map(certificate => <div key={certificate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{certificate.certificate_type === 'attendance' ? 'Sijil Kehadiran & Penyertaan' : certificate.certificate_type === 'competency_azan' ? 'Sijil Kompetensi Azan' : 'Sijil Kompetensi Tarannum'}</p>
                    <p className="text-sm text-slate-600">{certificate.certificate_number} · {new Date(certificate.issued_at).toLocaleDateString('ms-MY')} · {certificate.status}</p>
                    {certificate.publication_held && <p className="text-xs font-semibold text-amber-700">Ditahan daripada peserta</p>}
                    {!certificate.publication_held && certificate.profile_incomplete && <p className="text-xs font-semibold text-amber-700">Menunggu profil peserta lengkap</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={certificate.status !== 'valid' || previewLoading} onClick={() => void handlePreviewCertificate(certificate)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"><Eye size={16} /> Lihat PDF</button>
                    <button type="button" disabled={certificate.status !== 'valid'} onClick={() => downloadCertificate(certificate.id, certificate.certificate_number).catch((error) => setCertificatesError(error.message))} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Download size={16} /> Muat turun</button>
                  </div>
                </div>)}
                {previewLoading && <p className="text-sm text-slate-600">Membuka pratonton PDF…</p>}
                {previewCertificate && previewUrl && <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Pratonton: {previewCertificate.certificate_number}</p>
                  <iframe src={previewUrl} title={`Pratonton sijil ${previewCertificate.certificate_number}`} className="h-[55vh] w-full rounded-lg border border-slate-300" />
                </div>}
              </div>
            </section>
          </div>}
          {flowPreviewUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="student-flow-preview-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b bg-white p-5">
                <div>
                  <div className="mb-2 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-800">Mod pratonton admin · baca sahaja</div>
                  <h2 id="student-flow-preview-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Eye size={22} /> Aliran Peserta</h2>
                  <p className="mt-1 text-sm text-slate-600">{formatDisplayName(flowPreviewUser.full_name, flowPreviewUser.email)} · {flowPreviewUser.email}</p>
                </div>
                <button type="button" onClick={() => { setFlowPreviewUser(null); setFlowPreview(null); setFlowPreviewError(''); }} aria-label="Tutup pratonton aliran" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={20} /></button>
              </div>
              <div className="space-y-6 overflow-y-auto p-5">
                {flowPreviewLoading && <p className="text-slate-600">Memuatkan struktur aliran peserta…</p>}
                {flowPreviewError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{flowPreviewError}</p>}
                {flowPreview && <>
                  <div className={`rounded-xl border p-4 ${flowPreview.student.profile_complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <p className="font-bold text-slate-900">1. Profil untuk akses sijil</p>
                    <p className="mt-1 text-sm text-slate-700">{flowPreview.student.profile_complete ? 'Lengkap — peserta boleh melihat sijil yang telah diterbitkan.' : `Belum lengkap: ${flowPreview.student.missing_profile_fields.join(', ')}.`}</p>
                  </div>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900">2. Kemajuan Kursus</h3>
                    <p className="mb-3 text-sm text-slate-600">Paparan ini menggunakan rekod tersimpan dan tidak mengira semula atau mengeluarkan sijil.</p>
                    {flowPreview.courses.length === 0 ? <p className="rounded-xl bg-white p-4 text-slate-600">Tiada pendaftaran kursus.</p> : <div className="grid gap-3 md:grid-cols-2">
                      {flowPreview.courses.map(course => <article key={course.enrollment_id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{course.title}</p><p className="text-xs uppercase tracking-wide text-slate-500">{course.certificate_category === 'azan' ? 'Azan' : 'Tarannum'} · {new Date(course.starts_at).toLocaleDateString('ms-MY')}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${course.eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{course.eligible ? 'Layak' : 'Belum lengkap'}</span></div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600" style={{width: `${Math.min(100, (course.display_valid_recording_count / Math.max(1, course.required_recording_count)) * 100)}%`}} /></div>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{course.display_valid_recording_count}/{course.required_recording_count} rakaman · Kehadiran: {course.attendance_status === 'attended' ? 'Hadir' : course.attendance_status === 'absent' ? 'Tidak hadir' : 'Belum disahkan'}</p>
                        {course.eligibility_override && <p className="mt-1 text-xs font-semibold text-amber-700">Kelayakan disahkan melalui pelarasan admin.</p>}
                      </article>)}
                    </div>}
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900">3. Kelayakan Penilaian Qari</h3>
                    <p className="mb-3 text-sm text-slate-600">Rakaman 75% ke atas muncul di sini. Peserta perlu memilih rakaman dan menghantar permohonan sebelum tugasan muncul kepada qari.</p>
                    {flowPreview.competency_eligibility.length === 0 ? <p className="rounded-xl bg-white p-4 text-slate-600">Belum ada rakaman yang mencapai 75%.</p> : <div className="space-y-3">
                      {flowPreview.competency_eligibility.map(item => <div key={item.session_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div><p className="font-bold text-slate-900">{item.reference_title}</p><p className="text-sm text-slate-600">{item.maqam || 'Maqam tidak dinyatakan'} · {new Date(item.created_at).toLocaleString('ms-MY')}</p></div>
                        <div className="text-right"><p className="text-2xl font-black text-emerald-700">{Math.round(item.score)}%</p><span className={`text-xs font-bold ${item.application_status ? 'text-blue-700' : 'text-amber-700'}`}>{item.application_status ? `Permohonan: ${item.application_status}` : 'Menunggu peserta menghantar'}</span></div>
                      </div>)}
                    </div>}
                    <button type="button" disabled className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white opacity-50">Hantar kepada Qari (contoh sahaja)</button>
                  </section>

                  <section>
                    <h3 className="text-lg font-bold text-slate-900">4. Sijil Rasmi</h3>
                    <p className="mb-3 text-sm text-slate-600">Selepas kelulusan qari atau pemenuhan syarat kehadiran, sijil muncul di dashboard peserta jika profil lengkap dan penerbitan tidak ditahan.</p>
                    {flowPreview.certificates.length === 0 ? <p className="rounded-xl bg-white p-4 text-slate-600">Belum ada sijil dijana.</p> : <div className="grid gap-3 md:grid-cols-2">
                      {flowPreview.certificates.map(certificate => <div key={certificate.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-bold text-slate-900">{certificate.certificate_type === 'attendance' ? 'Sijil Kehadiran & Penyertaan' : certificate.certificate_type === 'competency_azan' ? 'Sijil Kompetensi Azan' : 'Sijil Kompetensi Tarannum'}</p><p className="text-sm text-slate-600">{certificate.certificate_number} · {certificate.status}</p>{certificate.publication_held && <p className="mt-1 text-xs font-bold text-amber-700">Penerbitan ditahan</p>}{certificate.profile_incomplete && <p className="mt-1 text-xs font-bold text-amber-700">Terkunci sehingga profil lengkap</p>}</div>)}
                    </div>}
                  </section>

                  <div className="rounded-xl bg-slate-900 p-4 text-sm text-white"><strong>Aliran kompetensi:</strong> skor ≥75% → peserta hantar rakaman → qari isi 8 rubrik → qari semak jumlah dan buat keputusan → sijil kompetensi dijana selepas lulus.</div>
                </>}
              </div>
            </section>
          </div>}
          {qariFlowPreviewUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="qari-flow-preview-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b bg-white p-5">
                <div>
                  <div className="mb-2 inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-800">Mod pratonton admin · tiada keputusan disimpan</div>
                  <h2 id="qari-flow-preview-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Eye size={22} /> Aliran Penilaian Qari</h2>
                  <p className="mt-1 text-sm text-slate-600">{formatDisplayName(qariFlowPreviewUser.full_name, qariFlowPreviewUser.email)} · {qariFlowPreviewUser.email}</p>
                </div>
                <button type="button" onClick={() => { setQariFlowPreviewUser(null); setQariFlowPreview(null); setQariFlowPreviewError(''); setQariPreviewAssessment({}); }} aria-label="Tutup pratonton aliran qari" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={20} /></button>
              </div>
              <div className="space-y-6 overflow-y-auto p-5">
                {qariFlowPreviewLoading && <p className="text-slate-600">Memuatkan aliran qari…</p>}
                {qariFlowPreviewError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{qariFlowPreviewError}</p>}
                {qariFlowPreview && (() => {
                  const score = QARI_PREVIEW_RUBRIC.reduce((total, item) => total + ((qariPreviewAssessment[item.key] || 0) / 5) * item.weight, 0);
                  const complete = QARI_PREVIEW_RUBRIC.every(item => qariPreviewAssessment[item.key]);
                  const grade = competencyGradeForScore(score);
                  return <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className={`rounded-xl border p-4 ${qariFlowPreview.qari.is_approved ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-xs font-bold uppercase text-slate-500">Akaun Qari</p><p className="mt-1 font-bold">{qariFlowPreview.qari.is_approved ? 'Diluluskan' : 'Belum diluluskan'} · {qariFlowPreview.qari.is_active ? 'Aktif' : 'Tidak aktif'}</p></div>
                      <div className={`rounded-xl border p-4 ${qariFlowPreview.qari.signature_uploaded ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-xs font-bold uppercase text-slate-500">Tandatangan</p><p className="mt-1 font-bold">{qariFlowPreview.qari.signature_uploaded ? 'Sudah dimuat naik' : 'Belum tersedia'}</p></div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Tugasan</p><p className="mt-1 font-bold">{qariFlowPreview.applications.filter(item => item.status === 'pending').length} menunggu · {qariFlowPreview.applications.length} keseluruhan</p></div>
                    </div>

                    <section>
                      <h3 className="text-lg font-bold text-slate-900">1. Peti Tugasan Qari</h3>
                      <p className="mb-3 text-sm text-slate-600">Permohonan hanya muncul selepas peserta menghantar rakaman yang layak.</p>
                      {qariFlowPreview.applications.length === 0 ? <p className="rounded-xl bg-white p-4 text-slate-600">Belum ada peserta menghantar permohonan kepada qari ini.</p> : <div className="space-y-3">{qariFlowPreview.applications.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div><p className="font-bold text-slate-900">{item.student_name}</p><p className="text-sm text-slate-600">{item.certificate_type === 'competency_azan' ? 'Kompetensi Azan' : 'Kompetensi Tarannum'} · dihantar {new Date(item.submitted_at).toLocaleString('ms-MY')}</p></div><div className="text-right"><p className="text-2xl font-black text-emerald-700">{item.score_snapshot.toFixed(1)}%</p><span className="text-xs font-bold uppercase text-slate-600">{item.status}</span>{item.qari_score != null && <p className="text-xs text-slate-600">Skor qari {item.qari_score.toFixed(1)}%</p>}</div></div>)}</div>}
                    </section>

                    <section>
                      <h3 className="text-lg font-bold text-slate-900">2. Simulasi Borang Lapan Rubrik</h3>
                      <p className="mb-3 text-sm text-slate-600">Pilihan di bawah hanya untuk memahami pengiraan. Ia tidak disimpan dan tidak menjejaskan mana-mana peserta.</p>
                      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Elemen qari</th><th className="p-3">Hubungan V2.3</th><th className="p-3">Berat</th><th className="p-3">Skala 1–5</th></tr></thead><tbody>{QARI_PREVIEW_RUBRIC.map(item => <tr key={item.key} className="border-t"><td className="p-3 font-semibold">{item.label}</td><td className="p-3 text-slate-500">{item.link}</td><td className="p-3">{item.weight}%</td><td className="p-3"><select value={qariPreviewAssessment[item.key] || ''} onChange={event => setQariPreviewAssessment(current => ({...current, [item.key]: Number(event.target.value)}))} className="rounded-lg border px-3 py-2" aria-label={`Simulasi ${item.label}`}><option value="">Pilih</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></td></tr>)}</tbody></table></div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div className="overflow-hidden rounded-xl border border-emerald-200 bg-white"><div className="bg-emerald-900 px-4 py-2 text-sm font-bold text-white">Panduan Tahap Penilaian Qari</div><table className="w-full text-sm"><thead className="bg-emerald-50 text-left"><tr><th className="p-2">Markah</th><th className="p-2">Pangkat</th><th className="p-2">Tahap</th></tr></thead><tbody><tr className="border-t"><td className="p-2 font-bold">90–100%</td><td className="p-2">Mumtaz (ممتاز)</td><td className="p-2">Cemerlang</td></tr><tr className="border-t"><td className="p-2 font-bold">75–89%</td><td className="p-2">Jayyid Jiddan (جيد جدا)</td><td className="p-2">Sangat Baik</td></tr><tr className="border-t"><td className="p-2 font-bold">60–74%</td><td className="p-2">Jayyid (جيد)</td><td className="p-2">Baik</td></tr></tbody></table><p className="border-t p-3 text-xs text-slate-600">Skor latihan AI ≥75% kekal sebagai syarat menghantar permohonan. Kelulusan qari memerlukan sekurang-kurangnya 60% dan tiada kesilapan kritikal.</p></div><div className={`min-w-[190px] rounded-xl p-5 text-center ${complete && score >= 60 ? 'bg-emerald-100' : 'bg-amber-100'}`}><p className="text-xs font-bold uppercase text-slate-600">Skor simulasi qari</p><p className="text-4xl font-black text-slate-900">{score.toFixed(0)}%</p><p className="mt-1 text-sm font-bold text-slate-900">Tahap: {complete ? (grade?.label || 'Belum layak') : '—'}</p><p className="text-xs text-slate-600">{complete ? (grade?.range || 'Bawah 60%') : 'Lengkapkan 8 elemen'}</p></div></div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-900">3. Keputusan dan Sijil</h3><p className="mt-1 text-sm text-slate-600">Selepas mendengar rakaman dan melengkapkan rubrik, qari memilih <strong>Lulus & jana sijil</strong>, <strong>Minta rakam semula</strong>, atau <strong>Tidak lulus</strong>. Dalam pratonton ini semua tindakan kekal dinyahaktifkan.</p><div className="mt-3 flex flex-wrap gap-2"><button disabled className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white opacity-50">Lulus & jana sijil</button><button disabled className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900 opacity-60">Minta rakam semula</button><button disabled className="rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-800 opacity-60">Tidak lulus</button></div></section>
                  </>;
                })()}
              </div>
            </section>
          </div>}
        </>
      )}

      {/* Platform Monitoring Tab */}
      {activeTab === 'monitoring' && (
        <>
          {/* Monitoring Sub-tabs */}
          <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
            <button
              onClick={() => setMonitoringView('overview')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                monitoringView === 'overview'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setMonitoringView('users')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                monitoringView === 'users'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              User Monitoring
            </button>
            <button
              onClick={() => setMonitoringView('sessions')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                monitoringView === 'sessions'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Session Monitoring
            </button>
            <button
              onClick={() => setMonitoringView('usage')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                monitoringView === 'usage'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Usage Metrics
            </button>
          </div>

          {/* Overview View */}
          {monitoringView === 'overview' && (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-slate-800">Platform Statistics</h2>
                <button
                  onClick={loadStatistics}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  <Activity size={18} />
                  Refresh
                </button>
              </div>

              <section className={`mb-6 rounded-xl border p-5 ${classroomHealth.panel}`} aria-label="Live classroom scoring queue">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">Classroom Control Centre</h3>
                    <p className="text-sm text-slate-700">Dikemas kini automatik setiap 5 saat. {capacityUpdatedAt ? `Kemaskini terakhir ${capacityUpdatedAt.toLocaleTimeString()}.` : 'Menghubungi API...'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-2 text-sm font-bold ${classroomHealth.badge}`}>
                    {classroomHealth.label}
                  </span>
                </div>
                <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">{classroomHealth.detail}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                  {[
                    ['API response', capacityLatencyMs === null ? '—' : `${capacityLatencyMs}ms`],
                    ['Active', scoringCapacity?.active ?? '—'],
                    ['Waiting', scoringCapacity?.waiting ?? '—'],
                    ['Oldest wait', scoringCapacity ? `${scoringCapacity.oldest_wait_seconds ?? 0}s` : '—'],
                    ['Failed · 1h', scoringCapacity?.failed_last_hour ?? '—'],
                    ['Completed · 1h', scoringCapacity?.completed_last_hour ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    ['Median · 1h', scoringOperations ? `${scoringOperations.p50_total_seconds}s` : '—'],
                    ['P95 · 1h', scoringOperations ? `${scoringOperations.p95_total_seconds}s` : '—'],
                    ['Purata · 1h', scoringOperations ? `${scoringOperations.average_total_seconds}s` : '—'],
                  ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900">{value}</p></div>)}
                </div>
                {scoringOperations && scoringOperations.jobs.length > 0 && <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50"><tr><th className="p-2">Perlu perhatian</th><th>Status</th><th>Tempoh</th><th>Tindakan</th></tr></thead>
                    <tbody>{scoringOperations.jobs.map(job => <tr key={job.job_id} className="border-t">
                      <td className="p-2"><strong>{job.participant}</strong><br/><span className="text-xs text-slate-500">{job.email}</span></td>
                      <td>{job.status} · {job.stage}</td><td>{job.age_seconds}s</td>
                      <td>{job.status === 'failed' || (job.status === 'processing' && job.age_seconds >= 960) ? <button onClick={() => void handleRetryScoringJob(job.job_id)} className="rounded bg-amber-600 px-3 py-1 font-semibold text-white">Retry selamat</button> : <span className="text-xs text-slate-500">Sedang dipantau</span>}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
                <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-3">
                  <p><strong>Hijau:</strong> teruskan kumpulan seterusnya secara berperingkat.</p>
                  <p><strong>Kuning:</strong> berhenti sementara dan tunggu queue menurun.</p>
                  <p><strong>Merah:</strong> jangan submit semula; semak API, worker dan job gagal.</p>
                </div>
              </section>

          {statsLoading ? (
            <div className="text-center py-12">
              <div className="text-slate-500">Loading statistics...</div>
            </div>
          ) : !statistics ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
              <p className="text-slate-500 mb-4">No statistics available.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Total Users</p>
                      <p className="text-3xl font-bold text-slate-800">{statistics.users.total}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        +{statistics.users.new_users_7d} this week
                      </p>
                    </div>
                    <Users className="w-12 h-12 text-blue-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Total Sessions</p>
                      <p className="text-3xl font-bold text-slate-800">{statistics.sessions.total}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {statistics.sessions.recent_7d} in last 7 days
                      </p>
                    </div>
                    <Activity className="w-12 h-12 text-green-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Avg. Score</p>
                      <p className="text-3xl font-bold text-slate-800">{statistics.analyses.average_score}%</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {statistics.analyses.total} analyses
                      </p>
                    </div>
                    <TrendingUp className="w-12 h-12 text-purple-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Active Qaris</p>
                      <p className="text-3xl font-bold text-slate-800">{statistics.users.approved_qaris}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {statistics.users.pending_qaris} pending
                      </p>
                    </div>
                    <UserCheck className="w-12 h-12 text-emerald-500" />
                  </div>
                </div>
              </div>

              {/* User Statistics */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">User Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Admins</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.users.by_role.admin || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Qaris</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.users.by_role.qari || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Students</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.users.by_role.student || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Active Users</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.users.active}
                    </p>
                  </div>
                </div>
              </div>

              {/* Session Statistics */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Session Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Authenticated</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.sessions.authenticated}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Public/Demo</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.sessions.public}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Last 7 Days</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.sessions.recent_7d}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Total Analyses</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.analyses.total}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content Statistics */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Content Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-600">Total References</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.content.total_references}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Public References</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.content.public_references}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Qari Content</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.content.qari_content}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Active Relationships</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {statistics.relationships.active}
                    </p>
                  </div>
                </div>
                
                {statistics.content.top_references.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-700 mb-2">Most Used References</p>
                    <div className="space-y-2">
                      {statistics.content.top_references.slice(0, 5).map((ref, idx) => (
                        <div key={ref.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                          <span className="text-sm text-slate-700">
                            {idx + 1}. {ref.filename || ref.title}
                          </span>
                          <span className="text-sm font-medium text-slate-600">
                            {ref.usage_count} uses
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Activity</h3>
                {statistics.recent_activity.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No recent activity</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">User</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Score</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Duration</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-700 uppercase">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {statistics.recent_activity.map((activity) => (
                          <tr key={activity.session_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-sm">
                              {activity.is_public ? (
                                <span className="text-slate-500">Public User</span>
                              ) : (
                                <span className="text-slate-700">{activity.user_email || 'Unknown'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {activity.score !== null && activity.score !== undefined ? (
                                <span className="font-medium text-slate-800">{activity.score.toFixed(1)}%</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-600">
                              {activity.duration ? `${activity.duration.toFixed(1)}s` : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-500">
                              {activity.created_at
                                ? new Date(activity.created_at).toLocaleString()
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
            </>
          )}

          {/* User Monitoring View */}
          {monitoringView === 'users' && (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-slate-800">User Monitoring</h2>
                <button
                  onClick={loadDetailedUsers}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  <Activity size={18} />
                  Refresh
                </button>
              </div>

              {usersLoading ? (
                <div className="text-center py-12">
                  <div className="text-slate-500">Loading user details...</div>
                </div>
              ) : detailedUsers.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
                  <p className="text-slate-500">No users found.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Role</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Activity</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Last Login</th>
                          {detailedUsers.some(u => u.role === 'qari') && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Qari Stats</th>
                          )}
                          {detailedUsers.some(u => u.role === 'student') && (
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase">Student Stats</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detailedUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4">
                              <div>
                                <div className="text-sm font-medium text-slate-900">
                                  {formatDisplayName(user.full_name, user.email)}
                                </div>
                                <div className="text-sm text-slate-500">{user.email}</div>
                              </div>
                            </td>
                            <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                user.role === 'qari' ? 'bg-blue-100 text-blue-800' :
                                user.role === 'student' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                {user.is_approved ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded">
                                    <CheckCircle size={12} />
                                    Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 rounded">
                                    <XCircle size={12} />
                                    Pending
                                  </span>
                                )}
                                {user.is_active ? (
                                  <span className="text-xs text-green-600">Active</span>
                                ) : (
                                  <span className="text-xs text-red-600">Inactive</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-600">
                              <div>
                                <div>Sessions: {user.session_count || 0}</div>
                                <div>Analyses: {user.analysis_count || 0}</div>
                              </div>
                            </td>
                            <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-500">
                              {user.last_login
                                ? new Date(user.last_login).toLocaleString()
                                : 'Never'}
                            </td>
                            {user.role === 'qari' && (
                              <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-600">
                                <div>
                                  <div>Students: {user.student_count || 0}</div>
                                  <div>Content: {user.content_count || 0}</div>
                                  {user.referral_code && (
                                    <div className="text-xs text-slate-400 mt-1">
                                      Code: {user.referral_code}
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                            {user.role === 'student' && (
                              <td className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-600">
                                <div>
                                  <div>Progress: {user.progress_count || 0}</div>
                                  {user.assigned_qari && (
                                    <div>Qari: {user.assigned_qari}</div>
                                  )}
                                  {user.average_score !== undefined && (
                                    <div>Avg Score: {user.average_score}%</div>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Session Monitoring View */}
          {monitoringView === 'sessions' && (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-slate-800">Session Monitoring</h2>
                <button
                  onClick={loadSessions}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  <Activity size={18} />
                  Refresh
                </button>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-12">
                  <div className="text-slate-500">Loading sessions...</div>
                </div>
              ) : sessions.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
                  <p className="text-slate-500">No sessions found.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Qari Reference</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Score</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Duration</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Timestamp</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sessions.map((session) => (
                          <tr key={session.session_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div>
                                {session.is_public_demo ? (
                                  <span className="text-sm text-slate-500">Public User</span>
                                ) : (
                                  <>
                                    <div className="text-sm font-medium text-slate-900">
                                      {session.user_name || session.user_email || 'Unknown'}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {session.user_role || 'N/A'}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 sm:px-4 whitespace-normal break-words sm:whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                session.has_analysis
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}>
                                {session.has_analysis ? 'Assessment' : 'Practice'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {session.qari_name ? (
                                <div>
                                  <div>{session.qari_name}</div>
                                  {session.reference_id && (
                                    <div className="text-xs text-slate-400">
                                      Ref: {session.reference_id.substring(0, 8)}...
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 sm:px-4 whitespace-normal break-words sm:whitespace-nowrap">
                              {session.score !== null && session.score !== undefined ? (
                                <div>
                                  <span className="text-sm font-medium text-slate-800">
                                    {session.score.toFixed(1)}%
                                  </span>
                                  {session.verse_scores && (
                                    <div className="text-xs text-slate-500 mt-1">
                                      {Array.isArray(session.verse_scores) ? session.verse_scores.length : 0} verses
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 sm:px-4 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-600">
                              {session.duration ? `${session.duration.toFixed(1)}s` : '-'}
                            </td>
                            <td className="px-3 py-3 sm:px-4 whitespace-normal break-words sm:whitespace-nowrap text-sm text-slate-500">
                              {session.created_at
                                ? new Date(session.created_at).toLocaleString()
                                : '-'}
                            </td>
                            <td className="px-3 py-3 sm:px-4 whitespace-normal break-words sm:whitespace-nowrap">
                              {session.file_path && (
                                <button
                                  onClick={async () => {
                                    try {
                                      // Get authenticated blob URL
                                      const blobUrl = await referenceLibraryService.getReferenceAudioBlobUrl(session.session_id);
                                      // Create a temporary link to download/play the audio
                                      const link = document.createElement('a');
                                      link.href = blobUrl;
                                      link.target = '_blank';
                                      link.click();
                                      // Note: blob URL will be cleaned up by browser when tab closes
                                    } catch (error) {
                                      console.error('Failed to load audio:', error);
                                      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load audio. Please try again.', variant: 'error' });
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                                  title="View audio"
                                >
                                  <PlayCircle size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Usage Metrics View */}
          {monitoringView === 'usage' && (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-slate-800">Usage Metrics</h2>
                <button
                  onClick={loadUsageMetrics}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  <Activity size={18} />
                  Refresh
                </button>
              </div>

              {metricsLoading ? (
                <div className="text-center py-12">
                  <div className="text-slate-500">Loading usage metrics...</div>
                </div>
              ) : !usageMetrics ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-12 text-center">
                  <p className="text-slate-500">No usage metrics available.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Active Students */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <Users size={20} />
                      Active Students
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600">Today</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.active_students.today}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">This Week</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.active_students.this_week}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recordings */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <FileAudio size={20} />
                      Recordings
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-slate-600">Today</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.recordings.today}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">This Week</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.recordings.this_week}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Total</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.recordings.total}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Assessments */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <TrendingUp size={20} />
                      Assessments
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-slate-600">Today</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.assessments.today}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">This Week</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.assessments.this_week}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Total</p>
                        <p className="text-3xl font-bold text-slate-800">
                          {usageMetrics.assessments.total}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Most Active Qari */}
                  {usageMetrics.most_active_qari.id && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                        <UserCheck size={20} />
                        Most Active Qari
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {usageMetrics.most_active_qari.name || usageMetrics.most_active_qari.email}
                          </p>
                          <p className="text-sm text-slate-500">
                            {usageMetrics.most_active_qari.email}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-800">
                            {usageMetrics.most_active_qari.session_count}
                          </p>
                          <p className="text-sm text-slate-500">sessions</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Storage Usage */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <HardDrive size={20} />
                      Storage Usage
                    </h3>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Total Storage</span>
                        <span className="text-lg font-bold text-slate-800">
                          {usageMetrics.storage.total_gb.toFixed(2)} GB
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-emerald-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (usageMetrics.storage.total_gb / 100) * 100)}%` }}
                        />
                      </div>
                    </div>
                    
                    {Object.keys(usageMetrics.storage.by_qari).length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-slate-700 mb-2">Storage by Qari</p>
                        <div className="space-y-2">
                          {Object.entries(usageMetrics.storage.by_qari).slice(0, 5).map(([qariId, data]) => (
                            <div key={qariId} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                              <span className="text-sm text-slate-700">{data.qari_name}</span>
                              <span className="text-sm font-medium text-slate-600">
                                {data.estimated_mb} MB
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Delete Preset Confirmation Modal */}
      <ConfirmModal
        isOpen={deletePresetConfirm.isOpen}
        title="Delete Preset"
        message="Are you sure you want to delete this preset? It will be converted back to a regular reference."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDeletePreset}
        onCancel={() => setDeletePresetConfirm({ isOpen: false, presetId: '' })}
      />

      {/* Delete User Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteUserConfirm.isOpen}
        title="Delete User"
        message={`Are you sure you want to delete user ${deleteUserConfirm.userEmail}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteUserConfirm({ isOpen: false, userId: '', userEmail: '' })}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
        onClose={() => setAlertModal({ isOpen: false, title: '', message: '', variant: 'info' })}
      />
    </div>
  );
};

export default AdminMode;
