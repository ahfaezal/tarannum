import React, { useEffect, useState } from "react";
import { CalendarDays, Check, Loader2, Plus, Users } from "lucide-react";
import { createCertificationCourse, enrollCourseStudents, getAdminCourses, getCourseEnrollments, setEnrollmentAttendance, CertificationCourse } from "../services/certificationService";
import { AdminUser, getAvailableContent, listAllUsers } from "../services/platformService";

const AdminCertification: React.FC = () => {
  const [courses, setCourses] = useState<CertificationCourse[]>([]);
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [references, setReferences] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", certificate_category: "tarannum", reference_id: "", starts_at: "", location: "", completion_window_days: 30 });

  const load = async () => {
    const [courseRows, userRows, contentRows] = await Promise.all([getAdminCourses(), listAllUsers("student"), getAvailableContent()]);
    setCourses(courseRows); setStudents(userRows.users); setReferences(contentRows.content || []);
  };
  useEffect(() => { load().catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (selectedCourse) getCourseEnrollments(selectedCourse).then(setEnrollments).catch((err) => setError(err.message)); }, [selectedCourse]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try { await createCertificationCourse({ ...form, starts_at: new Date(form.starts_at).toISOString(), duration_minutes: 360 }); await load(); setForm({ ...form, title: "", reference_id: "", starts_at: "", location: "" }); }
    catch (err: any) { setError(err.message); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Pentadbiran</p><h1 className="text-3xl font-bold">Kursus & Persijilan</h1><p className="mt-2 text-slate-600">Jumlah rakaman dikira automatik daripada 60 minit dan tempoh audio rujukan.</p></header>
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={create} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Plus className="text-emerald-700" /> Cipta kursus</h2>
        <label className="block text-sm font-semibold">Nama kursus<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="block text-sm font-semibold">Kategori<select value={form.certificate_category} onChange={(e) => setForm({ ...form, certificate_category: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="tarannum">Tarannum/Surah</option><option value="azan">Azan</option></select></label>
        <label className="block text-sm font-semibold">Audio rujukan<select required value={form.reference_id} onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="">Pilih kandungan</option>{references.map((item: any) => <option key={item.reference_id || item.id} value={item.reference_id || item.id}>{item.reference_title || item.title} ({Math.round(item.reference_duration || item.duration || 0)}s)</option>)}</select></label>
        <label className="block text-sm font-semibold">Tarikh dan masa<input required type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="block text-sm font-semibold">Lokasi<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="block text-sm font-semibold">Tempoh melengkapkan latihan (hari)<input type="number" min="1" max="365" value={form.completion_window_days} onChange={(e) => setForm({ ...form, completion_window_days: Number(e.target.value) })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <button className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">Cipta Kursus 6 Jam</button>
      </form>

      <section className="space-y-4">
        {courses.map((course) => <article key={course.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${selectedCourse === course.id ? "border-emerald-500" : ""}`}>
          <button className="w-full text-left" onClick={() => setSelectedCourse(course.id)}><div className="flex justify-between gap-3"><div><h2 className="font-bold">{course.title}</h2><p className="mt-1 text-sm text-slate-600">{course.reference_title}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{course.required_recording_count} rakaman</span></div><p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><CalendarDays size={16} /> {new Date(course.starts_at).toLocaleString("ms-MY")} • 60 minit latihan</p></button>
        </article>)}
      </section>
    </div>

    {selectedCourse && <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Users className="text-emerald-700" /> Peserta dan kehadiran</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{students.map((student) => <label key={student.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={(e) => setSelectedStudents(e.target.checked ? [...selectedStudents, student.id] : selectedStudents.filter((id) => id !== student.id))} />{student.full_name || student.email}</label>)}</div>
      <button onClick={async () => { await enrollCourseStudents(selectedCourse, selectedStudents); setEnrollments(await getCourseEnrollments(selectedCourse)); setSelectedStudents([]); }} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">Daftarkan peserta dipilih</button>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Peserta</th><th className="p-2">Kehadiran</th><th className="p-2">Latihan</th><th className="p-2">Tindakan</th></tr></thead><tbody>{enrollments.map((row) => <tr key={row.id} className="border-b"><td className="p-2"><div className="font-semibold">{row.student_name}</div><div className="text-xs text-slate-500">{row.student_email}</div></td><td className="p-2">{row.attendance_status}</td><td className="p-2">{row.valid_recording_count}/{row.required_recording_count}</td><td className="p-2"><button onClick={async () => { await setEnrollmentAttendance(row.id, "attended"); setEnrollments(await getCourseEnrollments(selectedCourse)); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 font-semibold text-emerald-800"><Check size={15} /> Sahkan hadir</button></td></tr>)}</tbody></table></div>
    </section>}
  </div>;
};

export default AdminCertification;
