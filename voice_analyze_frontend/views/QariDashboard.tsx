/**
 * Qari Dashboard - View students, scores, and progress.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQariStudents, getQariContent, getQariCommissionStats, getStudentDetails, StudentDetails, deleteQariContent } from "../services/platformService";
import { StudentInfo, QariContent } from "../services/platformService";
import { Users, TrendingUp, TrendingDown, BookOpen, BarChart3, DollarSign, Copy, Check, X, Play, FileAudio, ChevronDown, Edit, Trash2 } from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

const QariDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [content, setContent] = useState<QariContent[]>([]);
  const [commissionStats, setCommissionStats] = useState<{
    active_students: number;
    referral_code: string;
    commission_rate: number;
    referral_breakdown: Array<{ code: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; contentId: string; filename: string }>({
    isOpen: false,
    contentId: '',
    filename: '',
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [studentsData, contentData, commissionData] = await Promise.all([
        getQariStudents(),
        getQariContent(),
        getQariCommissionStats().catch(() => null), // Optional, don't fail if not available
      ]);
      setStudents(studentsData.students);
      setContent(contentData.content);
      if (commissionData) {
        setCommissionStats(commissionData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = () => {
    if (commissionStats?.referral_code) {
      navigator.clipboard.writeText(commissionStats.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStudentClick = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setLoadingDetails(true);
    try {
      const details = await getStudentDetails(studentId);
      setStudentDetails(details);
    } catch (err: any) {
      setError(err.message || "Failed to load student details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeStudentDetails = () => {
    setSelectedStudentId(null);
    setStudentDetails(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-6 max-w-md w-full">
          <div className="flex items-center gap-3 text-red-700 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <X className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg">Error Loading Dashboard</h3>
          </div>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">Qari Dashboard</h1>
          <p className="text-slate-600 text-base">Manage your students and content library</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Students</p>
                <p className="text-3xl font-bold text-slate-800">{students.length}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Content Library</p>
                <p className="text-3xl font-bold text-slate-800">{content.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Avg. Score</p>
                <p className="text-3xl font-bold text-emerald-600">
                  {students.length > 0
                    ? Math.round(
                        students.reduce((sum, s) => sum + (s.latest_score || 0), 0) /
                          students.length
                      )
                    : 0}
                  %
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          {commissionStats && (
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Commission Rate</p>
                  <p className="text-3xl font-bold text-amber-600">
                    {commissionStats.commission_rate}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Referral Code Section */}
        {commissionStats && commissionStats.referral_code && (
          <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-emerald-50 rounded-xl shadow-md border border-emerald-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Your Referral Code
            </h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
              <div className="flex-1 bg-white rounded-lg px-4 py-3 border-2 border-emerald-200 shadow-sm">
                <code className="text-xl md:text-2xl font-mono font-bold text-slate-800">
                  {commissionStats.referral_code}
                </code>
              </div>
              <button
                onClick={copyReferralCode}
                className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Share this code with students to track referrals. You'll earn {commissionStats.commission_rate}% commission on their subscriptions.
            </p>
            {commissionStats.referral_breakdown.length > 0 && (
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-sm font-medium text-slate-700 mb-3">Referral Breakdown:</p>
                <div className="flex flex-wrap gap-2">
                  {commissionStats.referral_breakdown.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-white rounded-full text-sm text-slate-700 border border-slate-200 shadow-sm font-medium"
                    >
                      {item.code}: {item.count} student{item.count > 1 ? "s" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Students List */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              My Students
            </h2>
            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 shadow-sm border ${
                  showFilterDropdown
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-200"
                    : "bg-white border-slate-200 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 hover:shadow-md"
                }`}
              >
                <Users className="w-4 h-4 text-emerald-600" />
                <span>{studentFilter === "all" ? "All Users" : studentFilter === "active" ? "Active Users" : "Inactive Users"}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showFilterDropdown ? "rotate-180" : ""}`} />
              </button>
              
              {showFilterDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowFilterDropdown(false)}
                  />
                  <div className="absolute left-0 right-0 sm:left-auto sm:right-0 sm:w-52 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                    <div className="p-1.5 bg-slate-50/50 border-b border-slate-100">
                      <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Filter by</p>
                    </div>
                    <button
                      onClick={() => {
                        setStudentFilter("all");
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 pl-5 pr-4 py-2.5 text-left text-sm transition-colors rounded-lg ${
                        studentFilter === "all"
                          ? "bg-emerald-100 text-emerald-800 font-semibold"
                          : "text-slate-700 hover:bg-emerald-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${studentFilter === "all" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      All Users
                    </button>
                    <button
                      onClick={() => {
                        setStudentFilter("active");
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 pl-5 pr-4 py-2.5 text-left text-sm transition-colors rounded-lg ${
                        studentFilter === "active"
                          ? "bg-emerald-100 text-emerald-800 font-semibold"
                          : "text-slate-700 hover:bg-emerald-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${studentFilter === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Active Users
                    </button>
                    <button
                      onClick={() => {
                        setStudentFilter("inactive");
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 pl-5 pr-4 py-2.5 text-left text-sm transition-colors rounded-lg ${
                        studentFilter === "inactive"
                          ? "bg-emerald-100 text-emerald-800 font-semibold"
                          : "text-slate-700 hover:bg-emerald-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${studentFilter === "inactive" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Inactive Users
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {(() => {
            // Filter students based on selected filter
            const filteredStudents = students.filter((student) => {
              if (studentFilter === "all") return true;
              if (studentFilter === "active") {
                // Consider active if they have recent activity (within last 30 days)
                const lastActive = new Date(student.last_active);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return lastActive >= thirtyDaysAgo;
              }
              if (studentFilter === "inactive") {
                // Consider inactive if no activity in last 30 days
                const lastActive = new Date(student.last_active);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return lastActive < thirtyDaysAgo;
              }
              return true;
            });

            return filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium mb-2">No {studentFilter === "all" ? "" : studentFilter === "active" ? "active " : "inactive "}students found.</p>
                <p className="text-sm text-slate-500">
                  {studentFilter === "all"
                    ? "Students will appear here when they select you as their Qari."
                    : studentFilter === "active"
                    ? "Students with activity in the last 30 days will appear here."
                    : "Students with no activity in the last 30 days will appear here."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredStudents.map((student) => (
                  <div
                    key={student.student_id}
                    onClick={() => handleStudentClick(student.student_id)}
                    className="border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 cursor-pointer bg-gradient-to-r from-white to-slate-50/50"
                  >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">
                      {student.student_name || student.student_email}
                    </h3>
                    <p className="text-sm text-gray-600">{student.student_email}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      <span>Joined: {new Date(student.joined_at).toLocaleDateString()}</span>
                      <span>Last Active: {new Date(student.last_active).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {student.latest_score !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-800">
                          {Math.round(student.latest_score)}%
                        </span>
                        {student.improvement !== undefined && student.improvement > 0 && (
                          <TrendingUp className="w-5 h-5 text-green-500" />
                        )}
                        {student.improvement !== undefined && student.improvement < 0 && (
                          <TrendingDown className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    )}
                    {student.statistics && (
                      <div className="text-sm text-gray-600 mt-1">
                        {student.statistics.total_sessions} sessions
                      </div>
                    )}
                  </div>
                </div>
                {student.statistics && (
                  <>
                    {student.statistics.improvement_trend && student.statistics.improvement_trend.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-2">Improvement Trend (Last 10 Sessions):</p>
                        <div className="flex items-end gap-1 h-12">
                          {student.statistics.improvement_trend.slice(-10).map((improvement, idx) => (
                            <div
                              key={idx}
                              className="flex-1 bg-green-100 rounded-t flex items-end justify-center"
                              style={{
                                height: `${Math.max(10, Math.abs(improvement) * 2)}%`,
                                backgroundColor: improvement > 0 ? '#dcfce7' : improvement < 0 ? '#fee2e2' : '#f3f4f6'
                              }}
                              title={`${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`}
                            >
                              <div className="w-full h-full rounded-t" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {student.statistics.weakest_verses.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-1">Weakest Verses:</p>
                        <div className="flex flex-wrap gap-2">
                          {student.statistics.weakest_verses.slice(0, 3).map((verse, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded"
                              title={verse.text}
                            >
                              {verse.text.length > 30 ? `${verse.text.substring(0, 30)}...` : verse.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Content Library */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">My Content Library</h2>
        </div>
        {content.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>No content yet.</p>
            <p className="text-sm mt-2">Upload reference audios in the Training Studio to add them to your library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {content.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors relative group"
              >
                {/* Action Buttons */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      navigate(`/qari/content/edit/${item.id}`);
                    }}
                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Edit surah/ayah settings"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirm({
                        isOpen: true,
                        contentId: item.id,
                        filename: item.filename || item.reference_title || 'Untitled',
                      });
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete from library"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1 pr-16">
                  {item.filename || item.reference_title || "Untitled"}
                </h3>
                {item.surah_number || item.surah_name ? (
                  <p className="text-sm text-gray-600">
                    {item.surah_name || `Surah ${item.surah_number}`}
                    {item.ayah_number && ` - Ayah ${item.ayah_number}`}
                  </p>
                ) : (
                  <p className="text-sm text-amber-600 italic">Surah/Ayah not set</p>
                )}
                {item.maqam && (
                  <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {item.maqam}
                  </span>
                )}
                <div className="flex items-center justify-between mt-2">
                  {item.reference_duration && (
                    <p className="text-xs text-gray-500">
                      Duration: {Math.round(item.reference_duration)}s
                    </p>
                  )}
                  {item.text_segments && item.text_segments.length > 0 && (
                    <p className="text-xs text-slate-600 font-medium">
                      {item.text_segments.length} text segment{item.text_segments.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student Details Modal */}
      {selectedStudentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {studentDetails ? (
                  `${studentDetails.student.full_name || studentDetails.student.email}'s Details`
                ) : (
                  "Student Details"
                )}
              </h2>
              <button
                onClick={closeStudentDetails}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : studentDetails ? (
                <div className="space-y-6">
                  {/* Student Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-2">Student Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Email:</span>{" "}
                        <span className="text-gray-800">{studentDetails.student.email}</span>
                      </div>
                      {studentDetails.student.full_name && (
                        <div>
                          <span className="text-gray-600">Name:</span>{" "}
                          <span className="text-gray-800">{studentDetails.student.full_name}</span>
                        </div>
                      )}
                      {studentDetails.student.joined_at && (
                        <div>
                          <span className="text-gray-600">Joined:</span>{" "}
                          <span className="text-gray-800">
                            {new Date(studentDetails.student.joined_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {studentDetails.student.last_active && (
                        <div>
                          <span className="text-gray-600">Last Active:</span>{" "}
                          <span className="text-gray-800">
                            {new Date(studentDetails.student.last_active).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">Statistics</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Sessions</p>
                        <p className="text-2xl font-bold text-gray-800">
                          {studentDetails.statistics.total_sessions}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Average Score</p>
                        <p className="text-2xl font-bold text-gray-800">
                          {Math.round(studentDetails.statistics.average_score)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Best Score</p>
                        <p className="text-2xl font-bold text-gray-800">
                          {Math.round(studentDetails.statistics.best_score)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Latest Score</p>
                        <p className="text-2xl font-bold text-gray-800">
                          {Math.round(studentDetails.statistics.latest_score)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recordings */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">
                      Recordings ({studentDetails.total_recordings})
                    </h3>
                    {studentDetails.recordings.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <FileAudio className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No recordings yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {studentDetails.recordings.map((recording) => (
                          <div
                            key={recording.session_id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <FileAudio className="w-5 h-5 text-blue-500" />
                                  <h4 className="font-semibold text-gray-800">
                                    {recording.reference?.title || "Untitled Recording"}
                                  </h4>
                                </div>
                                {recording.reference && (
                                  <p className="text-sm text-gray-600 mb-2">
                                    {recording.reference.maqam && (
                                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-2">
                                        {recording.reference.maqam}
                                      </span>
                                    )}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  {recording.created_at && (
                                    <span>
                                      {new Date(recording.created_at).toLocaleString()}
                                    </span>
                                  )}
                                  {recording.duration && (
                                    <span>Duration: {Math.round(recording.duration)}s</span>
                                  )}
                                  {recording.score !== undefined && (
                                    <span className="font-semibold text-gray-800">
                                      Score: {Math.round(recording.score)}%
                                    </span>
                                  )}
                                </div>
                                {recording.progress?.verse_scores && (
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <p className="text-xs text-gray-600 mb-1">Verse Scores:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {recording.progress.verse_scores.slice(0, 5).map((verse: any, idx: number) => (
                                        <span
                                          key={idx}
                                          className="text-xs bg-blue-50 text-blue-800 px-2 py-1 rounded"
                                          title={verse.text || `Score: ${verse.score}`}
                                        >
                                          {verse.score !== undefined ? `${Math.round(verse.score)}%` : "N/A"}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Progress History */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">
                      Progress History ({studentDetails.total_progress_records})
                    </h3>
                    {studentDetails.progress.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No progress records yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {studentDetails.progress.slice(0, 20).map((progress) => (
                          <div
                            key={progress.id}
                            className="border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-800">
                                  {Math.round(progress.overall_score)}%
                                </span>
                                {progress.improvement !== undefined && progress.improvement !== null && (
                                  <span
                                    className={`text-sm flex items-center gap-1 ${
                                      progress.improvement > 0
                                        ? "text-green-600"
                                        : progress.improvement < 0
                                        ? "text-red-600"
                                        : "text-gray-600"
                                    }`}
                                  >
                                    {progress.improvement > 0 ? (
                                      <TrendingUp className="w-4 h-4" />
                                    ) : progress.improvement < 0 ? (
                                      <TrendingDown className="w-4 h-4" />
                                    ) : null}
                                    {progress.improvement > 0 ? "+" : ""}
                                    {progress.improvement.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                {progress.created_at &&
                                  new Date(progress.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500">
                  <p>Failed to load student details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Remove Content"
        message={`Are you sure you want to remove "${deleteConfirm.filename}" from your content library?`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        onConfirm={async () => {
          try {
            await deleteQariContent(deleteConfirm.contentId);
            // Refresh content library
            const contentData = await getQariContent();
            setContent(contentData.content);
            setDeleteConfirm({ isOpen: false, contentId: '', filename: '' });
          } catch (err: any) {
            setError(err.message || "Failed to delete content");
            setDeleteConfirm({ isOpen: false, contentId: '', filename: '' });
          }
        }}
        onCancel={() => {
          setDeleteConfirm({ isOpen: false, contentId: '', filename: '' });
        }}
      />
      </div>
    </div>
  );
};

export default QariDashboard;
