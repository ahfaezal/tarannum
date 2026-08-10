import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Database, ShieldCheck, Users } from "lucide-react";
import {
  CandidateSummary,
  ExpertBatchSummary,
  ExpertQariOption,
  createExpertBatch,
  getExpertBatches,
  getExpertCandidateSummary,
  getExpertQariOptions,
} from "../services/expertValidationService";

const AdminExpertValidation: React.FC = () => {
  const [qaris, setQaris] = useState<ExpertQariOption[]>([]);
  const [selectedQaris, setSelectedQaris] = useState<string[]>([]);
  const [summary, setSummary] = useState<CandidateSummary | null>(null);
  const [batches, setBatches] = useState<ExpertBatchSummary[]>([]);
  const [startDate, setStartDate] = useState("2026-07-29");
  const [endDate, setEndDate] = useState("2026-07-31");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [qariData, candidateData, batchData] = await Promise.all([
        getExpertQariOptions(),
        getExpertCandidateSummary(startDate, endDate),
        getExpertBatches(),
      ]);
      setQaris(qariData);
      setSummary(candidateData);
      setBatches(batchData);
    } catch (err: any) {
      setError(err.message || "Data validasi gagal dimuatkan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refreshCandidates = async () => {
    try {
      setError(null);
      setSummary(await getExpertCandidateSummary(startDate, endDate));
    } catch (err: any) {
      setError(err.message || "Calon rakaman gagal diaudit");
    }
  };

  const toggleQari = (id: string) => {
    setSelectedQaris((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length < 2 ? [...current, id] : current);
  };

  const createBatch = async () => {
    if (selectedQaris.length !== 2) {
      setError("Pilih tepat dua orang qari yang telah diluluskan.");
      return;
    }
    if (!summary || summary.eligible_recordings < 50) {
      setError("Sekurang-kurangnya 50 rakaman yang layak diperlukan.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      setMessage(null);
      const result = await createExpertBatch({
        name: "Validasi Pakar KNovasi 2026",
        description: "Pengesahan awal skor Tarannum.ai oleh dua orang qari pakar secara bebas dan anonim.",
        evaluator_ids: selectedQaris,
        cohort_start: startDate,
        cohort_end: endDate,
        target_count: 50,
        duplicate_count: 5,
        random_seed: 20260816,
        consent_confirmed: consentConfirmed,
      });
      setMessage(`Batch berjaya dibekukan: ${result.recordings} rakaman unik dan ${result.tasks_per_evaluator} tugasan bagi setiap qari.`);
      setBatches(await getExpertBatches());
    } catch (err: any) {
      setError(err.message || "Batch validasi gagal dicipta");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-gradient-to-r from-emerald-950 to-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex gap-4"><div className="rounded-2xl bg-emerald-400/15 p-3"><ShieldCheck className="h-7 w-7 text-emerald-300" /></div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Pentadbiran kajian</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Validasi Pakar KNovasi 2026</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Bekukan sampel rawak berstrata, tugaskan dua qari dan pantau penilaian anonim dalam sistem.</p></div></div>
      </header>

      {error && <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</div>}
      {message && <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{message}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><Database className="h-6 w-6 text-emerald-700" /><div><h2 className="font-bold text-slate-900">1. Audit rakaman layak</h2><p className="text-sm text-slate-500">V2.3, integriti lengkap dan audio tersedia</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-slate-700">Tarikh mula<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><label className="text-sm font-semibold text-slate-700">Tarikh akhir (tidak termasuk)<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label></div>
          <button onClick={refreshCandidates} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Audit semula</button>
          {summary && <div className="mt-5 grid grid-cols-2 gap-3"><Stat label="Rakaman layak" value={summary.eligible_recordings} /><Stat label="Peserta unik" value={summary.participants} /></div>}
          {summary && <div className="mt-4 space-y-2">{summary.references.map((reference) => <div key={reference.reference_id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="truncate pr-3 text-slate-700">{reference.title}</span><strong>{reference.count}</strong></div>)}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><Users className="h-6 w-6 text-emerald-700" /><div><h2 className="font-bold text-slate-900">2. Pilih dua qari</h2><p className="text-sm text-slate-500">Hanya qari aktif dan telah diluluskan</p></div></div>
          <div className="mt-5 space-y-3">{qaris.map((qari) => { const selected = selectedQaris.includes(qari.id); return <button key={qari.id} onClick={() => toggleQari(qari.id)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}><div><div className="font-semibold text-slate-900">{qari.name}</div><div className="text-xs text-slate-500">{qari.email}</div></div><div className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>{selected && <CheckCircle2 className="h-4 w-4" />}</div></button>; })}</div>
          {!qaris.length && !loading && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Tiada akaun qari yang aktif dan diluluskan.</p>}
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><strong>Batch tetap:</strong> 50 rakaman unik + 5 pendua tersembunyi bagi setiap qari. Skor AI dan identiti peserta tidak dipaparkan.</div>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-600" /><span>Saya mengesahkan penggunaan rakaman peserta untuk penilaian pakar secara anonim telah mendapat kebenaran yang sewajarnya.</span></label>
          <button disabled={creating || selectedQaris.length !== 2 || !summary || summary.eligible_recordings < 50 || !consentConfirmed} onClick={createBatch} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><ClipboardCheck className="h-5 w-5" />{creating ? "Membina batch..." : "Cipta dan tugaskan batch"}</button>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-bold text-slate-900">Status batch</h2>
        <div className="mt-4 space-y-3">{batches.map((batch) => <div key={batch.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="font-semibold text-slate-900">{batch.name}</div><div className="mt-1 text-xs text-slate-500">{batch.recording_count} rakaman · {batch.evaluator_count} qari · Rubrik {batch.rubric_version}</div></div><div className="text-sm font-bold text-emerald-700">{batch.submitted_tasks}/{batch.total_tasks} dihantar</div></div>)}</div>
        {!batches.length && !loading && <p className="mt-4 text-sm text-slate-500">Belum ada batch validasi.</p>}
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="rounded-xl bg-slate-950 p-4 text-white"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-300">{label}</div></div>;

export default AdminExpertValidation;
