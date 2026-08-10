import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Headphones, Pause, Play, Save } from "lucide-react";
import {
  ExpertAssignmentSummary,
  ExpertRatingForm,
  ExpertTaskDetail,
  ExpertTaskSummary,
  ManagedExpertAudio,
  RubricDefinition,
  RubricKey,
  getExpertAssignment,
  getExpertTask,
  getMyExpertAssignments,
  playExpertAudio,
  saveExpertRating,
} from "../services/expertValidationService";

const emptyRating: ExpertRatingForm = {
  melodic_contour: null,
  pitch_control: null,
  rhythm_continuity: null,
  voice_stability: null,
  tarannum_suitability: null,
  audio_evaluable: true,
  tarannum_identifiable: "unsure",
  confidence: "medium",
  primary_issue: "",
  comments: "",
};

const ExpertValidationPage: React.FC = () => {
  const [assignments, setAssignments] = useState<ExpertAssignmentSummary[]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ExpertTaskSummary[]>([]);
  const [rubric, setRubric] = useState<RubricDefinition[]>([]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [task, setTask] = useState<ExpertTaskDetail | null>(null);
  const [form, setForm] = useState<ExpertRatingForm>(emptyRating);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<"reference" | "participant" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<ManagedExpertAudio | null>(null);

  useEffect(() => {
    getMyExpertAssignments()
      .then((data) => {
        setAssignments(data);
        const active = data.find((entry) => entry.status !== "completed") || data[0];
        setAssignmentId(active?.id || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    return () => stopAudio();
  }, []);

  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    getExpertAssignment(assignmentId)
      .then((data) => {
        setTasks(data.tasks);
        setRubric(data.rubric);
        const next = data.tasks.findIndex((entry) => entry.status !== "submitted");
        setTaskIndex(next >= 0 ? next : 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => {
    const current = tasks[taskIndex];
    if (!current) {
      setTask(null);
      return;
    }
    stopAudio();
    setMessage(null);
    setError(null);
    getExpertTask(current.id)
      .then((data) => {
        setTask(data);
        setForm(data.rating ? {
          melodic_contour: data.rating.melodic_contour,
          pitch_control: data.rating.pitch_control,
          rhythm_continuity: data.rating.rhythm_continuity,
          voice_stability: data.rating.voice_stability,
          tarannum_suitability: data.rating.tarannum_suitability,
          audio_evaluable: data.rating.audio_evaluable,
          tarannum_identifiable: data.rating.tarannum_identifiable,
          confidence: data.rating.confidence,
          primary_issue: data.rating.primary_issue || "",
          comments: data.rating.comments || "",
        } : emptyRating);
      })
      .catch((err) => setError(err.message));
  }, [tasks, taskIndex]);

  const assignment = assignments.find((entry) => entry.id === assignmentId);
  const submittedCount = tasks.filter((entry) => entry.status === "submitted").length;
  const completion = tasks.length ? Math.round((submittedCount / tasks.length) * 100) : 0;
  const locked = task?.rating?.status === "submitted";
  const allScored = rubric.every((entry) => form[entry.key] !== null);
  const calculatedTotal = useMemo(() => {
    if (!form.audio_evaluable || !allScored) return null;
    return rubric.reduce((sum, entry) => sum + ((form[entry.key] || 0) / 5) * entry.weight, 0);
  }, [form, rubric, allScored]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.cleanup();
      audioRef.current = null;
    }
    setPlaying(null);
  };

  const play = async (kind: "reference" | "participant") => {
    if (!task) return;
    if (playing === kind) {
      stopAudio();
      return;
    }
    stopAudio();
    try {
      setPlaying(kind);
      const audio = await playExpertAudio(kind === "reference" ? task.reference_audio_url : task.participant_audio_url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlaying(null), { once: true });
    } catch (err: any) {
      setPlaying(null);
      setError(err.message || "Audio gagal dimainkan");
    }
  };

  const save = async (submit: boolean) => {
    if (!task) return;
    if (submit && form.audio_evaluable && !allScored) {
      setError("Lengkapkan kelima-lima elemen rubrik sebelum menghantar.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await saveExpertRating(task.id, form, submit);
      const refreshed = await getExpertAssignment(assignmentId!);
      setTasks(refreshed.tasks);
      setMessage(submit ? "Penilaian telah dihantar dan dikunci." : "Draf telah disimpan.");
      if (submit) {
        const nextIndex = refreshed.tasks.findIndex((entry, index) => index > taskIndex && entry.status !== "submitted");
        const fallback = refreshed.tasks.findIndex((entry) => entry.status !== "submitted");
        if (nextIndex >= 0) setTaskIndex(nextIndex);
        else if (fallback >= 0) setTaskIndex(fallback);
      }
    } catch (err: any) {
      setError(err.message || "Penilaian gagal disimpan");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" /></div>;

  if (!assignments.length) return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ClipboardCheck className="mx-auto h-12 w-12 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Penilaian Pakar</h1>
        <p className="mt-2 text-slate-600">Tiada tugasan penilaian yang diberikan kepada akaun ini.</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Penilaian bebas dan anonim</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{assignment?.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Nilai setiap rakaman secara bebas. Nama peserta, skor Tarannum.ai dan markah penilai lain tidak dipaparkan.</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-3 text-right">
            <div className="text-2xl font-bold">{submittedCount}/{tasks.length}</div>
            <div className="text-xs text-slate-300">Selesai · {completion}%</div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${completion}%` }} /></div>
      </header>

      {error && <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</div>}
      {message && <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="px-2 pb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Senarai rakaman</p>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto">
            {tasks.map((entry, index) => (
              <button key={entry.id} onClick={() => setTaskIndex(index)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${index === taskIndex ? "bg-emerald-600 text-white" : "hover:bg-slate-100"}`}>
                <span>{entry.order}. {entry.code}</span>
                {entry.status === "submitted" ? <CheckCircle2 className="h-4 w-4" /> : entry.status === "draft" ? <Save className="h-4 w-4 text-amber-500" /> : null}
              </button>
            ))}
          </div>
        </aside>

        {task && <main className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Rakaman {task.order} daripada {tasks.length}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Kod {task.code}</h2>
                <p className="mt-1 text-sm text-slate-500">{task.reference.title}{task.reference.maqam ? ` · ${task.reference.maqam}` : ""}</p>
              </div>
              {locked && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Telah dihantar · Dikunci</span>}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => play("reference")} className="flex items-center justify-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-4 font-semibold text-cyan-900 hover:bg-cyan-100">
                {playing === "reference" ? <Pause /> : <Headphones />} {playing === "reference" ? "Hentikan rujukan" : "Dengar rakaman rujukan"}
              </button>
              <button type="button" onClick={() => play("participant")} className="flex items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 font-semibold text-emerald-900 hover:bg-emerald-100">
                {playing === "participant" ? <Pause /> : <Play />} {playing === "participant" ? "Hentikan peserta" : "Dengar rakaman peserta"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-slate-900">Rubrik Penilaian</h2><p className="text-sm text-slate-500">1 = sangat lemah · 5 = sangat baik</p></div>
              {calculatedTotal !== null && <div className="rounded-xl bg-slate-900 px-4 py-2 text-white"><span className="text-xs text-slate-300">Jumlah</span><div className="text-xl font-bold">{calculatedTotal.toFixed(0)}/100</div></div>}
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Adakah audio cukup jelas untuk dinilai?</p>
              <div className="mt-2 flex gap-3">
                {[{ value: true, label: "Ya" }, { value: false, label: "Tidak" }].map((option) => <button key={String(option.value)} disabled={locked} onClick={() => setForm({ ...form, audio_evaluable: option.value })} className={`rounded-lg px-5 py-2 text-sm font-semibold ${form.audio_evaluable === option.value ? "bg-emerald-600 text-white" : "border bg-white text-slate-700"}`}>{option.label}</button>)}
              </div>
            </div>

            {form.audio_evaluable && <div className="mt-5 space-y-5">
              {rubric.map((entry) => <RubricRow key={entry.key} entry={entry} value={form[entry.key]} disabled={locked} onChange={(value) => setForm({ ...form, [entry.key]: value })} />)}
            </div>}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <SelectField label="Tarannum dapat dikenal pasti" value={form.tarannum_identifiable} disabled={locked} onChange={(value) => setForm({ ...form, tarannum_identifiable: value as ExpertRatingForm["tarannum_identifiable"] })} options={[['yes','Ya'],['no','Tidak'],['unsure','Tidak pasti']]} />
              <SelectField label="Tahap keyakinan penilai" value={form.confidence} disabled={locked} onChange={(value) => setForm({ ...form, confidence: value as ExpertRatingForm["confidence"] })} options={[['low','Rendah'],['medium','Sederhana'],['high','Tinggi']]} />
              <SelectField label="Kesalahan utama" value={form.primary_issue} disabled={locked} onChange={(value) => setForm({ ...form, primary_issue: value })} options={[["","Tiada / tidak pasti"],["melody","Kontur melodi"],["pitch","Nada / pic"],["rhythm","Irama / tempo"],["breath","Nafas / kesinambungan"],["identity","Identiti tarannum"],["audio","Kualiti audio"]]} />
              <label className="block"><span className="text-sm font-semibold text-slate-800">Komen dan cadangan</span><textarea disabled={locked} value={form.comments} maxLength={2000} onChange={(event) => setForm({ ...form, comments: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" /></label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <button onClick={() => setTaskIndex(Math.max(0, taskIndex - 1))} disabled={taskIndex === 0} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Sebelumnya</button>
              <div className="flex gap-3">
                {!locked && <button onClick={() => save(false)} disabled={saving} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"><Save className="h-4 w-4" /> Simpan draf</button>}
                {!locked && <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Hantar & seterusnya <ChevronRight className="h-4 w-4" /></button>}
                {locked && <button onClick={() => setTaskIndex(Math.min(tasks.length - 1, taskIndex + 1))} disabled={taskIndex === tasks.length - 1} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white">Seterusnya <ChevronRight className="h-4 w-4" /></button>}
              </div>
            </div>
          </section>
        </main>}
      </div>
    </div>
  );
};

const RubricRow: React.FC<{ entry: RubricDefinition; value: number | null; disabled: boolean; onChange: (value: number) => void }> = ({ entry, value, disabled, onChange }) => (
  <div className="grid gap-3 border-b border-slate-100 pb-5 sm:grid-cols-[1fr_auto] sm:items-center">
    <div><p className="font-semibold text-slate-900">{entry.label}</p><p className="text-xs text-slate-500">Wajaran {entry.weight}%</p></div>
    <div className="flex gap-2" role="radiogroup" aria-label={entry.label}>{[1,2,3,4,5].map((score) => <button key={score} disabled={disabled} onClick={() => onChange(score)} className={`h-10 w-10 rounded-lg text-sm font-bold ${value === score ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-400"}`}>{score}</button>)}</div>
  </div>
);

const SelectField: React.FC<{ label: string; value: string; disabled: boolean; onChange: (value: string) => void; options: string[][] }> = ({ label, value, disabled, onChange, options }) => <label className="block"><span className="text-sm font-semibold text-slate-800">{label}</span><select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;

export default ExpertValidationPage;
