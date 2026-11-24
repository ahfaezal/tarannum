import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Clock3, MapPin, Mic2, Phone, ShieldCheck, Sparkles, Users } from "lucide-react";

const CAMPAIGN_SLUG = "kursus-profesional-azan-putrajaya-disember-2026";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATES: Record<string, string[]> = {
  Johor: ["Johor Bahru", "Batu Pahat", "Kluang", "Muar", "Segamat"],
  Kedah: ["Alor Setar", "Baling", "Kuala Muda", "Kulim"],
  Kelantan: ["Kota Bharu", "Bachok", "Pasir Mas", "Tumpat"],
  Melaka: ["Melaka Tengah", "Alor Gajah", "Jasin"],
  "Negeri Sembilan": ["Seremban", "Port Dickson", "Kuala Pilah"],
  Pahang: ["Kuantan", "Bentong", "Temerloh"],
  "Pulau Pinang": ["Timur Laut", "Seberang Perai"],
  Perak: ["Kinta", "Manjung", "Kuala Kangsar"],
  Perlis: ["Kangar"],
  Sabah: ["Kota Kinabalu", "Sandakan", "Tawau"],
  Sarawak: ["Kuching", "Miri", "Sibu"],
  Selangor: ["Petaling", "Gombak", "Klang", "Sepang"],
  Terengganu: ["Kuala Terengganu", "Besut", "Kemaman"],
  "W.P. Kuala Lumpur": ["Kuala Lumpur"],
  "W.P. Labuan": ["Labuan"],
  "W.P. Putrajaya": ["Putrajaya"],
};

const agenda = [
  ["8:00 – 8:30 pagi", "Pendaftaran peserta", "Pengesahan kehadiran dan persediaan akses sistem."],
  ["8:30 – 9:00 pagi", "Pengenalan Tarannum.ai", "Fungsi latihan, graf nada dan indikator penilaian AI."],
  ["9:00 – 10:00 pagi", "Tatacara dan teknik laungan azan", "Lafaz, tajwid, pernafasan, kawalan suara serta pengenalan Hijjaz."],
  ["10:00 – 12:30 tengah hari", "Latihan amali azan — Sesi 1", "Demonstrasi pengajar, rakaman awal dan latihan mengikut graf nada."],
  ["12:30 – 2:00 petang", "Rehat, solat Zuhur dan makan tengah hari", ""],
  ["2:00 – 4:00 petang", "Latihan amali azan — Sesi 2", "Pemantapan Hijjaz, analisis skor, bimbingan dan rakaman akhir."],
  ["4:00 petang", "Bersurai", ""],
];

const fieldClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

type Campaign = { available_count: number; is_full: boolean; price: number };
type PaymentStatus = { paid: boolean; account_linked: boolean; email: string; full_name: string; status: string };

