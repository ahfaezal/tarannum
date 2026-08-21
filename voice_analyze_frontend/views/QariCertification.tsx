import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSignature, Loader2, Play, Upload, XCircle } from "lucide-react";
import { decideQariApplication, getQariApplications, QariApplication, uploadQariSignature } from "../services/certificationService";
import { ManagedRecordingAudio, playSessionRecordingAudio } from "../services/platformService";

const QariCertification: React.FC = () => {
  const [applications, setApplications] = useState<QariApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const audioRef = useRef<ManagedRecordingAudio | null>(null);

  const load = () => getQariApplications().then(setApplications).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); return () => audioRef.current?.cleanup(); }, []);

  const decide = async (application: QariApplication, decision: string, grade?: string) => {
    const notes = decision === "approved" ? "Diluluskan selepas semakan rakaman." : window.prompt("Catatan untuk peserta:") || "Rakaman belum diluluskan.";
    setBusy(application.id);
    try { await decideQariApplication(application.id, { decision, grade, notes }); await load(); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(""); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Persijilan</p><h1 className="text-3xl font-bold text-slate-900">Semakan Sijil Kompetensi</h1><p className="mt-2 text-slate-600">Dengar rakaman dan tetapkan gred akhir peserta.</p></header>
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
        {item.status === "pending" && <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={busy === item.id} onClick={() => decide(item, "approved", "mumtaz")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Mumtaz</button>
          <button disabled={busy === item.id} onClick={() => decide(item, "approved", "jayyid_jiddan")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">Jayyid Jiddan</button>
          <button disabled={busy === item.id} onClick={() => decide(item, "approved", "jayyid")} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white"><CheckCircle2 size={15} className="inline" /> Jayyid</button>
          <button disabled={busy === item.id} onClick={() => decide(item, "resubmission_requested")} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">Rakam semula</button>
          <button disabled={busy === item.id} onClick={() => decide(item, "rejected")} className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-800"><XCircle size={15} className="inline" /> Tolak</button>
        </div>}
      </article>)}
    </div>
  </div>;
};

export default QariCertification;
