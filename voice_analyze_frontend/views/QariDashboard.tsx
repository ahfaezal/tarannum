/**
 * Qari Dashboard - View students, scores, and progress.
 */
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQariStudents, getQariContent, getQariCommissionStats, getQariReferralInfo, getStudentDetails, getQariStudentActivitySummary, getQariStudentSelectedRecordings, playSessionRecordingAudio, ManagedRecordingAudio, rebuildQariStudentSelectedRecordings, StudentDetails, QariStudentActivitySummary, SelectedRecordingsResponse, deleteQariContent, updateQariContent } from "../services/platformService";
import { StudentInfo, QariContent } from "../services/platformService";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Download,
  Edit,
  FileAudio,
  PlayCircle,
  Link as LinkIcon,
  QrCode,
  RefreshCw,
  Sparkles,
  Square,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

const QariDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [content, setContent] = useState<QariContent[]>([]);
  const [commissionStats, setCommissionStats] = useState<{
    active_students: number;
    referral_code: string;
    commission_rate: number;
    royalty_earned: number;
    royalty_currency: string;
    referral_breakdown: Array<{ code: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [referralInfo, setReferralInfo] = useState<{ referralCode: string; qariName: string } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null);
  const [studentActivitySummary, setStudentActivitySummary] = useState<QariStudentActivitySummary | null>(null);
  const [selectedRecordings, setSelectedRecordings] = useState<SelectedRecordingsResponse | null>(null);
  const [selectedRecordingError, setSelectedRecordingError] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showAllWeakVerses, setShowAllWeakVerses] = useState(false);
  const [showAllContent, setShowAllContent] = useState(false);
  const [showAllRecordings, setShowAllRecordings] = useState(false);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const [updatingContentId, setUpdatingContentId] = useState<string | null>(null);
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
      const referralData = await getQariReferralInfo().catch(() => null);
      setStudents(studentsData.students);
      setContent(contentData.content);
      if (commissionData) {
        setCommissionStats(commissionData);
      }
      if (referralData) {
        setReferralInfo(referralData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const referralCode = referralInfo?.referralCode || commissionStats?.referral_code || "";
  const referralLink = referralCode ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}` : "";
  const qrImageUrl = referralLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(referralLink)}`
    : "";

  const changeContentVisibility = async (
    item: QariContent,
    visibility_status: NonNullable<QariContent["visibility_status"]>,
  ) => {
    try {
      setUpdatingContentId(item.id);
      await updateQariContent(item.id, { visibility_status });
      setContent((current) => current.map((entry) => (
        entry.id === item.id
          ? { ...entry, visibility_status, public_demo_approved: visibility_status === "public_demo" ? false : entry.public_demo_approved }
          : entry
      )));
    } catch (err: any) {
      setError(err.message || "Failed to update content visibility");
    } finally {
      setUpdatingContentId(null);
    }
  };

  const copyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleStudentClick = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setLoadingDetails(true);
    setStudentDetails(null);
    setStudentActivitySummary(null);
    setSelectedRecordings(null);
    setSelectedRecordingError(null);
    setShowAllRecordings(false);
    setShowAllProgress(false);
    try {
      const [details, activitySummary, selectedRecordingData] = await Promise.all([
        getStudentDetails(studentId),
        getQariStudentActivitySummary(studentId).catch(() => null),
        getQariStudentSelectedRecordings(studentId).catch((err) => {
          setSelectedRecordingError(err.message || "Failed to load selected recordings");
          return null;
        }),
      ]);
      setStudentDetails(details);
      setStudentActivitySummary(activitySummary);
      setSelectedRecordings(selectedRecordingData);
    } catch (err: any) {
      setError(err.message || "Failed to load student details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRebuildStudentSelectedRecordings = async () => {
    if (!selectedStudentId) {
      return;
    }

    setSelectedRecordingError(null);
    try {
      await rebuildQariStudentSelectedRecordings(selectedStudentId);
      const rebuilt = await getQariStudentSelectedRecordings(selectedStudentId);
      setSelectedRecordings(rebuilt);
    } catch (err: any) {
      setSelectedRecordingError(err.message || "Failed to rebuild selected recordings");
    }
  };

  const closeStudentDetails = () => {
    setSelectedStudentId(null);
    setStudentDetails(null);
    setStudentActivitySummary(null);
    setSelectedRecordings(null);
    setSelectedRecordingError(null);
    setShowAllRecordings(false);
    setShowAllProgress(false);
  };

  const getStudentScore = (student: StudentInfo) =>
    student.statistics?.average_score || student.latest_score || 0;

  const getTrendValue = (student: StudentInfo) => {
    if (student.improvement !== undefined && student.improvement !== null) {
      return student.improvement;
    }
    const trend = student.statistics?.improvement_trend || [];
    return trend.length > 0 ? trend[trend.length - 1] : 0;
  };

  const getTrendLabel = (student: StudentInfo) => {
    const trend = getTrendValue(student);
    if (trend > 0.5) return "Up";
    if (trend < -0.5) return "Down";
    return "Flat";
  };

  const getTrendClasses = (student: StudentInfo) => {
    const label = getTrendLabel(student);
    if (label === "Up") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (label === "Down") return "bg-red-50 text-red-700 border-red-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  const formatScore = (score?: number | null) =>
    score !== undefined && score !== null ? `${Math.round(score)}%` : "No score";

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Duration not set";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
  };

  const formatPracticeMinutes = (minutes?: number | null) => {
    if (!minutes) return "0m";
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    const rounded = Math.round(minutes);
    return `${rounded}m`;
  };

  const getActivityLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      practice_started: "Practice started",
      practice_stopped: "Practice completed",
      reference_play: "Reference played",
      reference_pause: "Reference paused",
      recording_started: "Recording started",
      recording_submitted: "Recording submitted",
      analysis_completed: "Analysis completed",
    };
    return labels[eventType] || eventType.replace(/_/g, " ");
  };

  const getReferenceDisplayName = (record: any) => {
    return (
      record?.surah_name ||
      record?.reference_title ||
      record?.reference_filename ||
      record?.reference?.title ||
      record?.reference?.filename ||
      (record?.reference_id ? `Reference ${String(record.reference_id).slice(0, 8)}` : "Unknown Reference")
    );
  };

  const getModalCoachingMessage = () => {
    if (studentActivitySummary?.coaching_snapshot?.recommendation) {
      return studentActivitySummary.coaching_snapshot.recommendation;
    }
    if (!studentDetails) return "Start with reference listening before assessment.";
    if (studentDetails.statistics.total_sessions === 0) {
      return "Start with reference listening before assessment.";
    }
    if ((studentActivitySummary?.total_practice_sessions || 0) === 0) {
      return "Student has assessment records but limited tracked practice.";
    }
    return "Review weak verses and encourage consistent short practice sessions.";
  };

  const getReferenceFocus = () => {
    if (!studentDetails) return [];
    const grouped = new Map<
      string,
      { name: string; scores: number[]; dates: string[] }
    >();

    studentDetails.progress.forEach((progress) => {
      const key = progress.reference_id || getReferenceDisplayName(progress);
      const existing = grouped.get(key) || {
        name: getReferenceDisplayName(progress),
        scores: [],
        dates: [],
      };
      existing.scores.push(progress.overall_score || 0);
      if (progress.created_at) existing.dates.push(progress.created_at);
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .map((item) => {
        const average = item.scores.length
          ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
          : 0;
        const best = item.scores.length ? Math.max(...item.scores) : 0;
        const first = item.scores[0] || 0;
        const last = item.scores[item.scores.length - 1] || 0;
        const trend = last > first + 0.5 ? "Up" : last < first - 0.5 ? "Down" : "Flat";
        return {
          ...item,
          average,
          best,
          trend,
          count: item.scores.length,
          latestAt: item.dates[0] || "",
        };
      })
      .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt))
      .slice(0, 5);
  };

  const filteredStudents = students.filter((student) => {
    if (studentFilter === "all") return true;
    const lastActive = new Date(student.last_active);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (studentFilter === "active") return lastActive >= thirtyDaysAgo;
    if (studentFilter === "inactive") return lastActive < thirtyDaysAgo;
    return true;
  });

  const qariName = referralInfo?.qariName || "Qari";
  const activeStudentCount = commissionStats?.active_students ?? students.length;
  const totalAssessments = students.reduce(
    (sum, student) => sum + (student.statistics?.total_sessions || 0),
    0
  );
  const scoredStudents = students.filter(
    (student) => student.latest_score !== undefined || (student.statistics?.total_sessions || 0) > 0
  );
  const averageStudentScore =
    scoredStudents.length > 0
      ? scoredStudents.reduce((sum, student) => sum + getStudentScore(student), 0) / scoredStudents.length
      : 0;
  const bestStudentScore =
    students.length > 0
      ? Math.max(...students.map((student) => student.statistics?.best_score || student.latest_score || 0))
      : 0;

  const coachingMessage =
    students.length === 0
      ? "Invite students using your referral QR to begin coaching with Tarannum AI."
      : averageStudentScore >= 80
      ? "Your students are performing strongly. Keep reinforcing consistency and expressive control."
      : averageStudentScore >= 60
      ? "Your students are improving. Focus on weak verses and consistent practice."
      : "Your students need guided repetition. Start with short references and review weak verses often.";

  const performanceDistribution = [
    {
      label: "High performers",
      range: "80%+",
      count: students.filter((student) => getStudentScore(student) >= 80).length,
      color: "bg-emerald-500",
      soft: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Developing",
      range: "60-79%",
      count: students.filter((student) => {
        const score = getStudentScore(student);
        return score >= 60 && score < 80;
      }).length,
      color: "bg-amber-500",
      soft: "bg-amber-50 text-amber-700",
    },
    {
      label: "Needs support",
      range: "<60%",
      count: students.filter((student) => getStudentScore(student) > 0 && getStudentScore(student) < 60).length,
      color: "bg-red-500",
      soft: "bg-red-50 text-red-700",
    },
  ];

  const commonWeakVerses = Object.values(
    students.reduce<Record<string, { text: string; frequency: number }>>((acc, student) => {
      (student.statistics?.weakest_verses || []).forEach((verse) => {
        if (!verse.text) return;
        acc[verse.text] = acc[verse.text] || { text: verse.text, frequency: 0 };
        acc[verse.text].frequency += verse.frequency || 1;
      });
      return acc;
    }, {})
  ).sort((a, b) => b.frequency - a.frequency);

  const visibleStudents = showAllStudents ? filteredStudents : filteredStudents.slice(0, 5);
  const visibleWeakVerses = showAllWeakVerses ? commonWeakVerses : commonWeakVerses.slice(0, 5);
  const visibleContent = showAllContent ? content : content.slice(0, 6);

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
        {/* Hero Summary */}
        <div className="mb-8 overflow-hidden rounded-3xl bg-slate-950 shadow-2xl shadow-slate-200">
          <div className="grid gap-8 p-6 text-white md:grid-cols-[1.5fr_1fr] md:p-8">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Coaching Dashboard
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                Assalamualaikum, {qariName}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                {coachingMessage}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="text-2xl font-bold">{students.length}</div>
                  <div className="text-xs text-slate-300">Total Students</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="text-2xl font-bold">{activeStudentCount}</div>
                  <div className="text-xs text-slate-300">Active Students</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="text-2xl font-bold">{formatScore(averageStudentScore)}</div>
                  <div className="text-xs text-slate-300">Avg Score</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div className="text-2xl font-bold">{formatScore(bestStudentScore)}</div>
                  <div className="text-xs text-slate-300">Best Score</div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-200">Coaching Focus</p>
                  <h2 className="mt-2 text-2xl font-bold">Weak verses + consistency</h2>
                </div>
                <Target className="h-10 w-10 text-emerald-300" />
              </div>
              <div className="mt-6 space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>Total assessments</span>
                  <span className="font-bold">{totalAssessments}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>Content references</span>
                  <span className="font-bold">{content.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <span>Common weak verses</span>
                  <span className="font-bold">{commonWeakVerses.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 md:gap-6 mb-8">
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
                  {formatScore(averageStudentScore)}
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
                  <p className="text-sm font-medium text-slate-600 mb-1">Royalty Earned</p>
                  <p className="text-3xl font-bold text-amber-600">
                    {commissionStats.royalty_currency || "USD"} {Number(commissionStats.royalty_earned || 0).toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Assessments</p>
                <p className="text-3xl font-bold text-cyan-600">{totalAssessments}</p>
              </div>
              <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-cyan-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Best Student Score</p>
                <p className="text-3xl font-bold text-rose-600">{formatScore(bestStudentScore)}</p>
              </div>
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center">
                <Award className="w-6 h-6 text-rose-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Student Registration QR Section */}
        {referralCode && referralLink && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-slate-800">Student Registration QR</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center">
                <img
                  src={qrImageUrl}
                  alt="Student registration QR code"
                  className="w-56 h-56 rounded-lg bg-white"
                />
              </div>
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Share this QR code with students. Students who register through this link will be linked to your Qari account after email verification.
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    <LinkIcon className="w-4 h-4" />
                    Referral Link
                  </div>
                  <div className="break-all text-sm font-medium text-slate-800">{referralLink}</div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={copyReferralLink}
                    className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-medium"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-5 h-5" />
                        Link Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        Copy Link
                      </>
                    )}
                  </button>
                  <a
                    href={qrImageUrl}
                    download={`tarannum-qari-${referralCode}-qr.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    <Download className="w-5 h-5" />
                    Download QR Code
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5 text-amber-500" />
              Student Performance Distribution
            </h2>
            <p className="text-sm text-slate-500 mb-5">Based on existing student score data.</p>
            {students.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No student scores yet.
              </div>
            ) : (
              <div className="space-y-4">
                {performanceDistribution.map((item) => {
                  const width = students.length > 0 ? Math.round((item.count / students.length) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-2 text-sm">
                        <span className="font-semibold text-slate-700">{item.label}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.soft}`}>
                          {item.count} student{item.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${item.color}`} style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{item.range}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Common Weak Verses
            </h2>
            <p className="text-sm text-slate-500 mb-5">Aggregated from current student progress records.</p>
            {commonWeakVerses.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No weak verse data yet.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleWeakVerses.map((verse, index) => {
                  const difficulty = verse.frequency >= 3 ? "High" : verse.frequency === 2 ? "Medium" : "Low";
                  const difficultyClass =
                    difficulty === "High"
                      ? "bg-red-50 text-red-700"
                      : difficulty === "Medium"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700";
                  return (
                    <div key={`${verse.text}-${index}`} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Priority {index + 1}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${difficultyClass}`}>
                          {difficulty}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{verse.text}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Appears {verse.frequency} time{verse.frequency !== 1 ? "s" : ""}
                      </p>
                    </div>
                  );
                })}
                {commonWeakVerses.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllWeakVerses(!showAllWeakVerses)}
                    className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    {showAllWeakVerses ? "Show Less" : "View All Weak Verses"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-emerald-50/80 rounded-xl shadow-sm border border-dashed border-emerald-300 p-6 mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Competition Groups</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Create training groups and leaderboards for schools and events.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="px-4 py-3 rounded-xl bg-slate-900/30 text-white text-sm font-bold cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>

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
                {visibleStudents.map((student) => (
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
                      <div className="text-sm text-gray-600 mt-1 space-y-1">
                        <div>{student.statistics.total_sessions} sessions</div>
                        <div>Avg: {formatScore(student.statistics.average_score)}</div>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${getTrendClasses(student)}`}>
                          {getTrendLabel(student) === "Up" && <TrendingUp className="w-3 h-3" />}
                          {getTrendLabel(student) === "Down" && <TrendingDown className="w-3 h-3" />}
                          {getTrendLabel(student)}
                        </span>
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
                {filteredStudents.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllStudents(!showAllStudents)}
                    className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    {showAllStudents ? "Show Less" : `Show More (${filteredStudents.length - 5} more)`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Content Library */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              My Content Library
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {content.length} reference{content.length !== 1 ? "s" : ""} available for coaching.
            </p>
          </div>
        </div>
        {content.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>No content yet.</p>
            <p className="text-sm mt-2">Upload reference audios in the Training Studio to add them to your library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleContent.map((item) => (
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
                  {item.surah_name || item.reference_title || item.filename || "Untitled Reference"}
                </h3>
                <p className="text-xs text-slate-500 mb-2">
                  {item.filename || item.reference_title || "No filename"}
                </p>
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
                <div className="mt-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Visibility
                  </label>
                  <select
                    value={item.visibility_status || "students_only"}
                    disabled={updatingContentId === item.id}
                    onChange={(event) => changeContentVisibility(
                      item,
                      event.target.value as NonNullable<QariContent["visibility_status"]>,
                    )}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                  >
                    <option value="draft">Draft</option>
                    <option value="students_only">Listed for Students</option>
                    <option value="public_demo">Public Demo — Approval Required</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  {item.visibility_status === "public_demo" && (
                    <p className={`mt-1 text-xs font-medium ${item.public_demo_approved ? "text-emerald-700" : "text-amber-700"}`}>
                      {item.public_demo_approved ? "Approved for public demo" : "Pending Admin approval"}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    {formatDuration(item.reference_duration || item.duration)}
                  </p>
                  <p className="text-xs text-slate-600 font-medium">
                    {item.text_segments?.length || 0} text segment{(item.text_segments?.length || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {content.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllContent(!showAllContent)}
            className="mt-4 w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {showAllContent ? "Show Less" : `Show More Content (${content.length - 6} more)`}
          </button>
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
                  `${studentDetails.student.full_name || studentDetails.student.email}'s Coaching Profile`
                ) : (
                  "Student Coaching Profile"
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

                  {/* Learning Activity Summary */}
                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900">Learning Activity Summary</h3>
                        <p className="text-sm text-gray-600">Tracked practice behavior before and after assessments.</p>
                      </div>
                      {studentActivitySummary?.last_practice_at && (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
                          Last practice: {new Date(studentActivitySummary.last_practice_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {!studentActivitySummary || studentActivitySummary.recent_activity.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-5 text-sm text-gray-600">
                        No tracked practice activity yet. Start with reference listening before assessment.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {[
                          { label: "Practice Sessions", value: studentActivitySummary.total_practice_sessions },
                          { label: "Practice Time", value: formatPracticeMinutes(studentActivitySummary.total_practice_minutes) },
                          { label: "Reference Plays", value: studentActivitySummary.total_reference_plays },
                          { label: "Recordings Submitted", value: studentActivitySummary.total_recordings_submitted },
                          { label: "Practice Streak", value: `${studentActivitySummary.practice_streak_days}d` },
                        ].map((item) => (
                          <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm border border-white">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
                            <p className="mt-2 text-2xl font-bold text-gray-900">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coaching Insight */}
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-blue-950">Coaching Insight</h3>
                        <p className="mt-1 text-sm text-blue-800">{getModalCoachingMessage()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Practice vs Assessment */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-bold text-gray-900 mb-4">Practice vs Assessment</h3>
                    {studentActivitySummary ? (
                      <div className="space-y-4">
                        {[
                          {
                            label: "Practice Sessions",
                            value: studentActivitySummary.total_practice_sessions,
                            color: "bg-emerald-500",
                          },
                          {
                            label: "Recordings Submitted",
                            value: studentActivitySummary.total_recordings_submitted,
                            color: "bg-blue-500",
                          },
                          {
                            label: "Analysis Completed",
                            value: studentActivitySummary.total_analysis_completed,
                            color: "bg-purple-500",
                          },
                        ].map((item) => {
                          const maxValue = Math.max(
                            studentActivitySummary.total_practice_sessions,
                            studentActivitySummary.total_recordings_submitted,
                            studentActivitySummary.total_analysis_completed,
                            1
                          );
                          return (
                            <div key={item.label}>
                              <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-700">{item.label}</span>
                                <span className="font-bold text-gray-900">{item.value}</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100">
                                <div
                                  className={`h-2 rounded-full ${item.color}`}
                                  style={{ width: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No tracked practice activity yet.</p>
                    )}
                  </div>

                  {/* Weekly Activity */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-bold text-gray-900 mb-4">Weekly Activity</h3>
                    {studentActivitySummary && studentActivitySummary.weekly_activity.length > 0 ? (
                      <div className="grid grid-cols-7 gap-2">
                        {studentActivitySummary.weekly_activity.map((day) => {
                          const maxDayValue = Math.max(
                            ...studentActivitySummary.weekly_activity.map(
                              (entry) => entry.practice_sessions + entry.practice_minutes + entry.recordings
                            ),
                            1
                          );
                          const dayValue = day.practice_sessions + day.practice_minutes + day.recordings;
                          return (
                            <div key={day.date} className="flex flex-col items-center gap-2">
                              <div className="flex h-24 w-full max-w-10 items-end justify-center rounded-lg bg-slate-50 p-1">
                                <div
                                  className="w-full rounded-md bg-gradient-to-t from-emerald-500 to-blue-400"
                                  style={{ height: `${Math.max((dayValue / maxDayValue) * 100, dayValue > 0 ? 10 : 0)}%` }}
                                  title={`${day.practice_sessions} sessions, ${day.practice_minutes} mins, ${day.recordings} recordings`}
                                />
                              </div>
                              <span className="text-[11px] font-semibold text-gray-500">
                                {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No tracked practice activity yet.</p>
                    )}
                  </div>

                  {/* Recent Learning Activity */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-bold text-gray-900 mb-4">Recent Learning Activity</h3>
                    {studentActivitySummary && studentActivitySummary.recent_activity.length > 0 ? (
                      <div className="space-y-2">
                        {studentActivitySummary.recent_activity.slice(0, 8).map((event, index) => (
                          <div key={`${event.event_type}-${event.created_at}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <span className="font-medium text-gray-800">{getActivityLabel(event.event_type)}</span>
                            <span className="text-gray-500">
                              {event.created_at ? new Date(event.created_at).toLocaleString() : "Time unavailable"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No tracked practice activity yet.</p>
                    )}
                  </div>

                  {/* Surah / Reference Focus */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-bold text-gray-900 mb-4">Surah / Reference Focus</h3>
                    {getReferenceFocus().length === 0 ? (
                      <p className="text-sm text-gray-500">No scored recordings yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {getReferenceFocus().map((item) => (
                          <div key={item.name} className="rounded-xl border border-slate-100 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-semibold text-gray-900">{item.name}</p>
                                <p className="text-xs text-gray-500">{item.count} assessments</p>
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  item.trend === "Up"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : item.trend === "Down"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-slate-50 text-slate-600"
                                }`}
                              >
                                {item.trend}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-gray-500">Average</span>
                                <p className="font-bold text-gray-900">{Math.round(item.average)}%</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Best</span>
                                <p className="font-bold text-gray-900">{Math.round(item.best)}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <SelectedStudentRecordingsPanel
                    data={selectedRecordings}
                    error={selectedRecordingError}
                    onPlay={playSessionRecordingAudio}
                    onRebuild={handleRebuildStudentSelectedRecordings}
                  />

                  {/* Recordings */}
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-3">
                      Recordings ({studentDetails.total_recordings})
                    </h3>
                    {studentDetails.recordings.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <FileAudio className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No scored recordings yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(showAllRecordings ? studentDetails.recordings : studentDetails.recordings.slice(0, 5)).map((recording) => (
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
                        {studentDetails.recordings.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllRecordings(!showAllRecordings)}
                            className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            {showAllRecordings ? "Show Less" : `Show More Recordings (${studentDetails.recordings.length - 5} more)`}
                          </button>
                        )}
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
                        <p>No progress records yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(showAllProgress ? studentDetails.progress : studentDetails.progress.slice(0, 5)).map((progress) => (
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
                        {studentDetails.progress.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllProgress(!showAllProgress)}
                            className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            {showAllProgress ? "Show Less" : `Show More Progress (${studentDetails.progress.length - 5} more)`}
                          </button>
                        )}
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


const selectedSlotLabels: Record<"lowest" | "median" | "highest", string> = {
  lowest: "Lowest",
  median: "Middle",
  highest: "Highest",
};

const SelectedStudentRecordingsPanel: React.FC<{
  data: SelectedRecordingsResponse | null;
  error: string | null;
  onPlay: (sessionId: string) => Promise<ManagedRecordingAudio>;
  onRebuild: () => Promise<void>;
}> = ({ data, error, onPlay, onRebuild }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const activeAudioRef = useRef<ManagedRecordingAudio | null>(null);
  const references = data?.references || [];
  const hasRecordings = references.some((reference) =>
    (["lowest", "median", "highest"] as const).some((slot) => reference.recordings[slot])
  );

  const stopActiveAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current.cleanup();
      activeAudioRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  };

  useEffect(() => () => stopActiveAudio(), []);

  const handlePlay = async (sessionId: string) => {
    if (playingId === sessionId || loadingId === sessionId) {
      stopActiveAudio();
      return;
    }

    try {
      stopActiveAudio();
      setLoadingId(sessionId);
      const audio = await onPlay(sessionId);
      activeAudioRef.current = audio;
      setPlayingId(sessionId);
      audio.addEventListener(
        "ended",
        () => {
          if (activeAudioRef.current === audio) {
            activeAudioRef.current = null;
            setPlayingId(null);
          }
        },
        { once: true }
      );
    } catch (err) {
      stopActiveAudio();
      throw err;
    } finally {
      setLoadingId(null);
    }
  };

  const handleRebuild = async () => {
    try {
      setIsRebuilding(true);
      await onRebuild();
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-cyan-600" />
            Selected Voice Recordings
          </h3>
          <p className="text-sm text-cyan-800">
            Student-only audio selected as lowest, middle and highest score samples.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRebuild}
          disabled={isRebuilding}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRebuilding ? "animate-spin" : ""}`} />
          {isRebuilding ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
      ) : !hasRecordings ? (
        <p className="text-sm text-cyan-800">No selected recordings yet.</p>
      ) : (
        <div className="space-y-3">
          {references.map((reference) => (
            <div key={reference.reference_id || "unknown"} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="font-semibold text-gray-900">
                {reference.reference?.title || reference.reference_id || "Unknown Reference"}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(["lowest", "median", "highest"] as const).map((slot) => {
                  const recording = reference.recordings[slot];
                  return (
                    <div key={slot} className="rounded-lg border border-slate-100 p-3">
                      <p className="text-xs font-bold uppercase text-slate-500">{selectedSlotLabels[slot]}</p>
                      {recording ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold text-slate-900">{Math.round(recording.score)}%</p>
                            {recording.duration && (
                              <p className="text-xs text-slate-500">{Math.round(recording.duration)}s</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePlay(recording.session_id)}
                            disabled={loadingId === recording.session_id}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                              playingId === recording.session_id
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-cyan-600 hover:bg-cyan-700"
                            }`}
                          >
                            {playingId === recording.session_id ? (
                              <Square className="h-3.5 w-3.5" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5" />
                            )}
                            {loadingId === recording.session_id
                              ? "Loading"
                              : playingId === recording.session_id
                                ? "Stop"
                                : "Play"}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">Not available</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QariDashboard;
