import React, { useEffect, useMemo, useState } from 'react';
import { managedCertificationRequest as api } from '../services/certificationService';

type Band = '<60' | '60–74' | '75–89' | '90–100';
type Performance = {
  course: {title: string; starts_at: string; duration_minutes: number; location?: string; completion_deadline: string};
  overview: {participants: number; attended: number; attendance_rate: number; practice_complete: number; practice_completion_rate: number; valid_recordings: number; scored_recordings: number; total_practice_hours: number};
  scores: {average: number | null; median: number | null; highest: number | null; lowest: number | null; recordings_at_60: number; recordings_at_75: number; students_at_75: number; recording_distribution: Record<Band, number>; participant_best_distribution: Record<Band, number>; versions: Record<string, number>};
  funnel: {label: string; count: number}[];
  certification: {applications: number; pending: number; approved: number; rejected: number; resubmission_requested: number; attendance_certificates: number; competency_certificates: number};
  participants: {student_id: string; student_name: string; attendance_status: string; valid_recording_count: number; required_recording_count: number; credited_practice_minutes: number; recording_count: number; average_score: number | null; best_score: number | null; ai_qualified: boolean; qari_status: string}[];
  generated_at: string;
};

const bands: {key: Band; label: string; color: string}[] = [
  {key: '<60', label: 'Bawah 60%', color: 'bg-rose-500'},
  {key: '60–74', label: '60–74%', color: 'bg-amber-400'},
  {key: '75–89', label: '75–89%', color: 'bg-emerald-500'},
  {key: '90–100', label: '90–100%', color: 'bg-yellow-500'},
];

const pct = (value: number, total: number) => total ? Math.round(value * 100 / total) : 0;
const score = (value: number | null) => value == null ? '—' : `${value}%`;

