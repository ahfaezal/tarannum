import React, { useEffect, useRef, useState } from 'react';
import TrainingChallengePanel from './TrainingChallengePanel';
import { getAvailableQaris, getAdminLiveScoringContext, QariContent, StudentInfo } from '../services/platformService';

export default function AdminLiveScoring() {
  const [opened, setOpened] = useState(false);
  const [qaris, setQaris] = useState<Array<{id: string; full_name?: string; email: string}>>([]);
  const [qariId, setQariId] = useState('');
  const [search, setSearch] = useState('');
  const [context, setContext] = useState<{content: QariContent[]; students: StudentInfo[]; total: number} | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    getAvailableQaris().then(r => {if (!cancelled) setQaris(r.qaris.filter(q => q.is_active && q.is_approved));})
      .catch(e => {if (!cancelled) setError(e.message);});
    return () => {cancelled = true;};
  }, [opened]);
  const load = async (id: string, term: string) => {
    const version = ++generation.current;
    setContext(null); setError(''); setLoading(Boolean(id));
    if (!id) return;
    try {
      const result = await getAdminLiveScoringContext(id, term);
      if (version === generation.current) setContext(result);
    } catch (e: any) {if (version === generation.current) setError(e.message);}
    finally {if (version === generation.current) setLoading(false);}
  };
  return <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5">
    <button className="text-lg font-bold text-emerald-800" onClick={() => setOpened(!opened)}>Live Scoring bagi pihak Qari {opened ? '−' : '+'}</button>
    {opened && <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">Admin mengendalikan papan skor; sesi kekal milik qari yang dipilih. Pilih peserta sesi ini sahaja.</p>
      <label className="block">Qari
        <select className="ml-3 rounded border p-2" value={qariId} onChange={e => {setQariId(e.target.value); setSearch(''); void load(e.target.value, '');}}>
          <option value="">Pilih qari</option>{qaris.map(q => <option key={q.id} value={q.id}>{q.full_name || q.email}</option>)}
        </select>
      </label>
      {qariId && <form onSubmit={e => {e.preventDefault(); void load(qariId, search);}}>
        <input aria-label="Cari peserta" className="rounded border p-2" placeholder="Cari nama atau e-mel peserta" value={search} onChange={e => setSearch(e.target.value)} />
        <button className="ml-2 rounded bg-emerald-700 px-4 py-2 text-white" disabled={loading}>Cari peserta</button>
      </form>}
      {loading && <p>Memuatkan…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
      {context && <><p className="text-sm text-slate-600">{context.students.length} daripada {context.total} akaun aktif dipaparkan. Gunakan carian jika peserta tidak tersenarai. Jika rujukan tiada, tambah rujukan kepada pustaka qari dahulu.</p>
        <TrainingChallengePanel key={qariId} students={context.students} content={context.content} managedQariId={qariId} managedQariName={qaris.find(q => q.id === qariId)?.full_name || qaris.find(q => q.id === qariId)?.email} /></>}
    </div>}
  </section>;
}
