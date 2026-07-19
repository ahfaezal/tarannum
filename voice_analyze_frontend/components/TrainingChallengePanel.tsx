import React, { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Plus, Trophy, Users, X } from "lucide-react";
import {
  createTrainingChallenge,
  getQariTrainingChallenges,
  getTrainingChallengeLeaderboard,
  QariContent,
  StudentInfo,
  TrainingChallenge,
  TrainingChallengeLeaderboardEntry,
  updateTrainingChallengeStatus,
} from "../services/platformService";

interface Props {
  students: StudentInfo[];
  content: QariContent[];
}

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const TrainingChallengePanel: React.FC<Props> = ({ students, content }) => {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<TrainingChallenge[]>([]);
  const [leaders, setLeaders] = useState<Record<string, TrainingChallengeLeaderboardEntry[]>>({});
  const [leaderboardLoading, setLeaderboardLoading] = useState<string | null>(null);
  const [liveBoardId, setLiveBoardId] = useState<string | null>(null);
  const [leaderboardUpdatedAt, setLeaderboardUpdatedAt] = useState<Record<string, Date>>({});
  const [boardPulse, setBoardPulse] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(localDateTime(new Date()));
  const [endAt, setEndAt] = useState(localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)));

  const loadChallenges = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getQariTrainingChallenges();
      setChallenges(response.challenges || []);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message || "Failed to load training challenges");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) await loadChallenges();
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  };

  const submitChallenge = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const challenge = await createTrainingChallenge({
        title,
        reference_id: referenceId,
        student_ids: selectedStudents,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
      });
      setChallenges((current) => [challenge, ...current]);
      setTitle("");
      setReferenceId("");
      setSelectedStudents([]);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to create training challenge");
    } finally {
      setSaving(false);
    }
  };

  const loadLeaderboard = async (challengeId: string) => {
    setLeaderboardLoading(challengeId);
    setError(null);
    try {
      const response = await getTrainingChallengeLeaderboard(challengeId);
      setLeaders((current) => ({ ...current, [challengeId]: response.leaders || [] }));
      setLeaderboardUpdatedAt((current) => ({ ...current, [challengeId]: new Date() }));
      setBoardPulse(challengeId);
      window.setTimeout(() => setBoardPulse((current) => current === challengeId ? null : current), 700);
    } catch (err: any) {
      setError(err.message || "Failed to load leaderboard");
    } finally {
      setLeaderboardLoading(null);
    }
  };

  const openLiveBoard = async (challengeId: string) => {
    setLiveBoardId(challengeId);
    await loadLeaderboard(challengeId);
  };

  const cancelChallenge = async (challengeId: string) => {
    setError(null);
    try {
      const updated = await updateTrainingChallengeStatus(challengeId, "cancelled");
      setChallenges((current) => current.map((item) => item.id === challengeId ? updated : item));
    } catch (err: any) {
      setError(err.message || "Failed to cancel challenge");
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const activeIds = challenges
      .filter((challenge) => challenge.status === "active" && leaders[challenge.id])
      .map((challenge) => challenge.id);
    if (!activeIds.length) return;
    const timer = window.setInterval(() => {
      activeIds.forEach((challengeId) => loadLeaderboard(challengeId));
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [expanded, challenges, leaders]);

  useEffect(() => {
    if (!liveBoardId) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [liveBoardId]);

  const formatRemaining = (endAt: string) => {
    const remaining = Math.max(0, new Date(endAt).getTime() - now.getTime());
    const totalSeconds = Math.floor(remaining / 1_000);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    return remaining === 0
      ? "Session ended"
      : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <section className="mb-8 rounded-xl border border-emerald-200 bg-white shadow-sm">
      <button type="button" onClick={toggleExpanded} className="flex w-full items-center justify-between gap-4 p-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white"><Trophy className="h-6 w-6" /></div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Live Training Leaderboard</h2>
            <p className="mt-1 text-sm text-slate-600">Select participants and a reference. Their best normal assessment score is ranked live.</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm text-slate-600">Top 3 results are taken from normal scoring during the selected period. No special link or additional recording is required.</p></div>
            <button type="button" onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? "Close" : "Create Live Board"}
            </button>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {showForm && (
            <form onSubmit={submitChallenge} className="mb-6 grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 lg:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Session title
                <input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" placeholder="Al-Fatihah Training Session" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Reference
                <select required value={referenceId} onChange={(e) => setReferenceId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  <option value="">Select reference</option>
                  {content.filter((item) => item.visibility_status !== "inactive" && item.visibility_status !== "draft").map((item) => (
                    <option key={item.reference_id} value={item.reference_id}>{item.surah_name || item.reference_title || item.filename || "Untitled reference"}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">Starts
                <input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-700">Ends
                <input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" />
              </label>
              <div className="lg:col-span-2">
                <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Participants</span><button type="button" onClick={() => setSelectedStudents(students.map((item) => item.student_id))} className="text-xs font-bold text-emerald-700">Select all</button></div>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {students.map((student) => (
                    <label key={student.student_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                      <input type="checkbox" checked={selectedStudents.includes(student.student_id)} onChange={() => toggleStudent(student.student_id)} className="h-4 w-4 accent-emerald-600" />
                      <span className="text-sm"><strong className="text-slate-800">{student.student_name || student.student_email}</strong><span className="ml-2 text-slate-500">{student.student_email}</span></span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">{selectedStudents.length} student{selectedStudents.length === 1 ? "" : "s"} selected</p>
              </div>
              <div className="lg:col-span-2"><button disabled={saving || selectedStudents.length === 0} className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Creating…" : "Create Live Training Board"}</button></div>
            </form>
          )}

          {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading challenges…</p> : challenges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No Live Training Board has been created.</div>
          ) : (
            <div className="space-y-4">
              {challenges.map((challenge) => (
                <article key={challenge.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-bold text-slate-800">{challenge.title}</h3><p className="mt-1 text-sm text-slate-500">{new Date(challenge.start_at).toLocaleString()} — {new Date(challenge.end_at).toLocaleString()}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${challenge.status === "active" ? "bg-emerald-100 text-emerald-700" : challenge.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>{challenge.status.toUpperCase()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600"><span className="flex items-center gap-1"><Users className="h-4 w-4" />{challenge.participant_count || 0} participants</span><span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />Timed challenge</span></div>
                  <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => openLiveBoard(challenge.id)} className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">{leaderboardLoading === challenge.id ? "Refreshing…" : "Open Live Board"}</button>{challenge.status !== "completed" && challenge.status !== "cancelled" && <button type="button" onClick={() => cancelChallenge(challenge.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">End Board</button>}</div>
                  {leaders[challenge.id] && <div className="mt-4 grid gap-2 sm:grid-cols-3">{leaders[challenge.id].length ? leaders[challenge.id].map((leader) => <div key={leader.student_id} className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-bold text-amber-600">#{leader.rank}</div><div className="truncate font-semibold text-slate-800">{leader.student_name}</div><div className="text-2xl font-black text-emerald-700">{Math.round(leader.score)}%</div></div>) : <p className="text-sm text-slate-500">No completed score yet.</p>}</div>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {liveBoardId && (() => {
        const challenge = challenges.find((item) => item.id === liveBoardId);
        const boardLeaders = leaders[liveBoardId] || [];
        if (!challenge) return null;
        return <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 p-6 text-white md:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-6">
            <div><div className="flex flex-wrap items-center gap-3"><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-400">Live Training Leaderboard</p><span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-black tracking-wider text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />LIVE</span></div><h2 className="mt-2 text-3xl font-black md:text-5xl">{challenge.title}</h2><div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-300"><span>Highest Experimental Score V2.3</span><span className="font-mono text-base font-bold text-white">Time remaining: {formatRemaining(challenge.end_at)}</span><span>Updated: {leaderboardUpdatedAt[liveBoardId]?.toLocaleTimeString() || "Waiting…"}</span></div></div>
            <button type="button" onClick={() => setLiveBoardId(null)} className="rounded-xl border border-white/20 p-3 hover:bg-white/10" aria-label="Close live board"><X className="h-6 w-6" /></button>
          </div>
          <div className="flex flex-1 items-center justify-center py-8">
            {boardLeaders.length === 0 ? <div className="text-center"><Trophy className="mx-auto h-20 w-20 text-amber-400/50" /><p className="mt-5 text-2xl font-bold">Waiting for completed scores…</p><p className="mt-2 text-slate-400">Students may continue using the normal Recording & Assessment page.</p></div> : <div className={`grid w-full max-w-6xl gap-5 transition-opacity duration-700 md:grid-cols-3 ${boardPulse === liveBoardId ? "opacity-70" : "opacity-100"}`}>{boardLeaders.map((leader, index) => {
              const styles = index === 0
                ? { card: "border-amber-400 bg-amber-400/10 md:-translate-y-6", badge: "bg-amber-400 text-slate-950", label: "Gold" }
                : index === 1
                ? { card: "border-slate-300/60 bg-slate-300/10", badge: "bg-slate-300 text-slate-950", label: "Silver" }
                : { card: "border-orange-500/60 bg-orange-500/10", badge: "bg-orange-600 text-white", label: "Bronze" };
              return <div key={leader.student_id} className={`rounded-3xl border p-7 text-center transition-all duration-700 ${styles.card}`}><div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black ${styles.badge}`}>#{leader.rank}</div><div className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{styles.label}</div><h3 className="mt-4 truncate text-2xl font-bold">{leader.student_name}</h3><div className="mt-5 text-6xl font-black text-emerald-400 md:text-7xl">{Math.round(leader.score)}%</div></div>;
            })}</div>}
          </div>
          <div className="text-center text-sm text-slate-500">Top 3 only · motivational training display · not an official ranking</div>
        </div>;
      })()}
    </section>
  );
};

export default TrainingChallengePanel;
