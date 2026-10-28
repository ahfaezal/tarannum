import React, { useEffect, useRef, useState } from 'react';
import { CertificateSummary, CertificationCourse, CourseJoinLink, downloadCertificate, getAdminUserCertificates, getCertificatePdfBlob, getManagedCourseJoinLink, getManagedCourseJoinQr, managedCertificationRequest as api, updateManagedCourseJoinLink } from '../services/certificationService';
import { QariContent } from '../services/platformService';
import TrainingChallengePanel from './TrainingChallengePanel';
import CoursePerformanceDashboard from './CoursePerformanceDashboard';
import { courseContextPath } from '../utils/certificationRequestUtils';

type Context = {qaris: {id: string; name: string}[]; references: QariContent[]; students: {id: string; name: string; email?: string; registered_at?: string}[]; student_total?: number; student_offset?: number; student_limit?: number};
type Enrollment = {id: string; student_id: string; student_name: string; student_email: string; attendance_status: string; valid_recording_count: number; required_recording_count: number; eligible: boolean; competency_status: string; total_recording_count: number; course_date_recording_count: number; post_course_recording_count: number; attendance_certificate_status: 'issued' | 'not_issued'; competency_certificate_status: 'issued' | 'not_issued'};
type AttendanceUpdateResult = Pick<Enrollment, 'attendance_status' | 'valid_recording_count' | 'required_recording_count' | 'eligible'> & {certificate_id?: string | null};

const malaysiaDate = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
const formatMalaysiaDateTime = (value: Date) => value.toLocaleString('ms-MY', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  hour12: true, timeZone: 'Asia/Kuala_Lumpur',
});

