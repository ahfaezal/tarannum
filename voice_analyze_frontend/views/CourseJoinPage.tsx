import React, { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, MapPin, Mic2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CourseJoinPreview,
  getCourseJoinPreview,
  joinCourseWithQr,
} from "../services/certificationService";


const CourseJoinPage: React.FC = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<CourseJoinPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setError("");
    getCourseJoinPreview(token)
      .then((data) => { if (active) setPreview(data); })
      .catch((reason) => { if (active) setError(reason.message || "QR kursus tidak dapat disahkan."); });
    return () => { active = false; };
  }, [token]);

  const join = async () => {
    setBusy(true); setError("");
    try {
      const result = await joinCourseWithQr(token);
      sessionStorage.setItem("tarannum_course_id", result.course_id);
      sessionStorage.setItem("tarannum_course_reference_id", result.reference_id);
      sessionStorage.setItem("tarannum_course_title", result.course_title);
      navigate(result.training_path);
    } catch (reason: any) {
      setError(reason.message || "Penyertaan kursus gagal.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !preview) return <section className="mx-auto max-w-xl p-6 sm:py-16"><div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"><h1 className="text-xl font-bold">QR kursus tidak dapat digunakan</h1><p className="mt-2">{error}</p><button onClick={() => navigate('/course/scan')} className="mt-5 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white">Imbas QR lain</button></div></section>;
  if (!preview) return <div className="p-12 text-center text-slate-600" role="status">Menyemak maklumat kursus…</div>;

  const course = preview.course;
  return <section className="mx-auto max-w-2xl p-4 sm:py-12">
    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl">
      <div className="bg-emerald-950 p-7 text-white"><p className="text-sm font-bold uppercase tracking-[.18em] text-emerald-300">Penyertaan Kursus Tarannum.ai</p><h1 className="mt-3 text-3xl font-black">{course.title}</h1><p className="mt-2 text-emerald-100">Sila semak maklumat sebelum menyertai ruang kursus.</p></div>
      <div className="space-y-4 p-7 text-slate-800">
        <p className="flex gap-3"><Mic2 className="shrink-0 text-emerald-700"/><span><strong>Qari</strong><br/>{preview.qari_name}</span></p>
        <p className="flex gap-3"><CheckCircle2 className="shrink-0 text-emerald-700"/><span><strong>Rujukan latihan</strong><br/>{course.reference_title}</span></p>
        <p className="flex gap-3"><CalendarDays className="shrink-0 text-emerald-700"/><span><strong>Tarikh dan masa</strong><br/>{new Date(course.starts_at).toLocaleString('ms-MY', {dateStyle:'long', timeStyle:'short', timeZone:'Asia/Kuala_Lumpur'})}</span></p>
        <p className="flex gap-3"><MapPin className="shrink-0 text-emerald-700"/><span><strong>Lokasi</strong><br/>{course.location || 'Tidak dinyatakan'}</span></p>
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Penyertaan ini belum mengesahkan kehadiran. Qari perlu menandakan status <strong>Hadir</strong> secara berasingan.</div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
        <button disabled={busy} onClick={() => void join()} className="w-full rounded-xl bg-emerald-700 px-5 py-4 text-lg font-black text-white disabled:opacity-60">{busy ? 'Menyertai…' : preview.already_joined ? 'Buka ruang kursus' : 'Sertai kursus ini'}</button>
      </div>
    </div>
  </section>;
};

export default CourseJoinPage;
