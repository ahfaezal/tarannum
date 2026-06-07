/**
 * Student Progress View - View practice history and statistics.
 */
import React, { useEffect, useState } from "react";
import { getStudentProgress, getStudentStatistics } from "../services/platformService";
import { StudentProgress, StudentStatistics } from "../services/platformService";
import { BarChart3, TrendingUp, TrendingDown, Clock, Target, BookOpen } from "lucide-react";

const StudentProgressView: React.FC = () => {
  const [progress, setProgress] = useState<StudentProgress[]>([]);
  const [statistics, setStatistics] = useState<StudentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      setLoading(true);
      const [progressData, statsData] = await Promise.all([
        getStudentProgress(50),
        getStudentStatistics(),
      ]);
      setProgress(progressData.progress);
      setStatistics(statsData);
    } catch (err: any) {
      setError(err.message || "Failed to load progress");
    } finally {
      setLoading(false);
    }
  };

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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">My Progress</h1>
          <p className="text-slate-600 text-base">Track your improvement and practice history</p>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Total Sessions</p>
                  <p className="text-3xl font-bold text-slate-800">
                    {statistics.total_sessions}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Average Score</p>
                  <p className="text-3xl font-bold text-emerald-600">
                    {Math.round(statistics.average_score)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Best Score</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {Math.round(statistics.best_score)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Latest Score</p>
                  <p className="text-3xl font-bold text-amber-600">
                    {Math.round(statistics.latest_score)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Weakest Verses */}
        {statistics && statistics.weakest_verses.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600" />
              Verses Needing Practice
            </h2>
            <div className="space-y-3">
              {statistics.weakest_verses.map((verse, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 hover:shadow-md transition-all"
                >
                  <span className="text-slate-800 font-medium">{verse.text}</span>
                  <span className="text-sm text-amber-700 font-semibold bg-amber-100 px-3 py-1 rounded-full inline-block">
                    Appears {verse.frequency} time{verse.frequency > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress History */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            Practice History
          </h2>
          {progress.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-10 h-10 text-slate-400" />
              </div>
              <p className="text-slate-600 font-medium mb-2">No practice sessions yet.</p>
              <p className="text-sm text-slate-500">Start practicing to see your progress here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {progress.map((session, idx) => (
                <div
                  key={session.id}
                  className="border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 bg-gradient-to-r from-white to-slate-50/50"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentProgressView;