const ProfessionalAzanPutrajayaCoursePage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const isPaymentReturn = location.pathname.endsWith("/pembayaran");
  const registrationToken = searchParams.get("registration") || "";
  const districts = useMemo(() => STATES[state] || [], [state]);

  useEffect(() => {
    document.title = "Kursus Profesional Azan Putrajaya | Tarannum.ai";
    fetch(`${API_URL}/api/promotions/${CAMPAIGN_SLUG}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setCampaign(data))
      .catch(() => setMessage("Maklumat pendaftaran belum dapat dimuatkan. Sila cuba semula."));
  }, []);

  useEffect(() => {
    if (!isPaymentReturn || !registrationToken) return;
    let cancelled = false;
    const checkStatus = async () => {
      setChecking(true);
      try {
        const response = await fetch(`${API_URL}/api/promotions/${CAMPAIGN_SLUG}/registrations/${encodeURIComponent(registrationToken)}`);
        if (!response.ok) throw new Error("Status pembayaran belum dapat disemak.");
        const data = await response.json();
        if (!cancelled) setPaymentStatus(data);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Status pembayaran belum dapat disemak.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    void checkStatus();
    return () => { cancelled = true; };
  }, [isPaymentReturn, registrationToken, refresh]);

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/promotions/${CAMPAIGN_SLUG}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Pendaftaran belum dapat diproses.");
      if (payload.already_paid && payload.registration_token) {
        window.location.assign(`/kursus-profesional-azan-putrajaya/pembayaran?registration=${encodeURIComponent(payload.registration_token)}`);
        return;
      }
      if (payload.checkout_url) {
        window.location.assign(payload.checkout_url);
        return;
      }
      setMessage("Pendaftaran anda telah direkodkan. Pautan pembayaran akan dihantar oleh penganjur.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pendaftaran belum dapat diproses.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isPaymentReturn) {
    const paid = paymentStatus?.paid;
    return <section className="min-h-[72vh] bg-[#f7f4ec] px-5 py-20"><div className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl sm:p-12">
      <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{paid ? <Check className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}</div>
      <p className="mt-6 text-sm font-black uppercase tracking-[.2em] text-emerald-700">Kursus Profesional Azan Putrajaya</p>
      <h1 className="mt-3 text-3xl font-black">{paid ? "Pembayaran berjaya. Tempat anda disahkan." : paymentStatus?.status === "payment_failed" ? "Pembayaran belum berjaya." : "Pembayaran sedang disahkan."}</h1>
      <p className="mt-5 leading-7 text-stone-600">{paid ? "Sila buka atau hubungkan akaun Tarannum.ai untuk menerima akses latihan selepas kursus." : "Jangan buat bayaran kedua sebelum menyemak status transaksi ini."}</p>
      {paid && !paymentStatus?.account_linked && <Link to={`/register?course_registration=${encodeURIComponent(registrationToken)}&email=${encodeURIComponent(paymentStatus?.email || "")}&name=${encodeURIComponent(paymentStatus?.full_name || "")}`} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Buka akaun Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
      {paid && paymentStatus?.account_linked && <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Log masuk Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
      {!paid && <div className="mt-7 flex flex-wrap justify-center gap-3"><button type="button" disabled={checking} onClick={() => setRefresh(value => value + 1)} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60">{checking ? "Menyemak…" : "Semak status semula"}</button><a href="https://wa.me/60192504000" className="rounded-xl border border-stone-300 px-5 py-3 font-bold text-emerald-800">Bantuan WhatsApp</a></div>}
      {message && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p>}
    </div></section>;
  }

  return <div className="bg-[#f7f4ec] text-stone-900">
    <section className="relative isolate overflow-hidden bg-[#073f32] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_15%,rgba(225,174,66,.28),transparent_28%),radial-gradient(circle_at_15%_90%,rgba(39,161,118,.25),transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-amber-200/40 bg-amber-200/10 px-4 py-2 text-sm font-bold text-amber-100"><Sparkles className="h-4 w-4" /> Kursus sehari · Tempat terhad</p>
        <p className="mt-8 text-sm font-black uppercase tracking-[.18em] text-emerald-100">Masjid Tuanku Mizan Zainal Abidin · Putrajaya</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">Kursus Profesional Azan</h1>
        <p className="mt-4 text-xl font-semibold text-amber-200 sm:text-3xl">Menggunakan Sistem Tarannum.ai</p>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-emerald-50/90">Pelajari tatacara, teknik laungan dan alunan Maqam Hijjaz melalui bimbingan langsung serta latihan amali berpandukan sistem Tarannum.ai.</p>
        <div className="mt-9 flex flex-wrap gap-3"><a href="#daftar" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-black text-emerald-950 shadow-lg transition hover:bg-amber-300">Daftar sekarang <ArrowRight className="h-5 w-5" /></a><a href="https://wa.me/60192504000" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3.5 font-bold text-white"><Phone className="h-5 w-5" /> Pertanyaan</a></div>
      </div>
    </section>

    <section className="mx-auto -mt-1 max-w-7xl px-5 py-8 sm:px-8"><div className="grid overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5 sm:grid-cols-2 lg:grid-cols-4">
      {[[CalendarDays, "20 Disember 2026", "Ahad"], [Clock3, "8:30 pagi – 4:00 petang", "Pendaftaran bermula 8:00 pagi"], [MapPin, "Masjid Tuanku Mizan", "Zainal Abidin, Putrajaya"], [Users, "Pengajar", "Sheikh Abdul Karim Omar Al-Fatani Al-Makki"]].map(([Icon, title, detail], index) => <div key={String(title)} className={`p-6 ${index ? "border-t sm:border-l sm:border-t-0" : ""} border-stone-200`}>{React.createElement(Icon as React.ElementType, { className: "h-6 w-6 text-emerald-700" })}<p className="mt-3 font-black">{String(title)}</p><p className="mt-1 text-sm text-stone-500">{String(detail)}</p></div>)}
    </div></section>

    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><div className="grid gap-6 lg:grid-cols-3"><article className="rounded-3xl bg-emerald-950 p-8 text-white lg:col-span-2"><p className="text-sm font-black uppercase tracking-[.18em] text-amber-300">Apa yang peserta peroleh</p><h2 className="mt-3 text-3xl font-black">Bimbingan, latihan amali dan hala tuju latihan kendiri.</h2><div className="mt-7 grid gap-4 sm:grid-cols-2">{[[Mic2, "Latihan amali", "Rakam, semak dan ulang laungan azan secara berstruktur."], [ShieldCheck, "Panduan sistem", "Pemerhatian graf nada dan maklum balas AI melengkapi bimbingan pengajar."], [Check, "Makan disediakan", "Makanan pagi dan tengah hari disediakan sepanjang kursus."], [Sparkles, "Akses susulan", "Akses latihan Tarannum.ai selama 30 hari selepas kursus."]].map(([Icon, title, detail]) => <div key={String(title)} className="rounded-2xl bg-white/10 p-5"><>{React.createElement(Icon as React.ElementType, { className: "h-6 w-6 text-amber-300" })}</><p className="mt-3 font-bold">{String(title)}</p><p className="mt-1 text-sm leading-6 text-emerald-50/75">{String(detail)}</p></div>)}</div></article>
      <aside className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-8"><p className="text-sm font-black uppercase tracking-[.18em] text-emerald-800">Yuran pendaftaran</p><p className="mt-5 text-5xl font-black text-emerald-950">RM200</p><p className="mt-5 border-t border-amber-200 pt-5 text-sm leading-6 text-stone-700">Peserta yang menerima <b>Voucher Number</b> sah akan menikmati harga khas <b className="text-emerald-800">RM120</b>. Harga disahkan oleh sistem sebelum anda dibawa ke ToyyibPay.</p><a href="#daftar" className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Isi borang pendaftaran</a></aside>
    </div></section>

    <section className="border-y border-emerald-100 bg-gradient-to-b from-emerald-50 to-[#f7f4ec] py-16"><div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[.88fr_1.12fr]">
      <figure className="mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border-4 border-amber-200 bg-emerald-950 shadow-2xl shadow-emerald-950/20"><img src="/images/kursus-profesional-azan-putrajaya-poster.webp" alt="Poster Kursus Profesional Azan menggunakan Sistem Tarannum.ai di Masjid Tuanku Mizan Zainal Abidin, Putrajaya" width="1086" height="1448" loading="lazy" className="h-auto w-full" /></figure>
      <div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Pengalaman kursus yang lengkap</p><h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-emerald-950 sm:text-4xl">Bukan sekadar mendengar — peserta terus berlatih dan melihat kemajuan sendiri.</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">Kursus ini menggabungkan bimbingan Sheikh Abdul Karim Omar Al-Fatani Al-Makki dengan latihan praktikal menggunakan sistem Tarannum.ai. Peserta mempelajari susunan lafaz, teknik suara dan alunan Maqam Hijjaz, kemudian mengamalkannya secara langsung dalam sesi yang sama.</p><div className="mt-8 grid gap-4 sm:grid-cols-3">{[["01", "Belajar", "Fahami asas laungan, tajwid, pernafasan dan alunan Hijjaz."], ["02", "Amali", "Rakam laungan dan semak graf nada bersama bimbingan pengajar."], ["03", "Teruskan", "Sambung latihan kendiri dengan akses Tarannum.ai selama 30 hari."]].map(([number, title, detail]) => <div key={number} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><p className="text-sm font-black text-amber-600">{number}</p><p className="mt-2 font-black text-emerald-950">{title}</p><p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p></div>)}</div><a href="#daftar" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800">Tempah tempat anda <ArrowRight className="h-5 w-5" /></a></div>
    </div></section>

    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="grid items-center gap-10 overflow-hidden rounded-[2rem] border border-emerald-100 bg-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-10 lg:grid-cols-[1.15fr_.85fr]"><div><p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">Sedia untuk terus berlatih</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Peralatan disediakan supaya fokus peserta kekal pada latihan.</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-emerald-50/85">Setiap peserta menggunakan iPad dan headset semasa sesi amali. Selepas kursus, akses Tarannum.ai selama 30 hari membantu peserta mengulang latihan dengan lebih yakin dan konsisten.</p><ul className="mt-7 grid gap-3 text-sm font-semibold text-emerald-50 sm:grid-cols-3"><li className="rounded-xl bg-white/10 px-4 py-3">iPad untuk latihan amali</li><li className="rounded-xl bg-white/10 px-4 py-3">Headset untuk rakaman jelas</li><li className="rounded-xl bg-white/10 px-4 py-3">Akses latihan 30 hari</li></ul></div><figure className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-emerald-900 shadow-2xl"><img src="/images/kursus-profesional-azan-putrajaya-peralatan.webp" alt="Peralatan kursus yang disediakan: iPad, headset dan akses Tarannum.ai selama 30 hari" width="1199" height="1312" loading="lazy" className="h-auto w-full" /></figure></div></section>

    <section className="bg-[#0c4c3d] py-16 text-white"><div className="mx-auto max-w-5xl px-5 sm:px-8"><p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">Jadual kursus</p><h2 className="mt-3 text-3xl font-black">Satu hari yang padat untuk membina kemahiran.</h2><div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/15 bg-white/5">{agenda.map(([time, title, detail]) => <div key={time} className="grid gap-2 p-5 sm:grid-cols-[185px_1fr] sm:items-start"><p className="font-black text-amber-300">{time}</p><div><p className="font-bold">{title}</p>{detail && <p className="mt-1 text-sm leading-6 text-emerald-50/70">{detail}</p>}</div></div>)}</div></div></section>

    <section id="daftar" className="scroll-mt-24 py-16"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Pendaftaran dan pembayaran</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Sahkan tempat anda.</h2><p className="mt-5 leading-8 text-stone-600">Isi maklumat di sebelah. Tempat disahkan selepas pembayaran berjaya melalui ToyyibPay. Jika anda mempunyai Voucher Number, masukkannya sebelum meneruskan pembayaran.</p><div className="mt-8 rounded-2xl bg-emerald-950 p-6 text-emerald-50"><p className="font-black text-amber-300">Kerjasama</p><p className="mt-3 text-sm leading-6">Masjid Tuanku Mizan Zainal Abidin, Pertubuhan Penggerak Dakwah Putrajaya @ Geng Surau Putrajaya (GSP), dan Tarannum Technologies.</p></div></div>
      <form onSubmit={submitRegistration} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-bold">Nama penuh<input className={fieldClass} name="full_name" required autoComplete="name" /></label><label className="text-sm font-bold">Nombor WhatsApp<input className={fieldClass} name="phone" required autoComplete="tel" inputMode="tel" placeholder="01X-XXXXXXX" /></label><label className="text-sm font-bold">Alamat e-mel<input className={fieldClass} name="email" required type="email" autoComplete="email" /></label><label className="sm:col-span-2 text-sm font-bold">Voucher Number <span className="font-normal text-stone-500">(jika ada)</span><input className={fieldClass} name="voucher_number" maxLength={64} autoCapitalize="characters" placeholder="Masukkan Voucher Number" /><span className="mt-2 block text-xs font-normal leading-5 text-stone-500">Voucher yang sah menukar yuran kepada RM120. Jangan masukkan kod jika anda tidak menerimanya daripada penganjur.</span></label><details className="sm:col-span-2 rounded-xl border border-stone-200 p-4 text-sm"><summary className="cursor-pointer font-bold text-emerald-800">Maklumat tambahan (pilihan)</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-bold">Negeri<select className={fieldClass} name="state" value={state} onChange={event => { setState(event.target.value); setDistrict(""); }}><option value="">Pilih negeri</option>{Object.keys(STATES).map(item => <option key={item}>{item}</option>)}</select></label><label className="font-bold">Daerah<select className={fieldClass} name="district" value={district} disabled={!state} onChange={event => setDistrict(event.target.value)}><option value="">Pilih daerah</option>{districts.map(item => <option key={item}>{item}</option>)}</select></label><label className="sm:col-span-2 font-bold">Masjid, surau atau organisasi<input className={fieldClass} name="organization" /></label></div></details></div><label className="mt-6 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="registration_consent" value="true" required className="mt-1 h-4 w-4 accent-emerald-700" />Saya bersetuju maklumat ini digunakan untuk mengurus pendaftaran, pembayaran dan komunikasi kursus ini.</label><label className="mt-3 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="marketing_consent" value="true" className="mt-1 h-4 w-4 accent-emerald-700" />Saya bersetuju menerima maklumat kursus Tarannum Technologies pada masa akan datang.</label><button disabled={submitting || campaign?.is_full} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">{submitting ? "Memproses…" : campaign?.is_full ? "Pendaftaran telah penuh" : "Teruskan ke Pembayaran"}<ArrowRight className="h-5 w-5" /></button>{message && <p role="status" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p>}<p className="mt-4 text-center text-xs leading-5 text-stone-400">Pembayaran selamat melalui ToyyibPay. Harga akhir ditentukan pada pelayan Tarannum.ai.</p></form>
    </div></section>

    <section className="border-t border-stone-200 bg-white py-12"><div className="mx-auto grid max-w-7xl gap-5 px-5 sm:px-8 md:grid-cols-2"><div><h2 className="text-2xl font-black">Perlu bantuan?</h2><p className="mt-2 text-stone-600">Ust. Faezal Husni: <a className="font-bold text-emerald-700" href="https://wa.me/60192504000">019-250 4000</a><br />Mohd Faizal: <a className="font-bold text-emerald-700" href="https://wa.me/60173638483">017-363 8483</a></p></div><div className="md:text-right"><h2 className="text-2xl font-black">Lokasi kursus</h2><a className="mt-2 inline-flex items-center gap-2 font-bold text-emerald-700 underline" href="https://maps.google.com/?q=Masjid+Tuanku+Mizan+Zainal+Abidin+Putrajaya" target="_blank" rel="noreferrer"><MapPin className="h-5 w-5" /> Dapatkan arah ke masjid</a></div></div></section>
  </div>;
};

export default ProfessionalAzanPutrajayaCoursePage;
