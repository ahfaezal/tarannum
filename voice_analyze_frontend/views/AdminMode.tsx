import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Users, BookOpen, CheckCircle, XCircle, UserPlus, Save, X, BarChart3, Activity, TrendingUp, FileAudio, UserCheck, Monitor, HardDrive, PlayCircle } from 'lucide-react';
import { referenceLibraryService, ReferenceAudio, TextSegment } from '../services/referenceLibraryService';
import { 
  listAllUsers, getUser, updateUser, createUser, deleteUser, approveQari, AdminUser, 
  getPlatformStatistics, PlatformStatistics, getDetailedUsers, DetailedUser,
  getAllSessions, DetailedSession, getUsageMetrics, UsageMetrics
} from '../services/platformService';
import PresetEditor from '../components/PresetEditor';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';

type TabType = 'presets' | 'users' | 'monitoring';

interface AdminModeProps {
  view?: 'presets' | 'users' | 'monitoring';
}

const AdminMode: React.FC<AdminModeProps> = ({ view = 'presets' }) => {
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
          full_name: userFormData.full_name || undefined,
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
          full_name: userFormData.full_name || undefined,
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
                  <input
                    type="password"
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
                    onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
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
                              {user.full_name || user.email}
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
                            <button
                              onClick={() => handleEditUser(user)}
                              className="text-blue-600 hover:text-blue-900 font-medium"
                            >
                              Edit
                            </button>
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
                                  {user.full_name || user.email}
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