export default function CourseManager({admin = false, defaultExpanded = false}: {admin?: boolean; defaultExpanded?: boolean}) {
  const [opened, setOpened] = useState(defaultExpanded);
  const [courses, setCourses] = useState<CertificationCourse[]>([]);
  const [context, setContext] = useState<Context>({qaris: [], references: [], students: []});
  const [selected, setSelected] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({registered_from: '', registered_to: '', sort: 'newest'});
  const [appliedFilters, setAppliedFilters] = useState({search: '', registered_from: '', registered_to: '', sort: 'newest'});
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [certificateStudent, setCertificateStudent] = useState<Enrollment | null>(null);
  const [certificates, setCertificates] = useState<CertificateSummary[]>([]);
  const [certificateError, setCertificateError] = useState('');
  const [certificateLoading, setCertificateLoading] = useState(false);
  const [certificatePreviewUrl, setCertificatePreviewUrl] = useState<string | null>(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [joinLink, setJoinLink] = useState<CourseJoinLink | null>(null);
  const [joinQrUrl, setJoinQrUrl] = useState<string | null>(null);
  const certificateRequest = useRef(0);
  useEffect(() => () => { if (certificatePreviewUrl) URL.revokeObjectURL(certificatePreviewUrl); }, [certificatePreviewUrl]);
  useEffect(() => () => { if (joinQrUrl) URL.revokeObjectURL(joinQrUrl); }, [joinQrUrl]);
  const closeCertificates = () => { certificateRequest.current += 1; setCertificateStudent(null); setCertificates([]); setCertificateError(''); setCertificatePreviewUrl(null); };
  const viewCertificates = async (student: Enrollment) => {
    const request = ++certificateRequest.current;
    setCertificateStudent(student); setCertificates([]); setCertificateError(''); setCertificatePreviewUrl(null); setCertificateLoading(true);
    try { const rows = await getAdminUserCertificates(student.student_id); if (request === certificateRequest.current) setCertificates(rows); }
    catch (e: any) { if (request === certificateRequest.current) setCertificateError(e.message || 'Gagal memuatkan sijil peserta.'); }
    finally { if (request === certificateRequest.current) setCertificateLoading(false); }
  };
  const previewCertificate = async (certificate: CertificateSummary) => {
    setCertificateError(''); setCertificatePreviewUrl(null);
    try { setCertificatePreviewUrl(URL.createObjectURL(await getCertificatePdfBlob(certificate.id))); }
    catch (e: any) { setCertificateError(e.message || 'Gagal membuka PDF sijil.'); }
  };
  const [form, setForm] = useState({title: '', certificate_course_title: '', competency_name: '', qari_id: '', reference_id: '', certificate_category: 'azan', starts_at: '', duration_minutes: 360, completion_window_days: 30, required_practice_minutes: 60, location: ''});
  const version = useRef(0);
  const course = courses.find(c => c.id === selected);
  const run = async (job: () => Promise<void>) => {setBusy(true); setError(''); try {await job();} catch (e: any) {setError(e.message);} finally {setBusy(false);}};
  const loadCourses = async () => {
    const rows = await api<CertificationCourse[]>('/managed/courses');
    setCourses(rows);
    return rows;
  };
  const loadContext = async (qariId = form.qari_id, term = '', options = {registered_from: '', registered_to: '', sort: 'newest', offset: 0}) => {
    const data = await api<Context>(courseContextPath(qariId, term, options));
    setContext(data);
    if (!admin && data.qaris.length) setForm(f => ({...f, qari_id: data.qaris[0].id}));
  };
  useEffect(() => {if (opened) void run(async () => {await Promise.all([loadCourses(), loadContext()]);});}, [opened]);
  const selectCourse = async (id: string) => {
    const token = ++version.current;
    setSelected(id); setEnrollments([]); setChosen([]); setShowPerformance(false); setJoinLink(null);
    if (joinQrUrl) URL.revokeObjectURL(joinQrUrl);
    setJoinQrUrl(null);
    setAppliedFilters({search, ...filters});
    await run(async () => {
      const [rows, link, qr] = await Promise.all([
        api<Enrollment[]>(`/managed/courses/${id}/enrollments`),
        getManagedCourseJoinLink(id),
        getManagedCourseJoinQr(id),
      ]);
      if (version.current === token) {
        setEnrollments(rows);
        setJoinLink(link);
        setJoinQrUrl(URL.createObjectURL(qr));
        const selectedCourse = courses.find(c => c.id === id);
        if (selectedCourse) await loadContext(selectedCourse.qari_id, search, {...filters, offset: 0});
      }
    });
  };
  const refreshJoinQr = async (payload: {rotate?: boolean; enabled?: boolean}) => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const link = await updateManagedCourseJoinLink(selected, payload);
      const qr = await getManagedCourseJoinQr(selected);
      if (joinQrUrl) URL.revokeObjectURL(joinQrUrl);
      setJoinLink(link); setJoinQrUrl(URL.createObjectURL(qr));
      setSuccess(payload.rotate ? 'Kod QR baharu berjaya dijana. QR lama tidak lagi sah.' : link.enabled ? 'Penyertaan QR dibuka.' : 'Penyertaan QR ditutup.');
    } catch (e: any) { setError(e.message || 'Gagal mengemas kini QR kursus.'); }
    finally { setBusy(false); }
  };
  const refresh = async () => {if (selected) setEnrollments(await api<Enrollment[]>(`/managed/courses/${selected}/enrollments`));};
  const updateAttendance = async (enrollment: Enrollment, attendanceStatus: string) => {
    setError('');
    setAttendanceBusy(current => new Set(current).add(enrollment.id));
    try {
      const result = await api<AttendanceUpdateResult>(`/managed/enrollments/${enrollment.id}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({attendance_status: attendanceStatus}),
      });
      setEnrollments(current => current.map(row => row.id === enrollment.id ? {
        ...row,
        attendance_status: result.attendance_status,
        valid_recording_count: result.valid_recording_count,
        required_recording_count: result.required_recording_count,
        eligible: result.eligible,
        attendance_certificate_status: result.certificate_id ? 'issued' : row.attendance_certificate_status,
      } : row));
    } catch (e: any) {
      setError(e.message || 'Gagal mengemas kini kehadiran peserta.');
    } finally {
      setAttendanceBusy(current => {
        const next = new Set(current);
        next.delete(enrollment.id);
        return next;
      });
    }
  };
  const post = (body: unknown) => ({method: 'POST', body: JSON.stringify(body)});
  return <section className="mb-8 rounded-2xl border border-emerald-300 bg-white p-5 shadow-md">
    <button aria-expanded={opened} className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setOpened(!opened)}>
      <span><span className="block text-xl font-black text-emerald-900">Cipta / Urus Kursus &amp; QR</span><span className="mt-1 block text-sm font-normal text-slate-600">Cipta kursus, jana QR penyertaan, daftar peserta dan sahkan kehadiran.</span></span>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-2xl font-bold text-white" aria-hidden="true">{opened ? '−' : '+'}</span>
    </button>
    {opened && <div className="mt-4 space-y-5">
      <p className="text-sm text-slate-600">Satu senarai peserta untuk kursus dan Live Scoring. Sijil Kehadiran memerlukan hadir + 60 minit latihan; Sijil Kompetensi turut memerlukan skor ≥75 dan kelulusan qari.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {success && <p role="status" aria-live="polite" className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800">{success}</p>}
      <label className="block font-semibold">Pilih kursus<select className="ml-3 max-w-full rounded border p-2" value={selected} disabled={busy} onChange={e => {if(e.target.value) void selectCourse(e.target.value); else {setSelected('');setEnrollments([]);setShowPerformance(false);}}}><option value="">Pilih kursus untuk pemantauan</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title} · {new Date(c.starts_at).toLocaleDateString('ms-MY')}</option>)}</select></label>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold text-emerald-800">Cipta Kursus Baharu</summary>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={e => {e.preventDefault(); setSuccess(''); void run(async () => {const payload={...form, starts_at: new Date(form.starts_at).toISOString()};let created: CertificationCourse | null=null;try{created=await api<CertificationCourse>('/managed/courses', post(payload));}catch(reason:any){if(!String(reason?.message || reason).toLowerCase().includes('failed to fetch')) throw reason;const rows=await loadCourses();created=rows.find(item=>item.title===payload.title.trim() && item.qari_id===payload.qari_id && item.reference_id===payload.reference_id && Math.abs(new Date(item.starts_at).getTime()-new Date(payload.starts_at).getTime())<1000) || null;if(!created) throw reason;}setSuccess('Kursus Telah Berjaya Dicipta. Pilih kursus tersebut pada senarai di atas untuk melihat QR.'); setForm(f => ({...f, title: '', certificate_course_title: '', competency_name: '', starts_at: '', location: ''})); await loadCourses();});}}>
        <label>Nama pengurusan kursus<span className="block text-xs font-normal text-slate-500">Untuk dashboard dan pemantauan dalaman</span><input required minLength={3} className="block w-full rounded border p-2" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></label>
        <label>Qari<select required className="block w-full rounded border p-2" value={form.qari_id} disabled={!admin || busy} onChange={e => {const id=e.target.value; setForm({...form,qari_id:id,reference_id:''}); void run(() => loadContext(id));}}><option value="">Pilih qari</option>{context.qaris.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
        <label>Nama kursus pada sijil<span className="block text-xs font-normal text-slate-500">Dicetak pada Sijil Kehadiran & Penyertaan</span><input required minLength={3} maxLength={240} className="block w-full rounded border p-2 uppercase" value={form.certificate_course_title} onChange={e => setForm({...form, certificate_course_title: e.target.value.toUpperCase()})} placeholder="KURSUS AZAN TARANNUM HIJJAZ" /></label>
        <label>Nama kompetensi<span className="block text-xs font-normal text-slate-500">Dicetak pada Sijil Kompetensi</span><input required minLength={3} maxLength={240} className="block w-full rounded border p-2 uppercase" value={form.competency_name} onChange={e => setForm({...form, competency_name: e.target.value.toUpperCase()})} placeholder="AZAN TARANNUM HIJJAZ" /></label>
        <label>Rujukan<select required className="block w-full rounded border p-2" value={form.reference_id} onChange={e => setForm({...form,reference_id:e.target.value})}><option value="">Pilih rujukan pustaka qari</option>{context.references.map(r => <option key={r.id} value={r.reference_id}>{r.reference_title || r.title}</option>)}</select></label>
        <label>Kategori<select className="block w-full rounded border p-2" value={form.certificate_category} onChange={e => setForm({...form,certificate_category:e.target.value})}><option value="azan">Azan</option><option value="tarannum">Tarannum</option></select></label>
        <label>Tarikh dan masa<input required type="datetime-local" className="block w-full rounded border p-2" value={form.starts_at} onChange={e => setForm({...form,starts_at:e.target.value})} /></label>
        <label>Lokasi latihan<span className="block text-xs font-normal text-slate-500">Dicetak pada sijil kehadiran</span><input required minLength={2} maxLength={240} className="block w-full rounded border p-2" value={form.location} onChange={e => setForm({...form,location:e.target.value})} /></label>
        <label>Tempoh program (minit)<input type="number" min={30} max={1440} required className="block w-full rounded border p-2" value={form.duration_minutes} onChange={e => setForm({...form,duration_minutes:Number(e.target.value)})} /></label>
        <label>Keperluan latihan rakaman (minit)<input type="number" min={15} max={600} required className="block w-full rounded border p-2" value={form.required_practice_minutes} onChange={e => setForm({...form,required_practice_minutes:Number(e.target.value)})} /></label>
        <label>Tempoh melengkapkan latihan (hari)<span className="block text-xs font-normal text-slate-500">Bilangan hari selepas tarikh kursus</span><input type="number" min={1} max={365} required className="block w-full rounded border p-2" value={form.completion_window_days} onChange={e => setForm({...form,completion_window_days:Number(e.target.value)})} /></label>
        <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-emerald-950">Pratonton Maklumat Sijil</p><div className="mt-2 grid gap-2 text-sm md:grid-cols-2"><p><span className="text-slate-500">Sijil kehadiran:</span><br/><strong>{form.certificate_course_title || '—'}</strong></p><p><span className="text-slate-500">Sijil kompetensi:</span><br/><strong>{form.competency_name || '—'}</strong></p><p><span className="text-slate-500">Lokasi latihan:</span><br/><strong>{form.location || '—'}</strong></p><p><span className="text-slate-500">Latihan wajib:</span><br/><strong>{form.required_practice_minutes} minit dalam tempoh {form.completion_window_days} hari</strong></p></div><p className="mt-3 text-xs text-emerald-800">Maklumat ini akan dibekukan dalam snapshot apabila sijil dijana.</p></div>
        <button disabled={busy} className="rounded bg-emerald-700 p-3 font-bold text-white disabled:opacity-50 md:col-span-2">Cipta Kursus</button>
      </form>
      </details>
      {course && <div className="space-y-4">
        {(() => {
          const startsAt = malaysiaDate(course.starts_at);
          const endsAt = new Date(startsAt.getTime() + course.duration_minutes * 60_000);
          const completionDeadline = new Date(startsAt.getTime() + course.completion_window_days * 86_400_000);
          const qariName = context.qaris.find(q => q.id === course.qari_id)?.name || '—';
          return <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-labelledby="course-information-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 id="course-information-heading" className="text-lg font-bold text-emerald-950">Maklumat Kursus</h3><p className="text-sm text-emerald-800">Ringkasan rasmi untuk semakan pentadbiran dan sijil.</p></div>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-800">{enrollments.length} peserta</span>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              <div><dt className="text-slate-500">Nama pengurusan kursus</dt><dd className="font-semibold text-slate-900">{course.title}</dd></div>
              <div><dt className="text-slate-500">Nama pada sijil</dt><dd className="font-semibold text-slate-900">{course.certificate_course_title || course.title}</dd></div>
              <div><dt className="text-slate-500">Nama kompetensi</dt><dd className="font-semibold text-slate-900">{course.competency_name || '—'}</dd></div>
              <div><dt className="text-slate-500">Qari</dt><dd className="font-semibold text-slate-900">{qariName}</dd></div>
              <div><dt className="text-slate-500">Rujukan latihan</dt><dd className="font-semibold text-slate-900">{course.reference_title}</dd></div>
              <div><dt className="text-slate-500">Kategori</dt><dd className="font-semibold capitalize text-slate-900">{course.certificate_category}</dd></div>
              <div><dt className="text-slate-500">Tarikh dan masa mula</dt><dd className="font-semibold text-slate-900">{formatMalaysiaDateTime(startsAt)}</dd></div>
              <div><dt className="text-slate-500">Tarikh dan masa tamat</dt><dd className="font-semibold text-slate-900">{formatMalaysiaDateTime(endsAt)}</dd></div>
              <div><dt className="text-slate-500">Lokasi</dt><dd className="font-semibold text-slate-900">{course.location || '—'}</dd></div>
              <div><dt className="text-slate-500">Tempoh program</dt><dd className="font-semibold text-slate-900">{Math.floor(course.duration_minutes / 60)} jam {course.duration_minutes % 60 ? `${course.duration_minutes % 60} minit` : ''}</dd></div>
              <div><dt className="text-slate-500">Keperluan latihan</dt><dd className="font-semibold text-slate-900">{course.required_practice_minutes} minit ({course.required_recording_count} rakaman sah)</dd></div>
              <div><dt className="text-slate-500">Tarikh akhir latihan</dt><dd className="font-semibold text-slate-900">{formatMalaysiaDateTime(completionDeadline)} ({course.completion_window_days} hari)</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="font-semibold capitalize text-slate-900">{course.status}</dd></div>
            </dl>
          </section>;
        })()}
        {joinLink && <section className="rounded-xl border border-sky-200 bg-sky-50 p-4" aria-labelledby="course-qr-heading">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            {joinQrUrl && <img src={joinQrUrl} alt={`QR penyertaan ${course.title}`} className="h-48 w-48 rounded-xl border bg-white p-2" />}
            <div className="min-w-0 flex-1"><h3 id="course-qr-heading" className="text-lg font-bold text-sky-950">QR Penyertaan Kursus</h3><p className="mt-1 text-sm text-sky-900">Peserta login, imbas QR dan sistem memilih Qari serta rujukan ini secara automatik. Kehadiran masih perlu disahkan Qari.</p><p className="mt-3 break-all rounded-lg bg-white p-3 text-xs text-slate-600">{joinLink.join_url}</p><p className="mt-2 text-xs font-semibold text-slate-600">Status: {joinLink.enabled ? 'Dibuka' : 'Ditutup'}{joinLink.expires_at ? ` · Tamat ${formatMalaysiaDateTime(malaysiaDate(joinLink.expires_at))}` : ''}</p>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void navigator.clipboard.writeText(joinLink.join_url).then(() => setSuccess('Pautan penyertaan disalin.'))} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white">Salin pautan</button><a href={joinQrUrl || undefined} download={`qr-${course.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`} className="rounded-lg border border-sky-700 px-3 py-2 text-sm font-bold text-sky-800">Muat turun QR</a><button type="button" disabled={busy} onClick={() => void refreshJoinQr({enabled: !joinLink.enabled})} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-bold">{joinLink.enabled ? 'Tutup penyertaan' : 'Buka penyertaan'}</button><button type="button" disabled={busy} onClick={() => {if(window.confirm('Jana QR baharu? QR lama akan berhenti berfungsi.')) void refreshJoinQr({rotate:true, enabled:true});}} className="rounded-lg border border-amber-500 px-3 py-2 text-sm font-bold text-amber-800">Jana QR baharu</button></div>
            </div>
          </div>
        </section>}
        {admin && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-emerald-950">Infografik Prestasi Kursus</p><p className="text-sm text-emerald-800">Analisis lengkap dimuatkan hanya apabila diperlukan.</p></div><button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800" onClick={() => setShowPerformance(value => !value)}>{showPerformance ? 'Tutup Infografik' : 'Buka Infografik Prestasi'}</button></div>{showPerformance && <div className="mt-4"><CoursePerformanceDashboard key={course.id} courseId={course.id} /></div>}</div>}
        <form className="grid gap-3 md:grid-cols-4" onSubmit={e => {e.preventDefault(); setAppliedFilters({search, ...filters}); void run(() => loadContext(course.qari_id, search, {...filters, offset: 0}));}}>
          <label>Nama atau e-mel<input className="block w-full rounded border p-2" placeholder="Cari calon peserta" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <label>Tarikh daftar dari<input type="date" className="block w-full rounded border p-2" value={filters.registered_from} onChange={e => setFilters({...filters, registered_from:e.target.value})} /></label>
          <label>Tarikh daftar hingga<input type="date" min={filters.registered_from || undefined} className="block w-full rounded border p-2" value={filters.registered_to} onChange={e => setFilters({...filters, registered_to:e.target.value})} /></label>
          <label>Susunan<select className="block w-full rounded border p-2" value={filters.sort} onChange={e => setFilters({...filters, sort:e.target.value})}><option value="newest">Daftar terkini</option><option value="oldest">Daftar terawal</option><option value="name">Nama A–Z</option></select></label>
          <button disabled={busy} className="rounded border p-2">Cari / Tapis</button>
          <button type="button" disabled={busy} className="rounded border p-2" onClick={() => {const reset={registered_from:'',registered_to:'',sort:'newest'};setSearch('');setFilters(reset);setAppliedFilters({search:'',...reset});void run(() => loadContext(course.qari_id, '', {...reset,offset:0}));}}>Set semula</button>
        </form>
        <p className="text-sm text-slate-600">{context.student_total ?? context.students.length} akaun sepadan. {chosen.length} dipilih (pilihan dikekalkan antara halaman). Tarikh merujuk kepada pendaftaran akaun, bukan pendaftaran kursus. Qari hanya boleh mendaftarkan pelajar yang dipautkan kepadanya.</p>
        <div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-3">{context.students.map(s => {const enrolled=enrollments.some(r => r.student_id===s.id);return <label key={s.id} className="rounded border p-2"><input type="checkbox" disabled={busy || enrolled} checked={enrolled || chosen.includes(s.id)} onChange={e => setChosen(e.target.checked ? [...chosen,s.id] : chosen.filter(id=>id!==s.id))} /> {s.name}<span className="block break-all text-xs text-slate-500">{s.email}{enrolled ? ' · Sudah didaftarkan' : ''}</span></label>;})}</div>
        {!context.students.length && <p role="status">Tiada peserta sepadan dengan carian ini.</p>}
        <div className="flex items-center gap-3"><button disabled={busy || !(context.student_offset || 0)} className="rounded border p-2" onClick={() => void run(() => loadContext(course.qari_id, appliedFilters.search, {...appliedFilters, offset:Math.max(0,(context.student_offset || 0)-(context.student_limit || 50))}))}>Sebelumnya</button><span>Halaman {Math.floor((context.student_offset || 0)/(context.student_limit || 50))+1}</span><button disabled={busy || (context.student_offset || 0)+context.students.length >= (context.student_total ?? context.students.length)} className="rounded border p-2" onClick={() => void run(() => loadContext(course.qari_id, appliedFilters.search, {...appliedFilters, offset:(context.student_offset || 0)+(context.student_limit || 50)}))}>Seterusnya</button></div>
        <button disabled={busy || !chosen.length} className="rounded bg-emerald-700 p-2 text-white disabled:opacity-50" onClick={() => void run(async () => {await api(`/managed/courses/${selected}/enroll`,post({student_ids:chosen})); await refresh();setChosen([]);})}>Daftar peserta dipilih</button>
        <button disabled={busy} className="ml-3 rounded border p-2" onClick={() => void run(refresh)}>Kemaskini kemajuan</button>
        <div className="overflow-x-auto"><table className="w-full min-w-[1280px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Peserta</th><th>Kehadiran</th><th>Rakaman sah (≥80%)</th><th>Jumlah rakaman</th><th>Rakaman pada {new Date(course.starts_at).toLocaleDateString('ms-MY', {day:'numeric', month:'short', timeZone:'Asia/Kuala_Lumpur'})}</th><th>Rakaman selepas {new Date(course.starts_at).toLocaleDateString('ms-MY', {day:'numeric', month:'short', timeZone:'Asia/Kuala_Lumpur'})}</th><th>Kelayakan kehadiran</th>{admin && <><th>Sijil kehadiran</th><th>Sijil kompetensi</th><th>Tindakan</th></>}</tr></thead><tbody>{enrollments.map(r => {const savingAttendance=attendanceBusy.has(r.id);return <tr key={r.id} className="border-t"><td className="p-2 font-medium">{r.student_name}</td><td><select disabled={busy || savingAttendance} value={r.attendance_status} onChange={e => {const attendance_status=e.target.value; if (!window.confirm('Sahkan perubahan kehadiran peserta ini?')) return; void updateAttendance(r, attendance_status);}}><option value="registered">Belum disahkan</option><option value="attended">Hadir</option><option value="absent">Tidak hadir</option></select>{savingAttendance && <span className="ml-2 text-xs font-semibold text-amber-700">Menyimpan...</span>}</td><td>{r.valid_recording_count}/{r.required_recording_count}</td><td className="font-semibold">{r.total_recording_count}</td><td>{r.course_date_recording_count}</td><td>{r.post_course_recording_count}</td><td>{r.eligible ? 'Layak' : 'Belum lengkap'}</td>{admin && <><td><span className={r.attendance_certificate_status === 'issued' ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{r.attendance_certificate_status === 'issued' ? 'Dikeluarkan' : 'Belum ada'}</span></td><td><span className={r.competency_certificate_status === 'issued' ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{r.competency_certificate_status === 'issued' ? 'Dikeluarkan' : 'Belum ada'}</span></td><td><button type="button" className="rounded border border-emerald-700 px-2 py-1 font-semibold text-emerald-800" onClick={() => void viewCertificates(r)}>Lihat semua sijil</button></td></>}</tr>})}</tbody></table></div>
        <details><summary className="font-semibold">Status Semakan Kompetensi</summary><ul className="mt-2 space-y-1 text-sm">{enrollments.map(r => <li key={r.id}>{r.student_name}: {{not_applied:'Belum memohon',pending:'Menunggu qari',approved:'Diluluskan',rejected:'Ditolak',resubmission_requested:'Perlu hantar semula'}[r.competency_status] || r.competency_status}</li>)}</ul></details>
        {course.qari_id && <TrainingChallengePanel key={course.id} courseId={course.id} courseReferenceId={course.reference_id} managedQariId={admin ? course.qari_id : undefined} managedQariName={context.qaris.find(q=>q.id===course.qari_id)?.name} students={enrollments.map(r=>({student_id:r.student_id,student_name:r.student_name,student_email:r.student_email,joined_at:'',last_active:''}))} content={[{id:course.reference_id,reference_id:course.reference_id,reference_title:course.reference_title}]} />}
      </div>}
      {admin && certificateStudent && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3" role="presentation"><section role="dialog" aria-modal="true" aria-label={`Sijil ${certificateStudent.student_name}`} className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Semua sijil · {certificateStudent.student_name}</h3><p className="text-sm text-slate-600">Sijil kehadiran dan kompetensi yang telah dijana untuk akaun ini.</p></div><button type="button" onClick={closeCertificates} className="rounded border px-3 py-1">Tutup</button></div><div className="mt-4 space-y-3 overflow-y-auto">{certificateLoading && <p>Memuatkan sijil…</p>}{certificateError && <p role="alert" className="text-red-700">{certificateError}</p>}{!certificateLoading && !certificateError && certificates.length === 0 && <p>Belum ada sijil dijana untuk peserta ini.</p>}{certificates.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-bold">{c.certificate_type === 'attendance' ? 'Sijil Kehadiran & Penyertaan' : c.certificate_type === 'competency_azan' ? 'Sijil Kompetensi Azan' : 'Sijil Kompetensi Tarannum'}</p><p className="text-sm text-slate-600">{c.certificate_number} · {c.status} · {new Date(c.issued_at).toLocaleDateString('ms-MY')}</p>{c.publication_held && <p className="text-xs text-amber-700">Belum dilepaskan kepada peserta</p>}{c.profile_incomplete && <p className="text-xs text-amber-700">Profil peserta belum lengkap</p>}</div><div className="flex gap-2"><button type="button" disabled={c.status !== 'valid'} onClick={() => void previewCertificate(c)} className="rounded border px-3 py-1 disabled:opacity-50">Lihat PDF</button><button type="button" disabled={c.status !== 'valid'} onClick={() => void downloadCertificate(c.id, c.certificate_number).catch(e => setCertificateError(e.message))} className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50">Muat turun</button></div></div>)}{certificatePreviewUrl && <iframe src={certificatePreviewUrl} title="Pratonton sijil peserta" className="h-[55vh] w-full rounded border" />}</div></section></div>}
    </div>}
  </section>;
}
