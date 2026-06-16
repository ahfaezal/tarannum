/**
 * Student Progress View - multi-surah infographic dashboard.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  getStudentProgress,
  getStudentStatistics,
  StudentProgress,
  StudentStatistics,
} from "../services/platformService";
import {
  getStudentActivitySummary,
  StudentActivitySummary,
} from "../services/studentActivityService";
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Lock,
  Mic,
  PlayCircle,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRound,
} from "lucide-react";

const emptyActivitySummary: StudentActivitySummary = {
  total_practice_sessions: 0,
  total_practice_minutes: 0,
  total_reference_plays: 0,
  total_recordings_started: 0,
  total_recordings_submitted: 0,
  total_analysis_completed: 0,
  practice_streak_days: 0,
  last_practice_at: null,
  weekly_activity: [],
  recent_activity: [],
  qari: null,
};

const activityLabels: Record<string, string> = {
  practice_started: "Practice started",
  practice_stopped: "Practice completed",
  reference_play: "Reference played",
  reference_pause: "Reference paused",
  recording_started: "Recording started",
  recording_submitted: "Recording submitted",
  analysis_completed: "Analysis completed",
};

const getProgressLevel = (score: number) => {
  if (score >= 95) {
    return {
      label: "Master",
      color: "bg-purple-100 text-purple-700 border-purple-200",
      message: "Excellent control. Keep polishing the details of tone and flow.",
    };
  }
  if (score >= 85) {
    return {
      label: "Advanced",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      message: "Strong progress. Your recitation is becoming more consistent.",
    };
  }
  if (score >= 70) {
    return {
      label: "Intermediate",
      color: "bg-blue-100 text-blue-700 border-blue-200",
      message: "Good momentum. Focus on steadier pitch and smoother rhythm.",
    };
  }
  if (score >= 50) {
    return {
      label: "Developing",
      color: "bg-amber-100 text-amber-700 border-amber-200",
      message: "You are building the foundation. Repeat short sections often.",
    };
  }
  return {
    label: "Beginner",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    message: "Start gently. Listen, repeat, record, and improve step by step.",
  };
};

const getReferenceLabel = (referenceId?: string): string => {
  if (!referenceId) {
    return "Unknown Reference";
  }
  return `Reference ${referenceId.slice(0, 8)}`;
};

const readStringField = (
  source: unknown,
  keys: string[]
): string | undefined => {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const getReferenceDisplayName = (record?: Partial<StudentProgress>): string => {
  if (!record) {
    return "Unknown Reference";
  }

  const directName = readStringField(record, [
    "surah_name",
    "reference_title",
    "reference_filename",
    "title",
    "filename",
    "file_name",
  ]);
  if (directName) {
    return directName;
  }

  const nestedReference = (record as Record<string, unknown>).reference;
  const nestedName = readStringField(nestedReference, [
    "surah_name",
    "title",
    "filename",
    "file_name",
  ]);
  if (nestedName) {
    return nestedName;
  }

  return getReferenceLabel(record.reference_id);
};

const getCoachingRecommendation = (
  latestScore: number,
  hasAssessments: boolean
): string => {
  if (!hasAssessments) {
    return "Start your first recording to unlock personalised feedback.";
  }
  if (latestScore >= 80) {
    return "Excellent progress. Keep your consistency and maintain your pitch control.";
  }
  if (latestScore >= 60) {
    return "Good progress. Focus on weak verses and repeat short segments.";
  }
  return "Keep practicing. Start with slower reference playback and repeat each verse.";
};

const formatMinutes = (minutes: number): string => {
  if (!minutes) {
    return "0m";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const scoreColor = (score: number): string => {
  if (score < 60) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#10b981";
};

const difficultyForCount = (count: number) => {
  if (count >= 3) {
    return {
      label: "High",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (count === 2) {
    return {
      label: "Medium",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    };
  }
  return {
    label: "Low",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
};

const StudentProgressView: React.FC = () => {
  const [progress, setProgress] = useState<StudentProgress[]>([]);
  const [statistics, setStatistics] = useState<StudentStatistics | null>(null);
  const [activitySummary, setActivitySummary] =
    useState<StudentActivitySummary>(emptyActivitySummary);
  const [showAllAssessments, setShowAllAssessments] = useState(false);
  const [selectedReferenceId, setSelectedReferenceId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      setLoading(true);
      setError(null);
      const [progressData, statsData, activityData] = await Promise.all([
        getStudentProgress(50),
        getStudentStatistics(),
        getStudentActivitySummary(),
      ]);
      setProgress(progressData.progress);
      setStatistics(statsData);
      setActivitySummary(activityData);
    } catch (err: any) {
      setError(err.message || "Failed to load progress");
    } finally {
      setLoading(false);
    }
  };

  const sortedAssessments = useMemo(
    () =>
      [...progress].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [progress]
  );

  const chronologicalAssessments = useMemo(
    () => [...sortedAssessments].reverse(),
    [sortedAssessments]
  );

  const scoreStats = {
    average: Math.round(statistics?.average_score || 0),
    best: Math.round(statistics?.best_score || 0),
    latest: Math.round(statistics?.latest_score || 0),
  };

  const overallScore = scoreStats.latest || scoreStats.average || 0;
  const level = getProgressLevel(overallScore);
  const hasActivity = activitySummary.recent_activity.length > 0;
  const hasAssessments = sortedAssessments.length > 0;

  const weeklyMax = useMemo(
    () =>
      Math.max(
        1,
        ...activitySummary.weekly_activity.map((day) =>
          Math.max(day.practice_sessions, day.recordings, day.practice_minutes / 10)
        )
      ),
    [activitySummary.weekly_activity]
  );

  const performanceByReference = useMemo(() => {
    const grouped = new Map<string, StudentProgress[]>();
    chronologicalAssessments.forEach((item) => {
      const key = item.reference_id || "unknown";
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });

    return Array.from(grouped.entries())
      .map(([referenceId, items]) => {
        const scores = items.map((item) => item.overall_score);
        const average =
          scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
        const best = Math.max(...scores);
        const latest = scores[scores.length - 1] || 0;
        const earlierAverage =
          scores.length > 1
            ? scores
                .slice(0, -1)
                .reduce((sum, score) => sum + score, 0) /
              (scores.length - 1)
            : latest;
        const delta = latest - earlierAverage;

        return {
          referenceId,
          label: getReferenceDisplayName(items[items.length - 1]),
          sessions: items.length,
          average,
          best,
          latest,
          lastAssessedAt: items[items.length - 1]?.created_at || "",
          trend: delta > 2 ? "up" : delta < -2 ? "down" : "flat",
        };
      })
      .sort(
        (a, b) =>
          b.sessions - a.sessions ||
          new Date(b.lastAssessedAt).getTime() - new Date(a.lastAssessedAt).getTime()
      );
  }, [chronologicalAssessments]);

  const referenceFilterOptions = useMemo(
    () => [
      { id: "all", label: "All References" },
      ...performanceByReference.map((item) => ({
        id: item.referenceId,
        label: item.label,
      })),
    ],
    [performanceByReference]
  );

  const trendAssessments = useMemo(() => {
    const source =
      selectedReferenceId === "all"
        ? chronologicalAssessments
        : chronologicalAssessments.filter(
            (item) => (item.reference_id || "unknown") === selectedReferenceId
          );

    return source.slice(-15);
  }, [chronologicalAssessments, selectedReferenceId]);

  const currentMonthSummary = useMemo(
    () => buildMonthSummary(new Date(), chronologicalAssessments, activitySummary),
    [chronologicalAssessments, activitySummary]
  );

  const previousMonthSummary = useMemo(() => {
    const now = new Date();
    return buildMonthSummary(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      chronologicalAssessments,
      activitySummary
    );
  }, [chronologicalAssessments, activitySummary]);

  const achievements = useMemo(
    () => [
      {
        label: "First Assessment",
        unlocked: sortedAssessments.length >= 1,
        detail: "Complete one scored recording.",
      },
      {
        label: "5 Practice Sessions",
        unlocked: activitySummary.total_practice_sessions >= 5,
        detail: "Build your training habit.",
      },
      {
        label: "7 Day Streak",
        unlocked: activitySummary.practice_streak_days >= 7,
        detail: "Practice for seven days in a row.",
      },
      {
        label: "Score Improver",
        unlocked: (statistics?.improvement_trend || []).some((score) => score > 0),
        detail: "Show positive score movement.",
      },
      {
        label: "Above 80%",
        unlocked: scoreStats.best >= 80,
        detail: "Reach a strong assessment score.",
      },
      {
        label: "Consistent Learner",
        unlocked:
          activitySummary.total_practice_sessions >= 3 &&
          activitySummary.total_recordings_submitted >= 3,
        detail: "Practice and submit recordings regularly.",
      },
    ],
    [activitySummary, scoreStats.best, sortedAssessments.length, statistics]
  );

  const assessmentsToShow = showAllAssessments
    ? sortedAssessments
    : sortedAssessments.slice(0, 5);

  const coachingRecommendation = getCoachingRecommendation(
    scoreStats.latest,
    hasAssessments
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading your progress...</p>
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
              <TrendingDown className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg">Error Loading Progress</h3>
          </div>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600 mb-2">
            Student Progress
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            Multi-Surah Learning Dashboard
          </h1>
          <p className="text-slate-600 text-base">
            See your practice activity, scored assessments, and performance by reference.
          </p>
        </div>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 md:p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 text-white">
              <div className="flex flex-col lg:flex-row lg:items-center gap-8">
                <ProgressRing score={overallScore} />
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${level.color}`}
                    >
                      {level.label}
                    </span>
                    <span className="text-sm text-emerald-100">
                      Overall progress across all references
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-3">
                    {level.message}
                  </h2>
                  <p className="text-emerald-50 max-w-2xl">
                    Latest score is used first. If no latest score exists, the dashboard
                    uses your average score.
                  </p>

                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <HeroMetric label="Latest" value={`${scoreStats.latest}%`} />
                    <HeroMetric label="Best" value={`${scoreStats.best}%`} />
                    <HeroMetric label="Average" value={`${scoreStats.average}%`} />
                    <HeroMetric
                      label="Assessments"
                      value={sortedAssessments.length}
                    />
                  </div>
                </div>
                <div className="hidden lg:flex w-28 h-28 rounded-3xl bg-white/10 border border-white/15 items-center justify-center">
                  <Sparkles className="w-14 h-14 text-emerald-200" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Monthly Summary
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Current and previous month snapshot.
            </p>
            <div className="space-y-3">
              <MonthSummaryCard summary={currentMonthSummary} title="Current Month" />
              {(previousMonthSummary.assessments > 0 ||
                previousMonthSummary.practice_sessions > 0) && (
                <MonthSummaryCard summary={previousMonthSummary} title="Previous Month" />
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-8">
          <SummaryCard
            label="Total Practice Sessions"
            value={activitySummary.total_practice_sessions}
            icon={<Activity className="w-5 h-5" />}
            tone="emerald"
          />
          <SummaryCard
            label="Total Practice Time"
            value={formatMinutes(activitySummary.total_practice_minutes)}
            icon={<Clock className="w-5 h-5" />}
            tone="blue"
          />
          <SummaryCard
            label="Practice Streak"
            value={`${activitySummary.practice_streak_days}d`}
            icon={<Flame className="w-5 h-5" />}
            tone="amber"
          />
          <SummaryCard
            label="Assessments Submitted"
            value={activitySummary.total_recordings_submitted || sortedAssessments.length}
            icon={<Mic className="w-5 h-5" />}
            tone="purple"
          />
          <SummaryCard
            label="Average Score"
            value={`${scoreStats.average}%`}
            icon={<BarChart3 className="w-5 h-5" />}
            tone="emerald"
          />
          <SummaryCard
            label="Best Score"
            value={`${scoreStats.best}%`}
            icon={<Target className="w-5 h-5" />}
            tone="slate"
          />
        </section>

        <section className="bg-white rounded-3xl shadow-md border border-slate-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <UserRound className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Qari Insight
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  Your Qari: {activitySummary.qari?.qari_name || "Not assigned yet"}
                </h2>
                <p className="text-slate-600 mt-1 max-w-3xl">
                  {coachingRecommendation}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-cyan-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
              Tip: use weak verses as your next focused practice list.
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">
          <div className="xl:col-span-3 bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Assessment Score Trend
                </h2>
                <p className="text-sm text-slate-500">
                  Latest {Math.min(trendAssessments.length, 15)} assessment records.
                </p>
              </div>
              <select
                value={selectedReferenceId}
                onChange={(event) => setSelectedReferenceId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {referenceFilterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {!hasAssessments ? (
              <EmptyState
                title="No assessment results yet."
                message="Complete a recording to see your score trend."
              />
            ) : (
              <ScoreTrendChart assessments={trendAssessments} />
            )}
          </div>

          <div className="xl:col-span-2 bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">
              Practice vs Assessment
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Training actions are separate from scored results.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-5">
              <MetricGroup
                title="Training Activity"
                metrics={[
                  {
                    label: "Practice Sessions",
                    value: activitySummary.total_practice_sessions,
                  },
                  {
                    label: "Practice Time",
                    value: activitySummary.total_practice_minutes,
                    displayValue: formatMinutes(activitySummary.total_practice_minutes),
                  },
                  {
                    label: "Reference Plays",
                    value: activitySummary.total_reference_plays,
                  },
                ]}
              />
              <MetricGroup
                title="Assessment Results"
                metrics={[
                  {
                    label: "Recordings Started",
                    value: activitySummary.total_recordings_started,
                  },
                  {
                    label: "Assessments Submitted",
                    value: activitySummary.total_recordings_submitted,
                  },
                  {
                    label: "Analysis Completed",
                    value: activitySummary.total_analysis_completed,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                  Performance by Surah
                </h2>
                <p className="text-sm text-slate-500">
                  Grouped by reference from scored assessment records.
                </p>
              </div>
              {performanceByReference.length > 5 && (
                <button className="text-sm font-semibold text-emerald-700">
                  View All
                </button>
              )}
            </div>

            {performanceByReference.length === 0 ? (
              <EmptyState
                title="No reference performance yet."
                message="Complete an assessment to compare performance by surah or reference."
              />
            ) : (
              <div className="space-y-3">
                {performanceByReference.slice(0, 5).map((item) => (
                  <ReferencePerformanceRow key={item.referenceId} item={item} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Achievements
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Small milestones from your current data.
            </p>
            <div className="space-y-3">
              {achievements.map((achievement) => (
                <div
                  key={achievement.label}
                  className={`rounded-2xl border p-4 ${
                    achievement.unlocked
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        achievement.unlocked
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {achievement.unlocked ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Lock className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{achievement.label}</p>
                      <p className="text-xs text-slate-500">{achievement.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2 bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-600" />
              Weekly Activity
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Practice sessions, minutes, and recordings over the last 7 days.
            </p>
            <div className="mb-5 flex flex-wrap gap-3 text-xs text-slate-600">
              <LegendDot color="#10b981" label="Practice Sessions" />
              <LegendDot color="#22d3ee" label="Practice Minutes" />
              <LegendDot color="#a855f7" label="Assessments / Recordings" />
            </div>
            {activitySummary.weekly_activity.length === 0 ? (
              <EmptyState
                title="No practice activity recorded yet."
                message="Start training to build your progress profile."
              />
            ) : (
              <WeeklyGroupedBars
                weeklyActivity={activitySummary.weekly_activity}
                max={weeklyMax}
              />
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-blue-600" />
              Recent Activity
            </h2>
            <p className="text-sm text-slate-500 mb-5">Latest training actions.</p>
            {!hasActivity ? (
              <EmptyState
                title="No practice activity recorded yet."
                message="Start training to build your progress profile."
              />
            ) : (
              <div className="space-y-3">
                {activitySummary.recent_activity.slice(0, 10).map((event, index) => (
                  <div
                    key={`${event.event_type}-${event.created_at}-${index}`}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {activityLabels[event.event_type] || event.event_type}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(event.created_at)}
                      </p>
                      {event.reference_id && (
                        <p className="text-xs text-slate-400">
                          {getReferenceLabel(event.reference_id)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-3xl shadow-md border border-slate-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-600" />
            Weak Verses Priority List
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Prioritized from existing weakest verse aggregation.
          </p>
          {statistics && statistics.weakest_verses.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {statistics.weakest_verses.map((verse, idx) => {
                const difficulty = difficultyForCount(verse.frequency);
                return (
                  <div
                    key={`${verse.text}-${idx}`}
                    className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">{verse.text}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Reference details are not available for this verse yet.
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficulty.className}`}
                      >
                        {difficulty.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-amber-700 font-semibold">
                        Appears {verse.frequency} time{verse.frequency > 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        className="text-sm font-semibold text-emerald-700"
                      >
                        Practice
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No weak verses identified yet."
              message="Complete more assessments to receive targeted verse priorities."
            />
          )}
        </section>

        <section className="bg-white rounded-3xl shadow-md border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Assessment History
              </h2>
              <p className="text-sm text-slate-500">
                Showing latest 5 by default to keep the dashboard compact.
              </p>
            </div>
            {sortedAssessments.length > 5 && (
              <button
                onClick={() => setShowAllAssessments((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showAllAssessments ? (
                  <>
                    Show Less <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Show More <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>

          {!hasAssessments ? (
            <EmptyState
              title="No assessment results yet."
              message="Complete a recording to see your score."
            />
          ) : (
            <div className="space-y-4">
              {assessmentsToShow.map((session) => (
                <AssessmentHistoryRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface MonthSummary {
  label: string;
  practice_sessions: number;
  practice_minutes: number;
  assessments: number;
  average_score: number;
  best_score: number;
}

const buildMonthSummary = (
  monthDate: Date,
  assessments: StudentProgress[],
  activitySummary: StudentActivitySummary
): MonthSummary => {
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const label = monthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const monthlyAssessments = assessments.filter((item) => {
    const createdAt = new Date(item.created_at);
    return createdAt.getMonth() === month && createdAt.getFullYear() === year;
  });
  const scores = monthlyAssessments.map((item) => item.overall_score);

  const weeklyInMonth = activitySummary.weekly_activity.filter((day) => {
    const dayDate = new Date(day.date);
    return dayDate.getMonth() === month && dayDate.getFullYear() === year;
  });

  return {
    label,
    practice_sessions: weeklyInMonth.reduce(
      (sum, day) => sum + day.practice_sessions,
      0
    ),
    practice_minutes: weeklyInMonth.reduce(
      (sum, day) => sum + day.practice_minutes,
      0
    ),
    assessments: monthlyAssessments.length,
    average_score: scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0,
    best_score: scores.length ? Math.max(...scores) : 0,
  };
};

const MonthSummaryCard: React.FC<{ summary: MonthSummary; title: string }> = ({
  summary,
  title,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center justify-between mb-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{summary.label}</p>
      </div>
      <span className="text-lg font-bold text-emerald-600">
        {Math.round(summary.best_score)}%
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
      <span>Practice: {summary.practice_sessions}</span>
      <span>Time: {formatMinutes(summary.practice_minutes)}</span>
      <span>Assessments: {summary.assessments}</span>
      <span>Avg: {Math.round(summary.average_score)}%</span>
    </div>
  </div>
);

const ProgressRing: React.FC<{ score: number }> = ({ score }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="12"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold">{Math.round(score)}%</span>
        <span className="text-xs uppercase tracking-wider text-emerald-100">
          Overall
        </span>
      </div>
    </div>
  );
};

const HeroMetric: React.FC<{ label: string; value: string | number }> = ({
  label,
  value,
}) => (
  <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur">
    <p className="text-xs uppercase tracking-wider text-emerald-100 mb-1">{label}</p>
    <p className="text-2xl font-bold text-white">{value}</p>
  </div>
);

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "emerald" | "blue" | "amber" | "purple" | "slate";
}

const toneClasses: Record<SummaryCardProps["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100",
  slate: "bg-slate-50 text-slate-700 border-slate-100",
};

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, tone }) => (
  <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-5 hover:shadow-lg transition-all duration-300">
    <div
      className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${toneClasses[tone]}`}
    >
      {icon}
    </div>
    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const ScoreTrendChart: React.FC<{ assessments: StudentProgress[] }> = ({
  assessments,
}) => {
  const width = 640;
  const height = 220;
  const padding = 28;
  const points = assessments.map((item, index) => {
    const x =
      assessments.length === 1
        ? width / 2
        : padding + (index / (assessments.length - 1)) * (width - padding * 2);
    const y = height - padding - (item.overall_score / 100) * (height - padding * 2);
    return { x, y, score: item.overall_score };
  });

  return (
    <div>
      <div className="w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
          {[0, 25, 50, 75, 100].map((value) => {
            const y = height - padding - (value / 100) * (height - padding * 2);
            return (
              <g key={value}>
                <line
                  x1={padding}
                  x2={width - padding}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 6"
                />
                <text x="4" y={y + 4} fontSize="11" fill="#64748b">
                  {value}
                </text>
              </g>
            );
          })}
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            />
          )}
          {points.map((point, index) => (
            <g key={`${point.x}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r="7"
                fill={scoreColor(point.score)}
                stroke="white"
                strokeWidth="3"
              />
              <text
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
              >
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-600">
        <LegendDot color="#ef4444" label="<60" />
        <LegendDot color="#f59e0b" label="60-79" />
        <LegendDot color="#10b981" label=">=80" />
      </div>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-2">
    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
);

const MetricGroup: React.FC<{
  title: string;
  metrics: Array<{ label: string; value: number; displayValue?: string }>;
}> = ({ title, metrics }) => {
  const max = Math.max(1, ...metrics.map((metric) => metric.value));
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">{metric.label}</span>
              <span className="text-sm font-bold text-slate-900">
                {metric.displayValue || metric.value}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                style={{ width: `${Math.min((metric.value / max) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ReferencePerformanceRow: React.FC<{
  item: {
    referenceId: string;
    label: string;
    sessions: number;
    average: number;
    best: number;
    latest: number;
    trend: string;
  };
}> = ({ item }) => {
  const TrendIcon =
    item.trend === "up" ? TrendingUp : item.trend === "down" ? TrendingDown : Activity;
  const trendLabel =
    item.trend === "up" ? "Up" : item.trend === "down" ? "Down" : "Flat";
  const trendColor =
    item.trend === "up"
      ? "text-emerald-600 bg-emerald-50"
      : item.trend === "down"
      ? "text-red-600 bg-red-50"
      : "text-slate-600 bg-slate-100";

  return (
    <div className="rounded-2xl border border-slate-200 p-4 hover:border-emerald-200 hover:shadow-sm transition-all">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{item.label}</p>
          <p className="text-sm text-slate-500">
            {item.sessions} assessment session{item.sessions > 1 ? "s" : ""}
          </p>
          <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden md:max-w-sm">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
              style={{ width: `${Math.min(item.average, 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 md:min-w-80">
          <MiniStat label="Avg" value={`${Math.round(item.average)}%`} />
          <MiniStat label="Best" value={`${Math.round(item.best)}%`} />
          <div
            className={`rounded-xl px-3 py-2 flex items-center justify-center gap-2 ${trendColor}`}
          >
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-semibold">{trendLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-center">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="font-bold text-slate-900">{value}</p>
  </div>
);

const WeeklyGroupedBars: React.FC<{
  weeklyActivity: StudentActivitySummary["weekly_activity"];
  max: number;
}> = ({ weeklyActivity, max }) => (
  <div className="grid grid-cols-7 gap-2 md:gap-4 items-end min-h-64">
    {weeklyActivity.map((day) => (
      <div key={day.date} className="flex flex-col items-center gap-3">
        <div className="h-44 w-full flex items-end justify-center gap-1.5">
          <Bar
            value={day.practice_sessions}
            max={max}
            className="bg-emerald-500"
            title={`${day.practice_sessions} practice sessions`}
          />
          <Bar
            value={day.practice_minutes / 10}
            max={max}
            className="bg-cyan-400"
            title={`${day.practice_minutes} practice minutes`}
          />
          <Bar
            value={day.recordings}
            max={max}
            className="bg-purple-500"
            title={`${day.recordings} recordings`}
          />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-slate-700">
            {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
          </p>
          <p className="text-[11px] text-slate-500">
            {day.practice_sessions}p / {day.recordings}r
          </p>
          <p className="text-[11px] text-slate-400">
            {formatMinutes(day.practice_minutes)}
          </p>
        </div>
      </div>
    ))}
  </div>
);

const Bar: React.FC<{
  value: number;
  max: number;
  className: string;
  title: string;
}> = ({ value, max, className, title }) => {
  const height = value <= 0 ? 8 : Math.max(10, (value / max) * 160);
  return (
    <div
      className={`w-3 md:w-4 rounded-t-lg ${className}`}
      style={{ height }}
      title={title}
    />
  );
};

const AssessmentHistoryRow: React.FC<{ session: StudentProgress }> = ({ session }) => (
  <div className="border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 bg-gradient-to-r from-white to-slate-50/50">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-3xl font-bold text-slate-800">
            {Math.round(session.overall_score)}%
          </div>
          {session.improvement !== undefined && session.improvement > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-semibold">
                +{Math.round(session.improvement)}%
              </span>
            </div>
          )}
          {session.improvement !== undefined && session.improvement < 0 && (
            <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm font-semibold">
                {Math.round(session.improvement)}%
              </span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-600 mt-2">
          {new Date(session.created_at).toLocaleString()}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {getReferenceDisplayName(session)}
        </p>
      </div>
      {session.verse_scores && session.verse_scores.length > 0 && (
        <div className="text-right">
          <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
            <BookOpen className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">
              {session.verse_scores.length} verse
              {session.verse_scores.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  </div>
);

const EmptyState: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="text-center py-10 px-4">
    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <Award className="w-8 h-8 text-slate-400" />
    </div>
    <p className="text-slate-700 font-semibold mb-1">{title}</p>
    <p className="text-sm text-slate-500">{message}</p>
  </div>
);

export default StudentProgressView;
