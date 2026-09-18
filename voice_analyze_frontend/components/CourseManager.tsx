import React, { useEffect, useRef, useState } from 'react';
import { CertificationCourse, managedCertificationRequest as api } from '../services/certificationService';
import { QariContent } from '../services/platformService';
import TrainingChallengePanel from './TrainingChallengePanel';
import { courseContextPath } from '../utils/certificationRequestUtils';

type Context = {qaris: {id: string; name: string}[]; references: QariContent[]; students: {id: string; name: string}[]};
type Enrollment = {id: string; student_id: string; student_name: string; student_email: string; attendance_status: string; valid_recording_count: number; required_recording_count: number; eligible: boolean; competency_status: string};

export default function CourseManager({admin = false, defaultExpanded = false}: {admin?: boolean; defaultExpanded?: boolean}) {
  const [opened, setOpened] = useState(defaultExpanded);
  const [courses, setCourses] = useState<CertificationCourse[]>([]);
  const [context, setContext] = useState<Context>({qaris: [], references: [], students: []});
  const [selected, setSelected] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({title: '', qari_id: '', reference_id: '', certificate_category: 'azan', starts_at: '', duration_minutes: 360, completion_window_days: 30, location: ''});
  const version = useRef(0);
  const course = courses.find(c => c.id === selected);
  const run = async (job: () => Promise<void>) => {setBusy(true); setError(''); try {await job();} catch (e: any) {setError(e.message);} finally {setBusy(false);}};
  const loadCourses = async () => setCourses(await api<CertificationCourse[]>('/managed/courses'));
  const loadContext = async (qariId = form.qari_id, term = '') => {
    const data = await api<Context>(courseContextPath(qariId, term));
    setContext(data);
    if (!admin && data.qaris.length) setForm(f => ({...f, qari_id: data.qaris[0].id}));
  };
  useEffect(() => {if (opened) void run(async () => {await Promise.all([loadCourses(), loadContext()]);});}, [opened]);
  const selectCourse = async (id: string) => {
    const token = ++version.current;
    setSelected(id); setEnrollments([]); setChosen([]);
    await run(async () => {
      const rows = await api<Enrollment[]>(`/managed/courses/${id}/enrollments`);
      if (version.current === token) setEnrollments(rows);
    });
  };
  const refresh = async () => {if (selected) setEnrollments(await api<Enrollment[]>(`/managed/courses/${selected}/enrollments`));};
  const post = (body: unknown) => ({method: 'POST', body: JSON.stringify(body)});
  return <section className="mb-6 rounded-2xl border border-emerald-200 bg-white p-5">
    <button aria-expanded={opened} className="text-xl font-bold text-emerald-800" onClick={() => setOpened(!opened)}>Urus Kursus {opened ? '−' : '+'}</button>
    {opened && <div className="mt-4 space-y-5">
      <p className="text-sm text-slate-600">Satu senarai peserta untuk kursus dan Live Scoring. Sijil Kehadiran memerlukan hadir + 60 minit latihan; Sijil Kompetensi turut memerlukan skor ≥75 dan kelulusan qari.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <label className="block font-semibold">Pilih kursus<select className="ml-3 max-w-full rounded border p-2" value={selected} disabled={busy} onChange={e => {if(e.target.value) void selectCourse(e.target.value); else {setSelected('');setEnrollments([]);}}}><option value="">Pilih kursus untuk pemantauan</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title} · {new Date(c.starts_at).toLocaleDateString('ms-MY')}</option>)}</select></label>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold text-emerald-800">Cipta Kursus Baharu</summary>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={e => {e.preventDefault(); void run(async () => {await api('/managed/courses', post({...form, starts_at: new Date(form.starts_at).toISOString()})); await loadCourses(); setForm(f => ({...f, title: ''}));});}}>
        <label>Nama kursus<input required minLength={3} className="block w-full rounded border p-2" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
        <label>Qari<select required className="block w-full rounded border p-2" value={form.qari_id} disabled={!admin || busy} onChange={e => {const id=e.target.value; setForm({...form,qari_id:id,reference_id:''}); void run(() => loadContext(id));}}><option value="">Pilih qari</option>{context.qaris.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
        <label>Rujukan<select required className="block w-full rounded border p-2" value={form.reference_id} onChange={e => setForm({...form,reference_id:e.target.value})}><option value="">Pilih rujukan pustaka qari</option>{context.references.map(r => <option key={r.id} value={r.reference_id}>{r.reference_title || r.title}</option>)}</select></label>
        <label>Kategori<select className="block w-full rounded border p-2" value={form.certificate_category} onChange={e => setForm({...form,certificate_category:e.target.value})}><option value="azan">Azan</option><option value="tarannum">Tarannum</option></select></label>
        <label>Tarikh dan masa<input required type="datetime-local" className="block w-full rounded border p-2" value={form.starts_at} onChange={e => setForm({...form,starts_at:e.target.value})} /></label>
        <label>Lokasi<input className="block w-full rounded border p-2" value={form.location} onChange={e => setForm({...form,location:e.target.value})} /></label>
        <label>Tempoh program (minit)<input type="number" min={30} max={1440} required className="block w-full rounded border p-2" value={form.duration_minutes} onChange={e => setForm({...form,duration_minutes:Number(e.target.value)})} /></label>
        <label>Tempoh latihan (hari)<input type="number" min={1} max={365} required className="block w-full rounded border p-2" value={form.completion_window_days} onChange={e => setForm({...form,completion_window_days:Number(e.target.value)})} /></label>
        <button disabled={busy} className="rounded bg-emerald-700 p-3 font-bold text-white disabled:opacity-50">Cipta Kursus</button>
      </form>
      </details>
      {course && <div className="space-y-4">
        <h3 className="font-bold">{course.title} · {course.reference_title} · {course.required_recording_count} rakaman sah untuk 60 minit</h3>
        <form onSubmit={e => {e.preventDefault(); void run(() => loadContext(form.qari_id, search));}}><input aria-label="Cari calon peserta" className="rounded border p-2" placeholder="Cari calon peserta" value={search} onChange={e => setSearch(e.target.value)} /><button disabled={busy} className="ml-2 rounded border p-2">Cari</button></form>
        <p className="text-sm text-slate-600">Maksimum 100 calon dipaparkan; gunakan carian. Qari boleh mendaftarkan pelajar yang dipautkan kepadanya; admin boleh mendaftarkan akaun peserta aktif.</p>
        <div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-3">{context.students.filter(s => !enrollments.some(r => r.student_id===s.id)).map(s => <label key={s.id} className="rounded border p-2"><input type="checkbox" checked={chosen.includes(s.id)} onChange={e => setChosen(e.target.checked ? [...chosen,s.id] : chosen.filter(id=>id!==s.id))} /> {s.name}</label>)}</div>
        <button disabled={busy || !chosen.length} className="rounded bg-emerald-700 p-2 text-white disabled:opacity-50" onClick={() => void run(async () => {await api(`/managed/courses/${selected}/enroll`,post({student_ids:chosen})); await refresh();setChosen([]);})}>Daftar peserta dipilih</button>
        <button disabled={busy} className="ml-3 rounded border p-2" onClick={() => void run(refresh)}>Kemaskini kemajuan</button>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Peserta</th><th>Kehadiran</th><th>Latihan</th><th>Kelayakan kehadiran</th></tr></thead><tbody>{enrollments.map(r => <tr key={r.id} className="border-t"><td className="p-2">{r.student_name}</td><td><select disabled={busy} value={r.attendance_status} onChange={e => {const attendance_status=e.target.value; if (!window.confirm('Sahkan perubahan kehadiran peserta ini?')) return; void run(async () => {await api(`/managed/enrollments/${r.id}/attendance`,{method:'PATCH',body:JSON.stringify({attendance_status})});await refresh();});}}><option value="registered">Belum disahkan</option><option value="attended">Hadir</option><option value="absent">Tidak hadir</option></select></td><td>{r.valid_recording_count}/{r.required_recording_count}</td><td>{r.eligible ? 'Layak' : 'Belum lengkap'}</td></tr>)}</tbody></table></div>
        <details><summary className="font-semibold">Status Semakan Kompetensi</summary><ul className="mt-2 space-y-1 text-sm">{enrollments.map(r => <li key={r.id}>{r.student_name}: {{not_applied:'Belum memohon',pending:'Menunggu qari',approved:'Diluluskan',rejected:'Ditolak',resubmission_requested:'Perlu hantar semula'}[r.competency_status] || r.competency_status}</li>)}</ul></details>
        {course.qari_id && <TrainingChallengePanel key={course.id} courseId={course.id} courseReferenceId={course.reference_id} managedQariId={admin ? course.qari_id : undefined} managedQariName={context.qaris.find(q=>q.id===course.qari_id)?.name} students={enrollments.map(r=>({student_id:r.student_id,student_name:r.student_name,student_email:r.student_email,joined_at:'',last_active:''}))} content={[{id:course.reference_id,reference_id:course.reference_id,reference_title:course.reference_title}]} />}
      </div>}
    </div>}
  </section>;
}
