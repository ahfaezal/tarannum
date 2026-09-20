import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSignature, Loader2, Play, Upload, XCircle } from "lucide-react";
import { competencyGradeForScore, decideQariApplication, getQariApplications, QariApplication, uploadQariSignature } from "../services/certificationService";
import { ManagedRecordingAudio, playSessionRecordingAudio } from "../services/platformService";

const RUBRIC = [
  { key: "lafaz_completion", label: "Kelengkapan dan susunan lafaz", link: "Completion • Voice coverage", weight: 15 },
  { key: "pronunciation", label: "Ketepatan lafaz dan sebutan", link: "Recitation validity", weight: 20 },
  { key: "melodic_contour", label: "Bentuk melodi keseluruhan", link: "Melodic contour", weight: 15 },
  { key: "contour_detail", label: "Perincian lenggok setiap frasa", link: "Contour detail • Melody similarity", weight: 10 },
  { key: "pitch_control", label: "Kedudukan dan kawalan nada", link: "Pitch position", weight: 10 },
  { key: "timing", label: "Tempo, jeda dan kesinambungan", link: "Timing consistency", weight: 10 },
  { key: "vocal_breath", label: "Kestabilan suara dan kawalan nafas", link: "Vocal stability", weight: 10 },
  { key: "overall_azan", label: "Kesesuaian persembahan azan keseluruhan", link: "Pertimbangan profesional qari", weight: 10 },
] as const;

type Draft = { assessment: Record<string, number>; notes: string; critical_error: boolean };
const emptyDraft = (): Draft => ({ assessment: {}, notes: "", critical_error: false });

