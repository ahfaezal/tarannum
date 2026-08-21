import React, { useEffect, useState } from "react";
import { Award, Bell, CheckCircle2, Download, Loader2 } from "lucide-react";
import { CertificateSummary, CourseProgress, downloadCertificate, getCertificationNotifications, getCompetencyEligibility, getMyCertificates, getStudentCourseProgress, submitCompetencyApplication } from "../services/certificationService";

const labels: Record<string, string> = {
  attendance: "Sijil Kehadiran & Penyertaan",
  competency_tarannum: "Sijil Kompetensi Tarannum",
  competency_azan: "Sijil Kompetensi Azan",
};

const CertificatesPage: React.FC = () => {
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [certificates, setCertificates] = useState<CertificateSummary[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [eligibility, setEligibility] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getStudentCourseProgress(), getMyCertificates(), getCertificationNotifications(), getCompetencyEligibility()])
      .then(([courseData, certificateData, notificationData, eligibilityData]) => {
        setProgress(courseData); setCertificates(certificateData); setNotifications(notificationData); setEligibility(eligibilityData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="rounded-2xl bg-gradient-to-r from-emerald-950 to-emerald-800 p-6 text-white">
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Tarannum.ai</p>
      <h1 className="mt-1 text-3xl font-bold">Sijil Saya</h1>
      <p className="mt-2 text-emerald-100">Pantau latihan kursus dan muat turun sijil rasmi anda.</p>
    </header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Kemajuan Kursus</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {progress.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Tiada kursus berdaftar.</p>}
        {progress.map((item) => {
          const percent = Math.min(100, Math.round(item.valid_recording_count * 100 / Math.max(1, item.required_recording_count)));
          return <article key={item.enrollment_id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-900">{item.title}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.attendance_status === "attended" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.attendance_status === "attended" ? "Hadir disahkan" : "Menunggu kehadiran"}</span></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} /></div>
            <div className="mt-2 flex justify-between text-sm text-slate-600"><span>{item.valid_recording_count}/{item.required_recording_count} rakaman</span><span>{percent}%</span></div>
            <p className="mt-3 text-sm text-slate-500">Baki {item.remaining_recording_count} rakaman • Tarikh akhir {new Date(item.deadline).toLocaleDateString("ms-MY")}</p>
          </article>;
        })}
      </div>
    </section>

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Kelayakan Kompetensi</h2>
      <div className="space-y-3">{eligibility.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Belum ada rakaman dengan skor 75 ke atas.</p>}{eligibility.map((item) => <article key={item.session_id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div><h3 className="font-bold">{item.reference_title}{item.maqam ? ` • ${item.maqam}` : ""}</h3><p className="text-sm text-slate-600">Skor AI {Number(item.score).toFixed(1)} • {item.application_status ? `Status: ${item.application_status}` : "Layak dihantar kepada Qari"}</p></div>{!item.application_id && <div className="flex gap-2"><button onClick={async () => { await submitCompetencyApplication(item.session_id, "competency_tarannum"); setEligibility(await getCompetencyEligibility()); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Mohon Tarannum</button><button onClick={async () => { await submitCompetencyApplication(item.session_id, "competency_azan"); setEligibility(await getCompetencyEligibility()); }} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800">Mohon Azan</button></div>}</article>)}</div>
    </section>

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Sijil Rasmi</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {certificates.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Belum ada sijil dikeluarkan.</p>}
        {certificates.map((certificate) => <article key={certificate.id} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <Award className="h-9 w-9 text-amber-500" />
          <h3 className="mt-3 font-bold text-slate-900">{labels[certificate.certificate_type]}</h3>
          <p className="mt-1 font-mono text-xs text-slate-500">{certificate.certificate_number}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> Status: {certificate.status}</p>
          <button onClick={() => downloadCertificate(certificate.id, certificate.certificate_number).catch((err) => setError(err.message))} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800"><Download size={17} /> Muat turun PDF</button>
        </article>)}
      </div>
    </section>

    <section className="rounded-2xl border bg-white p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Bell className="text-emerald-700" /> Notifikasi</h2>
      <div className="mt-3 divide-y">{notifications.slice(0, 6).map((note) => <div key={note.id} className="py-3"><p className="font-semibold text-slate-800">{note.title}</p><p className="text-sm text-slate-600">{note.message}</p></div>)}{notifications.length === 0 && <p className="py-3 text-slate-500">Tiada notifikasi.</p>}</div>
    </section>
  </div>;
};

export default CertificatesPage;
