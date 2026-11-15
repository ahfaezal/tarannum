import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Bell, CheckCircle2, Download, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { CertificateSummary, CompetencyEligibility, CourseProgress, createCourseReassessmentCheckout, createPrivateAssessmentCheckout, downloadCertificate, getCertificationNotifications, getCompetencyEligibility, getMyCertificates, getStudentCourseProgress, submitCompetencyApplication } from "../services/certificationService";
import { getStudentProfile, StudentProfile } from "../services/authService";

const labels: Record<string, string> = {
  attendance: "Sijil Kehadiran & Penyertaan",
  competency_tarannum: "Sijil Kompetensi Tarannum",
  competency_azan: "Sijil Kompetensi Azan",
};

const CertificatesPage: React.FC = () => {
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [certificates, setCertificates] = useState<CertificateSummary[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [eligibility, setEligibility] = useState<CompetencyEligibility[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadStatus = async () => {
    // Progress recalculation may issue a certificate. Read certificates and
    // notifications only after that transaction has completed.
    const courseData = await getStudentCourseProgress();
    const [certificateData, notificationData, eligibilityData, profileData] = await Promise.all([
      getMyCertificates(), getCertificationNotifications(), getCompetencyEligibility(), getStudentProfile(),
    ]);
    return { courseData, certificateData, notificationData, eligibilityData, profileData };
  };

  const applyStatus = (data: Awaited<ReturnType<typeof loadStatus>>) => {
    setProgress(data.courseData);
    setCertificates(data.certificateData);
    setNotifications(data.notificationData);
    setEligibility(data.eligibilityData);
    setProfile(data.profileData);
  };

  const refreshStatus = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try { applyStatus(await loadStatus()); }
    catch (err: any) { setError(err.message || "Gagal mengemaskini status sijil. Sila cuba semula."); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    let cancelled = false;
    loadStatus()
      .then((data) => { if (!cancelled) applyStatus(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-emerald-700" /></div>;

  const missingProfileFields = [
    ["Nama penuh", profile?.full_name],
    ["No. kad pengenalan", profile?.ic_number],
    ["Alamat", profile?.address],
    ["No. telefon", profile?.phone_number],
  ].filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
  const profileIncomplete = missingProfileFields.length > 0;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="rounded-2xl bg-gradient-to-r from-emerald-950 to-emerald-800 p-6 text-white">
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Tarannum.ai</p>
      <h1 className="mt-1 text-3xl font-bold">Sijil Saya</h1>
      <p className="mt-2 text-emerald-100">Pantau latihan kursus dan sijil yang telah diterbitkan untuk anda.</p>
      <button type="button" disabled={refreshing} onClick={refreshStatus} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/40 px-4 py-2 font-semibold text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60">
        <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        {refreshing ? "Mengemaskini…" : "Kemaskini Status"}
      </button>
      <p className="mt-2 text-sm text-emerald-100" role="status" aria-live="polite">{refreshing ? "Sedang menyemak kemajuan dan sijil terkini." : "Sijil kursus yang sedang disemak hanya akan dipaparkan selepas senarai penerima dimuktamadkan."}</p>
    </header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Kemajuan Kursus</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {progress.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Tiada kursus berdaftar.</p>}
        {progress.map((item) => {
          const validCount = item.actual_valid_recording_count ?? item.valid_recording_count;
          const attemptedCount = item.attempted_recording_count ?? validCount;
          const uncreditedCount = item.uncredited_recording_count ?? Math.max(0, attemptedCount - validCount);
          const remainingCount = Math.max(0, item.required_recording_count - validCount);
          const percent = Math.min(100, Math.round(validCount * 100 / Math.max(1, item.required_recording_count)));
          const millisecondsLeft = new Date(item.deadline).getTime() - now;
          const expired = millisecondsLeft <= 0 || item.submission_open === false;
          const totalMinutes = Math.max(0, Math.ceil(millisecondsLeft / 60_000));
          const daysLeft = Math.floor(totalMinutes / (24 * 60));
          const hoursLeft = Math.floor((totalMinutes % (24 * 60)) / 60);
          const minutesLeft = totalMinutes % 60;
          const urgent = !expired && millisecondsLeft <= 7 * 24 * 60 * 60_000;
          return <article key={item.enrollment_id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-900">{item.title}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.attendance_status === "attended" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.attendance_status === "attended" ? "Hadir disahkan" : "Menunggu kehadiran"}</span></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} /></div>
            <div className="mt-2 flex justify-between text-sm text-slate-600"><span>{validCount}/{item.required_recording_count} rakaman sah</span><span>{percent}%</span></div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-medium text-slate-500">Jumlah direkodkan</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{attemptedCount}</dd></div>
              <div className="rounded-xl bg-emerald-50 p-3"><dt className="text-xs font-medium text-emerald-700">Rakaman sah</dt><dd className="mt-1 text-2xl font-bold text-emerald-800">{validCount}</dd></div>
              <div className="rounded-xl bg-amber-50 p-3"><dt className="text-xs font-medium text-amber-700">Tidak dikira</dt><dd className="mt-1 text-2xl font-bold text-amber-800">{uncreditedCount}</dd></div>
            </dl>
            <div className={`mt-4 rounded-xl p-3 text-sm font-semibold ${remainingCount === 0 ? "bg-emerald-100 text-emerald-900" : "bg-blue-50 text-blue-900"}`}>
              {remainingCount === 0 ? `Sasaran ${item.required_recording_count} rakaman sah telah lengkap.` : `Anda memerlukan ${remainingCount} lagi rakaman sah.`}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Rakaman sah mestilah menggunakan rujukan kursus ini, dibuat dalam tempoh latihan, tidak berulang, mempunyai fail audio dan berdurasi sekurang-kurangnya 80% audio rujukan{item.minimum_recording_duration_seconds ? ` (${Math.ceil(item.minimum_recording_duration_seconds)} saat)` : ""}.</p>
            <div className={`mt-4 rounded-xl border p-3 ${expired ? "border-red-200 bg-red-50 text-red-900" : urgent ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
              <p className="text-xs font-bold uppercase tracking-wide">Tempoh Penilaian Qari</p>
              {expired ? <><p className="mt-1 font-bold">Tempoh 30 hari telah tamat</p><p className="mt-1 text-xs">Anda masih boleh berlatih dan melihat skor AI, tetapi rakaman baharu tidak boleh dihantar kepada Qari.</p></> : <><p className="mt-1 text-lg font-black tabular-nums">{daysLeft} hari {hoursLeft} jam {minutesLeft} minit</p><p className="mt-1 text-xs">Tamat {new Date(item.deadline).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}. Sila pilih satu rakaman terbaik sebelum tempoh tamat.</p></>}
            </div>
          </article>;
        })}
      </div>
    </section>

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Kelayakan Kompetensi</h2>
      <p className="mb-3 text-sm text-slate-600">Pilih satu rakaman terbaik untuk semakan Qari. Penilaian pertama termasuk dalam kursus; penilaian semula sukarela bagi rakaman dengan skor lebih tinggi ialah RM10.</p>
      <div className="space-y-3">
        {eligibility.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Belum ada rakaman dengan skor 75 ke atas.</p>}
        {eligibility.map((item) => {
          const reassessment = item.submission_action === "reassessment";
          const isBusy = payingSessionId === item.session_id;
          const actionLabel = reassessment
            ? (item.payment_status === "payment_pending" ? "Sambung bayaran RM10" : "Penilaian Semula RM10")
            : item.payment_required ? (item.payment_status === "payment_pending" ? "Sambung bayaran RM10" : "Bayar RM10 & hantar")
              : "Pilih rakaman ini";
          return <article key={item.session_id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-bold">{item.reference_title}{item.maqam ? ` • ${item.maqam}` : ""}</h3>
              <p className="text-sm text-slate-600">Skor latihan AI {Number(item.score).toFixed(1)}% • {item.application_status ? `Status: ${item.application_status}` : item.can_submit ? (reassessment ? "Layak untuk penilaian semula" : "Layak dipilih untuk semakan Qari") : item.blocked_reason}</p>
              {item.course_title && <p className="mt-1 text-xs text-slate-500">Kursus: {item.course_title}{item.assessment_attempt ? ` • Percubaan ${item.assessment_attempt}` : ""}</p>}
              {reassessment && !item.application_id && <p className="mt-1 text-xs font-semibold text-amber-700">Bayaran RM10 hanya dihantar kepada Qari selepas disahkan.</p>}
            </div>
            {!item.application_id && item.certificate_type && <button disabled={!item.can_submit || isBusy || item.payment_status === "application_created" || item.payment_status === "paid"} onClick={async () => {
              setPayingSessionId(item.session_id); setError("");
              try {
                if (reassessment && item.course_id) {
                  const result = await createCourseReassessmentCheckout(item.session_id, item.certificate_type, item.course_id);
                  if (result.checkout_url) window.location.assign(result.checkout_url); else setEligibility(await getCompetencyEligibility());
                } else if (item.payment_required) {
                  const result = await createPrivateAssessmentCheckout(item.session_id, item.certificate_type);
                  if (result.checkout_url) window.location.assign(result.checkout_url); else setEligibility(await getCompetencyEligibility());
                } else if (item.course_id) {
                  await submitCompetencyApplication(item.session_id, item.certificate_type, item.course_id);
                  setEligibility(await getCompetencyEligibility());
                }
              } catch (err: any) { setError(err.message || "Permohonan tidak dapat dihantar."); setPayingSessionId(null); }
            }} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">{isBusy ? "Memproses…" : actionLabel}</button>}
          </article>;
        })}
      </div>
    </section>

    <section>
      <h2 className="mb-3 text-xl font-bold text-slate-900">Sijil Rasmi</h2>
      {profileIncomplete && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950" role="status">
        <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 flex-none" /><div>
          <p className="font-bold">Lengkapkan profil untuk melihat dan memuat turun sijil</p>
          <p className="mt-1 text-sm">Maklumat belum lengkap: {missingProfileFields.join(", ")}.</p>
          <p className="mt-1 text-sm">Sijil yang telah dijana akan tersedia selepas maklumat ini disimpan.</p>
          <Link to="/profile" className="mt-3 inline-flex rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-950">Lengkapkan Profil</Link>
        </div></div>
      </div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!profileIncomplete && certificates.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-500">Belum ada sijil untuk dimuat turun.</p>}
        {!profileIncomplete && certificates.map((certificate) => <article key={certificate.id} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <Award className="h-9 w-9 text-amber-500" />
          <h3 className="mt-3 font-bold text-slate-900">{labels[certificate.certificate_type]}</h3>
          {certificate.certificate_type === "competency_azan" && <p className="mt-1 text-sm font-semibold text-emerald-800">Termasuk transkrip penilaian Qari</p>}
          <p className="mt-1 font-mono text-xs text-slate-500">{certificate.certificate_number}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> Status: {certificate.status}</p>
          <button onClick={() => downloadCertificate(certificate.id, certificate.certificate_number).catch((err) => setError(err.message))} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800"><Download size={17} /> {certificate.certificate_type === "competency_azan" ? "Muat turun Sijil + Transkrip" : "Muat turun PDF"}</button>
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