const QariCertification: React.FC = () => {
  const [applications, setApplications] = useState<QariApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const audioRef = useRef<ManagedRecordingAudio | null>(null);

  const load = () => getQariApplications().then(setApplications).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); return () => audioRef.current?.cleanup(); }, []);

  const updateDraft = (id: string, update: (draft: Draft) => Draft) => setDrafts(current => ({
    ...current, [id]: update(current[id] || emptyDraft()),
  }));
  const qariScore = (draft: Draft) => RUBRIC.reduce((total, item) => total + ((draft.assessment[item.key] || 0) / 5) * item.weight, 0);
  const decide = async (application: QariApplication, decision: string) => {
    const draft = drafts[application.id] || emptyDraft();
    if (RUBRIC.some(item => !draft.assessment[item.key])) { setError("Lengkapkan semua lapan elemen penilaian qari."); return; }
    if (decision !== "approved" && !draft.notes.trim()) { setError("Masukkan catatan untuk peserta sebelum membuat keputusan."); return; }
    setBusy(application.id);
    try { await decideQariApplication(application.id, {
      decision,
      notes: draft.notes.trim() || "Diluluskan selepas penilaian lengkap qari.",
      assessment: draft.assessment,
      critical_error: draft.critical_error,
    }); await load(); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(""); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Persijilan</p><h1 className="text-3xl font-bold text-slate-900">Semakan Sijil Kompetensi</h1><p className="mt-2 text-slate-600">Skor latihan AI ≥75 membuka semakan. Tahap kompetensi ditentukan berasingan melalui penilaian rasmi qari.</p></header>
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm"><div className="bg-emerald-900 px-5 py-3 text-white"><h2 className="font-bold">Panduan Tahap Penilaian Qari</h2><p className="text-xs text-emerald-100">Digunakan untuk keputusan kompetensi; tidak mengubah syarat latihan AI ≥75%.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-emerald-50 text-left"><tr><th className="p-3">Markah Qari</th><th className="p-3">Pangkat</th><th className="p-3">Tahap</th></tr></thead><tbody><tr className="border-t"><td className="p-3 font-bold">90–100%</td><td className="p-3 font-semibold">Mumtaz (ممتاز)</td><td className="p-3">Cemerlang</td></tr><tr className="border-t"><td className="p-3 font-bold">75–89%</td><td className="p-3 font-semibold">Jayyid Jiddan (جيد جدا)</td><td className="p-3">Sangat Baik</td></tr><tr className="border-t"><td className="p-3 font-bold">60–74%</td><td className="p-3 font-semibold">Jayyid (جيد)</td><td className="p-3">Baik</td></tr></tbody></table></div></section>
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-bold"><FileSignature className="text-emerald-700" /> Tandatangan Qari</h2>
      <p className="mt-1 text-sm text-slate-600">PNG, JPEG atau WebP, maksimum 2 MB. Fail disimpan secara terlindung.</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-300 px-4 py-2 font-semibold text-emerald-800"><Upload size={17} /> Muat naik tandatangan<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadQariSignature(file).catch((err) => setError(err.message)); }} /></label>
    </section>
    <div className="space-y-4">
      {applications.length === 0 && <div className="rounded-2xl border bg-white p-6 text-slate-500">Tiada permohonan untuk disemak.</div>}
      {applications.map((item) => <article key={item.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{item.student_name}</h2><p className="text-sm text-slate-500">{item.certificate_type === "competency_azan" ? "Kompetensi Azan" : "Kompetensi Tarannum"} • Skor AI {item.score_snapshot.toFixed(1)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{item.status}</span></div>
        <button onClick={async () => { audioRef.current?.cleanup(); audioRef.current = await playSessionRecordingAudio(item.session_id); }} className="mt-4 flex items-center gap-2 rounded-xl border px-4 py-2 font-semibold"><Play size={17} /> Dengar rakaman</button>
        {item.status === "pending" && (() => { const draft = drafts[item.id] || emptyDraft(); const score = qariScore(draft); const grade = competencyGradeForScore(score); return <div className="mt-5 space-y-4 border-t pt-5">
          <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Elemen qari</th><th className="p-3">Hubungan dengan V2.3</th><th className="p-3">Skala 1–5</th></tr></thead><tbody>{RUBRIC.map(element => <tr key={element.key} className="border-t"><td className="p-3 font-semibold">{element.label}<span className="ml-2 text-xs font-normal text-slate-400">{element.weight}%</span></td><td className="p-3 text-slate-500">{element.link}</td><td className="p-3"><select aria-label={element.label} value={draft.assessment[element.key] || ""} onChange={event => updateDraft(item.id, current => ({ ...current, assessment: { ...current.assessment, [element.key]: Number(event.target.value) } }))} className="rounded-lg border px-3 py-2"><option value="">Pilih</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></td></tr>)}</tbody></table></div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start"><label className="block text-sm font-semibold">Catatan qari<textarea value={draft.notes} onChange={event => updateDraft(item.id, current => ({ ...current, notes: event.target.value }))} rows={3} maxLength={2000} placeholder="Nyatakan kekuatan, pembetulan atau sebab rakaman semula" className="mt-1 w-full rounded-xl border p-3 font-normal" /></label><div className="min-w-[190px] rounded-xl bg-emerald-50 p-4 text-center"><p className="text-xs font-bold uppercase text-emerald-700">Skor Qari</p><p className="text-3xl font-black text-emerald-900">{score.toFixed(0)}%</p><p className="mt-1 text-sm font-bold text-emerald-900">Tahap: {grade?.label || 'Belum layak'}</p><p className="text-xs text-slate-500">{grade?.range || 'Minimum sijil 60%'}</p></div></div>
          <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm"><input type="checkbox" checked={draft.critical_error} onChange={event => updateDraft(item.id, current => ({ ...current, critical_error: event.target.checked }))} className="mt-1"/><span><strong>Ada kesilapan kritikal pada lafaz/sebutan.</strong><br/>Rakaman tidak boleh diluluskan walaupun jumlah skor mencapai 75.</span></label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy === item.id || score < 60 || draft.critical_error} onClick={() => decide(item, "approved")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={15} className="inline" /> Lulus & jana sijil</button>
            <button disabled={busy === item.id} onClick={() => decide(item, "resubmission_requested")} className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">Minta rakam semula</button>
            <button disabled={busy === item.id} onClick={() => decide(item, "rejected")} className="rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-800"><XCircle size={15} className="inline" /> Tidak lulus</button>
          </div>
        </div>; })()}
        {item.qari_score != null && <p className="mt-3 text-sm text-slate-600">Skor qari: <strong>{item.qari_score.toFixed(1)}%</strong>{item.critical_error ? " • Kesilapan kritikal direkodkan" : ""}</p>}
      </article>)}
    </div>
  </div>;
};

export default QariCertification;