export default function CoursePerformanceDashboard({courseId}: {courseId: string}) {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    api<Performance>(`/managed/courses/${courseId}/performance`)
      .then(result => { if (active) setData(result); })
      .catch((reason: Error) => { if (active) setError(reason.message || 'Gagal memuatkan prestasi kursus.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId]);

  const insights = useMemo(() => {
    if (!data) return [];
    const missingAttendance = data.overview.participants - data.overview.attended;
    const incomplete = data.overview.attended - data.overview.practice_complete;
    const qualifiedNotSubmitted = data.scores.students_at_75 - data.certification.applications;
    return [
      missingAttendance > 0 ? `${missingAttendance} peserta belum disahkan hadir.` : 'Semua peserta telah disahkan hadir.',
      incomplete > 0 ? `${incomplete} peserta hadir masih belum melengkapkan latihan wajib.` : 'Semua peserta hadir telah melengkapkan latihan wajib.',
      qualifiedNotSubmitted > 0 ? `${qualifiedNotSubmitted} peserta layak AI masih belum menghantar rakaman kepada qari.` : 'Tiada permohonan qari tertunggak daripada peserta yang layak AI.',
    ];
  }, [data]);

  if (loading) return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" role="status">Menjana infografik prestasi kursus…</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700" role="alert">Dashboard prestasi tidak dapat dimuatkan: {error}</div>;
  if (!data) return null;
  const maximumFunnel = Math.max(1, ...data.funnel.map(item => item.count));
  const totalScored = data.overview.scored_recordings;

  return <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-slate-950 text-white shadow-lg">
    <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-950 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Infografik Prestasi Kursus</p><h3 className="mt-1 text-2xl font-black md:text-3xl">{data.course.title}</h3><p className="mt-1 text-sm text-emerald-100">{new Date(data.course.starts_at).toLocaleString('ms-MY', {dateStyle: 'long', timeStyle: 'short'})} · {data.course.location || 'Lokasi tidak direkodkan'}</p></div>
        <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-right"><p className="text-xs text-emerald-100">Baseline sesi</p><p className="text-lg font-bold">{data.overview.participants} peserta</p></div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Kehadiran', `${data.overview.attendance_rate}%`, `${data.overview.attended}/${data.overview.participants} peserta`],
          ['Latihan lengkap', `${data.overview.practice_completion_rate}%`, `${data.overview.practice_complete}/${data.overview.participants} peserta`],
          ['Rakaman berskor', String(data.overview.scored_recordings), `${data.overview.total_practice_hours} jam latihan sah`],
          ['Layak penilaian qari', String(data.scores.students_at_75), 'Skor terbaik AI ≥75%'],
        ].map(([label, value, detail]) => <div key={label} className="rounded-xl border border-white/10 bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-emerald-200">{label}</p><p className="mt-1 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-slate-300">{detail}</p></div>)}
      </div>
    </div>

    <div className="grid gap-5 bg-slate-50 p-5 text-slate-900 lg:grid-cols-2 md:p-7">
      <article className="rounded-2xl border bg-white p-5">
        <h4 className="font-black">Prestasi Skor V2.3</h4>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[['Purata', score(data.scores.average)], ['Median', score(data.scores.median)], ['Tertinggi', score(data.scores.highest)], ['Terendah', score(data.scores.lowest)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-100 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-black">{value}</p></div>)}
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Taburan semua rakaman</p>
        <div className="mt-3 space-y-3">{bands.map(band => {const value=data.scores.recording_distribution[band.key] || 0;return <div key={band.key}><div className="mb-1 flex justify-between text-sm"><span>{band.label}</span><strong>{value} · {pct(value,totalScored)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${band.color}`} style={{width:`${pct(value,totalScored)}%`}} /></div></div>;})}</div>
        <p className="mt-4 text-xs text-slate-500">{data.scores.recordings_at_75} daripada {totalScored} rakaman mencapai ≥75%. Versi skor: {Object.entries(data.scores.versions).map(([key,value]) => `${key} (${value})`).join(', ')}.</p>
      </article>

      <article className="rounded-2xl border bg-white p-5">
        <h4 className="font-black">Corong Pencapaian Peserta</h4>
        <div className="mt-4 space-y-3">{data.funnel.map((item, index) => <div key={item.label} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-sm"><span>{item.label}</span><div className="h-7 overflow-hidden rounded bg-slate-100"><div className={`flex h-full items-center rounded px-2 text-xs font-bold text-white ${index < 3 ? 'bg-emerald-700' : 'bg-teal-600'}`} style={{width:`${Math.max(item.count ? 12 : 0, pct(item.count,maximumFunnel))}%`}} /></div><strong className="text-right">{item.count}</strong></div>)}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-emerald-50 p-4 text-sm"><p><span className="text-slate-500">Sijil kehadiran</span><br/><strong className="text-xl">{data.certification.attendance_certificates}</strong></p><p><span className="text-slate-500">Sijil kompetensi</span><br/><strong className="text-xl">{data.certification.competency_certificates}</strong></p><p><span className="text-slate-500">Menunggu qari</span><br/><strong>{data.certification.pending}</strong></p><p><span className="text-slate-500">Diluluskan qari</span><br/><strong>{data.certification.approved}</strong></p></div>
      </article>

      <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 lg:col-span-2">
        <h4 className="font-black text-amber-950">Perhatian untuk sesi akan datang</h4>
        <ul className="mt-3 grid gap-2 text-sm md:grid-cols-3">{insights.map(item => <li key={item} className="rounded-lg bg-white/80 p-3">{item}</li>)}</ul>
      </article>

      <details className="rounded-2xl border bg-white p-5 lg:col-span-2">
        <summary className="cursor-pointer font-black">Data semua peserta ({data.participants.length})</summary>
        <p className="mt-2 text-xs text-slate-500">Paparan pentadbiran sahaja. Maklumat IC, telefon, alamat dan e-mel tidak dimasukkan.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-2">Peserta</th><th>Hadir</th><th>Latihan</th><th>Rakaman</th><th>Purata</th><th>Terbaik</th><th>AI ≥75</th><th>Status qari</th></tr></thead><tbody>{data.participants.map(row => <tr key={row.student_id} className="border-t"><td className="p-2 font-semibold">{row.student_name}</td><td>{row.attendance_status === 'attended' ? 'Ya' : 'Belum'}</td><td>{row.valid_recording_count}/{row.required_recording_count}</td><td>{row.recording_count}</td><td>{score(row.average_score)}</td><td className="font-bold">{score(row.best_score)}</td><td>{row.ai_qualified ? 'Layak' : 'Belum'}</td><td>{{not_applied:'Belum hantar',pending:'Menunggu',approved:'Lulus',rejected:'Tidak lulus',resubmission_requested:'Hantar semula'}[row.qari_status] || row.qari_status}</td></tr>)}</tbody></table></div>
      </details>
      <p className="text-xs text-slate-500 lg:col-span-2">Dijana {new Date(data.generated_at).toLocaleString('ms-MY')}. Statistik rakaman merangkumi rujukan kursus dalam tempoh pelengkapannya; data ini boleh dibandingkan dengan kursus lain melalui pemilih kursus.</p>
    </div>
  </section>;
}
