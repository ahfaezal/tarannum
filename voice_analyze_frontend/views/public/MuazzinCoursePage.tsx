import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Mic2,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";

const DISTRICTS: Record<string, string[]> = {
  Johor: ["Batu Pahat", "Johor Bahru", "Kluang", "Kota Tinggi", "Kulai", "Mersing", "Muar", "Pontian", "Segamat", "Tangkak"],
  Kedah: ["Baling", "Bandar Baharu", "Kota Setar", "Kuala Muda", "Kubang Pasu", "Kulim", "Langkawi", "Padang Terap", "Pendang", "Pokok Sena", "Sik", "Yan"],
  Kelantan: ["Bachok", "Gua Musang", "Jeli", "Kota Bharu", "Kuala Krai", "Machang", "Pasir Mas", "Pasir Puteh", "Tanah Merah", "Tumpat"],
  Melaka: ["Alor Gajah", "Jasin", "Melaka Tengah"],
  "Negeri Sembilan": ["Jelebu", "Jempol", "Kuala Pilah", "Port Dickson", "Rembau", "Seremban", "Tampin"],
  Pahang: ["Bentong", "Bera", "Cameron Highlands", "Jerantut", "Kuantan", "Lipis", "Maran", "Pekan", "Raub", "Rompin", "Temerloh"],
  "Pulau Pinang": ["Barat Daya", "Seberang Perai Selatan", "Seberang Perai Tengah", "Seberang Perai Utara", "Timur Laut"],
  Perak: ["Bagan Datuk", "Batang Padang", "Hilir Perak", "Hulu Perak", "Kampar", "Kerian", "Kinta", "Kuala Kangsar", "Larut Matang dan Selama", "Manjung", "Muallim", "Perak Tengah"],
  Perlis: ["Perlis"],
  Sabah: ["Beaufort", "Beluran", "Keningau", "Kinabatangan", "Kota Belud", "Kota Kinabalu", "Kota Marudu", "Kuala Penyu", "Kudat", "Kunak", "Lahad Datu", "Nabawan", "Papar", "Penampang", "Pitas", "Putatan", "Ranau", "Sandakan", "Semporna", "Sipitang", "Tambunan", "Tawau", "Tenom", "Tongod", "Tuaran"],
  Sarawak: ["Asajaya", "Bau", "Belaga", "Betong", "Bintulu", "Dalat", "Daro", "Julau", "Kanowit", "Kapit", "Kuching", "Lawas", "Limbang", "Lubok Antu", "Lundu", "Marudi", "Matu", "Meradong", "Miri", "Mukah", "Pakan", "Samarahan", "Saratok", "Sarikei", "Selangau", "Serian", "Sibu", "Simunjan", "Song", "Sri Aman", "Tatau"],
  Selangor: ["Gombak", "Hulu Langat", "Hulu Selangor", "Klang", "Kuala Langat", "Kuala Selangor", "Petaling", "Sabak Bernam", "Sepang"],
  Terengganu: ["Besut", "Dungun", "Hulu Terengganu", "Kemaman", "Kuala Nerus", "Kuala Terengganu", "Marang", "Setiu"],
  "W.P. Kuala Lumpur": ["Kuala Lumpur"],
  "W.P. Labuan": ["Labuan"],
  "W.P. Putrajaya": ["Putrajaya"],
};

const agenda = [
  ["8:30 – 9:00", "Pendaftaran", "Pengesahan peserta dan akses sistem"],
  ["9:00 – 9:30", "Asas azan", "Adab, tujuan, teknik suara dan kesalahan lazim"],
  ["9:30 – 10:00", "Pengenalan Maqam Hijjaz", "Demonstrasi penceramah dan latihan frasa"],
  ["10:00 – 11:00", "Latihan bersama Qari", "Bimbingan langsung dan latih tubi"],
  ["11:00 – 12:30", "Latihan Tarannum.ai", "Rakaman, semakan skor dan pengulangan"],
  ["12:30 – 2:00", "Rehat", "Makan tengah hari dan solat berjemaah"],
  ["2:00 – 4:00", "Latihan intensif", "Rakaman, semakan skor dan pengulangan"],
  ["4:00 – 4:30", "Pelan susulan", "Sasaran 60 minit, sijil dan komitmen peserta"],
];

const fieldClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

const MuazzinCoursePage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<{ available_count: number; is_full: boolean } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<{ paid: boolean; account_linked: boolean; email: string; full_name: string; status: string } | null>(null);
  const districts = useMemo(() => DISTRICTS[state] || [], [state]);
  const isPaymentReturn = location.pathname.endsWith("/pembayaran");
  const registrationToken = searchParams.get("registration") || "";

  useEffect(() => {
    document.title = "Kursus Pemantapan Muazzin | Tarannum.ai";
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    fetch(`${API_URL}/api/promotions/kursus-muazzin-hijjaz-2026`)
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setCampaign(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isPaymentReturn || !registrationToken) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    let cancelled = false;
    let attempts = 0;
    const readStatus = async () => {
      const response = await fetch(`${API_URL}/api/promotions/kursus-muazzin-hijjaz-2026/registrations/${encodeURIComponent(registrationToken)}`);
      if (!response.ok) throw new Error("Status pembayaran belum dapat disahkan.");
      const data = await response.json();
      if (!cancelled) setPaymentStatus(data);
      attempts += 1;
      if (!cancelled && !data.paid && attempts < 10) window.setTimeout(readStatus, 3000);
    };
    readStatus().catch(error => !cancelled && setMessage(error.message));
    return () => { cancelled = true; };
  }, [isPaymentReturn, registrationToken]);

  const submitInterest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const endpoint = campaign?.is_full ? "waitlist" : "registrations";
      const response = await fetch(`${API_URL}/api/promotions/kursus-muazzin-hijjaz-2026/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Pendaftaran belum dapat diproses.");
      if (payload.checkout_url) window.location.assign(payload.checkout_url);
      else setMessage("Minat anda telah direkodkan. Kami akan menghubungi anda apabila pembayaran dibuka.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pendaftaran belum dapat diproses.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isPaymentReturn) {
    const paid = paymentStatus?.paid;
    return <section className="min-h-[72vh] bg-[#f7f4ec] px-5 py-20">
      <div className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl sm:p-12">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {paid ? <Check className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[.2em] text-emerald-700">Kursus Pemantapan Muazzin</p>
        <h1 className="mt-3 text-3xl font-black">{paid ? "Pembayaran berjaya. Tempat anda disahkan." : "Pembayaran sedang disahkan."}</h1>
        <p className="mt-5 leading-7 text-stone-600">{paid ? "Langkah terakhir ialah membuka atau menghubungkan akaun Tarannum.ai untuk akses latihan 30 hari dan persijilan." : "Halaman ini akan dikemas kini secara automatik selepas ToyyibPay mengesahkan transaksi anda."}</p>
        {paid && !paymentStatus?.account_linked && <Link to={`/register?course_registration=${encodeURIComponent(registrationToken)}&email=${encodeURIComponent(paymentStatus?.email || "")}&name=${encodeURIComponent(paymentStatus?.full_name || "")}`} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Buka akaun Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
        {paid && paymentStatus?.account_linked && <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Log masuk Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
        {message && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p>}
      </div>
    </section>;
  }

  return (
    <div className="bg-[#f7f4ec] text-stone-900">
      <section className="relative isolate overflow-hidden bg-[#073f32] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(212,168,73,.24),transparent_30%),linear-gradient(135deg,transparent_0%,rgba(255,255,255,.04)_55%,transparent_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
          <div>
            <div className="mb-8 flex flex-wrap items-center gap-4">
              <img src="/images/logo.png" alt="Logo Tarannum Technologies" className="h-16 w-16 rounded-full object-cover ring-2 ring-amber-300/50" />
              <span className="text-2xl font-light text-amber-200">×</span>
              <div className="rounded-xl bg-white px-3 py-2"><img src="/images/logobsp.png" alt="Logo Masjid Bandar Seri Putra" className="h-11 w-auto" /></div>
            </div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[.16em] text-emerald-100/80">Program kerjasama antara Tarannum Technologies dan Masjid Bandar Seri Putra</p>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100"><Sparkles className="h-4 w-4" /> 20 peserta sahaja</p>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Kursus Pemantapan Muazzin</h1>
            <p className="mt-4 max-w-2xl text-xl font-semibold text-amber-200 sm:text-2xl">Azan dalam Maqam Hijjaz, diperkukuh dengan latihan Tarannum.ai</p>
            <p className="mt-5 inline-flex max-w-2xl rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-amber-100 sm:text-base">Kursus Pemantapan Muazzin menggunakan Sistem Tarannum.ai yang pertama di Malaysia</p>
            <p className="mt-6 max-w-2xl text-base leading-8 text-emerald-50/85 sm:text-lg">Belajar bersama Qari, rakam suara anda, semak perkembangan dan teruskan latihan selama 30 hari selepas kursus.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#daftar" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-black text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300">Daftar RM100 <ArrowRight className="h-5 w-5" /></a>
              <a href="https://wa.me/60192504000" className="rounded-xl border border-white/30 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">Tanya melalui WhatsApp</a>
            </div>
            <p className="mt-4 text-sm text-emerald-100/70">Harga biasa <span className="line-through">RM250</span> · Promosi untuk 20 pembayaran pertama</p>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-amber-300/10 blur-2xl" />
            <img src="/images/ustdzikri2.png" alt="Ustaz Dzikri memperdengarkan azan" className="relative aspect-[4/4.6] w-full rounded-[2rem] object-cover object-top shadow-2xl ring-1 ring-white/15" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/20 bg-emerald-950/85 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-amber-200">PENCERAMAH & QARI</p>
              <p className="mt-1 text-xl font-black">Ustaz Dzikri bin Mohd Nor</p>
              <p className="mt-1 text-sm text-emerald-100/75">Bilal Masjid Bandar Seri Putra · Jurulatih Akademi Muazzin Malaysia</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-1 max-w-7xl px-5 py-8 sm:px-8">
        <div className="grid overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [CalendarDays, "19 September 2026", "Sabtu"],
            [Clock3, "8:30 pagi – 4:30 petang", "Kursus sehari"],
            [MapPin, "Masjid Bandar Seri Putra", "Bangi, Selangor"],
            [Utensils, "Makanan disediakan", "Pagi dan tengah hari"],
          ].map(([Icon, title, text], index) => (
            <div key={String(title)} className={`p-6 ${index ? "border-t sm:border-l sm:border-t-0" : ""} border-stone-200`}>
              {React.createElement(Icon as React.ElementType, { className: "h-6 w-6 text-emerald-700" })}
              <p className="mt-3 font-black">{String(title)}</p><p className="mt-1 text-sm text-stone-500">{String(text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Latihan yang berterusan</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Kursus tidak berakhir apabila anda pulang.</h2><p className="mt-5 leading-8 text-stone-600">Setiap peserta menerima ruang latihan digital selama 30 hari untuk merakam, menyemak skor dan mengulang latihan sehingga mencapai sasaran.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Mic2, "Latihan 60 minit", "Sistem mengira bilangan rakaman berdasarkan tempoh standard azan."],
              [Sparkles, "Maklum balas tersusun", "Lihat skor dan perkembangan setiap percubaan dalam Tarannum.ai."],
              [Award, "Dua laluan sijil", "Pengiktirafan penyertaan dan kompetensi dipisahkan dengan jelas."],
              [ShieldCheck, "Pengesahan Qari", "Skor 75 membuka semakan; keputusan kompetensi kekal pada Qari."],
            ].map(([Icon, title, text]) => <article key={String(title)} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">{React.createElement(Icon as React.ElementType, { className: "h-7 w-7 text-amber-600" })}<h3 className="mt-4 text-lg font-black">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-stone-600">{String(text)}</p></article>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="training-preview-title" className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Contoh pengalaman latihan</p>
            <h2 id="training-preview-title" className="mt-3 text-3xl font-black sm:text-4xl">Lihat paparan latihan azan dalam Tarannum.ai.</h2>
            <p id="training-preview-description" className="mt-5 leading-8 text-stone-600">Tonton rakaman skrin contoh latihan azan untuk mengenali ruang latihan yang akan digunakan. Dalam kursus ini, latihan digital melengkapi demonstrasi dan bimbingan Ustaz Dzikri — membantu peserta meneruskan latihan secara lebih tersusun selepas sesi bersemuka.</p>
          </div>
          <figure className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-stone-50">
            <video controls playsInline preload="none" aria-label="Video contoh paparan latihan azan Tarannum.ai" aria-describedby="training-preview-description" className="mx-auto max-h-[70vh] w-full bg-black">
              <source src="/images/muazzin-training-screen.mp4" type="video/mp4" />
              Pelayar anda tidak menyokong video ini. <a href="/images/muazzin-training-screen.mp4">Buka video latihan azan</a>.
            </video>
            <figcaption className="px-5 py-4 text-sm leading-6 text-stone-600">Contoh paparan latihan azan. Tekan butang main untuk menonton; video tidak dimainkan secara automatik. <a href="/images/muazzin-training-screen.mp4" target="_blank" rel="noreferrer" className="font-bold text-emerald-700 underline">Buka video dalam tab baharu</a>.</figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="platform-preview-title" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
        <figure>
          <a href="/images/tarannum-home-preview.png" target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700" aria-label="Lihat gambar muka depan Tarannum.ai dalam saiz penuh">
            <img src="/images/tarannum-home-preview.png" alt="Muka depan Tarannum.ai dengan aliran dengar, berlatih, rakam dan perbaiki bacaan" width={1337} height={1066} loading="lazy" decoding="async" className="h-auto w-full" />
          </a>
          <figcaption className="mt-3 text-sm text-stone-500">Paparan muka depan Tarannum.ai. Tekan gambar untuk melihat saiz penuh.</figcaption>
        </figure>
        <div>
          <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Kenali Tarannum.ai</p>
          <h2 id="platform-preview-title" className="mt-3 text-3xl font-black sm:text-4xl">Dengar. Berlatih. Rakam. Perbaiki.</h2>
          <p className="mt-5 leading-8 text-stone-600">Tarannum.ai menyokong latihan berpandukan bacaan rujukan, visualisasi melodi dan rakaman kendiri. Peserta boleh mendengar contoh, mengikuti alunan pada kadar sendiri dan merakam apabila bersedia untuk menyemak latihan.</p>
          <p className="mt-4 leading-8 text-stone-600">Teknologi membantu proses latihan, bukan menggantikan guru. Ketepatan bacaan dan penilaian kompetensi tetap memerlukan bimbingan serta semakan qari.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 font-bold text-emerald-700 underline">Kenali platform Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="text-center text-sm font-black uppercase tracking-[.2em] text-emerald-700">Persijilan Tarannum.ai</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-black sm:text-4xl">Usaha diiktiraf. Kompetensi disahkan manusia.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article className="rounded-3xl bg-emerald-950 p-8 text-white"><p className="text-sm font-bold text-amber-300">SIJIL KEHADIRAN & PENYERTAAN</p><h3 className="mt-4 text-2xl font-black">Hadir kursus + lengkap 60 minit rakaman sah</h3><ul className="mt-6 space-y-3 text-emerald-50/80">{["Latihan boleh disambung di rumah", "Dijana secara automatik", "Nombor unik dan QR pengesahan"].map(x=><li key={x} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 text-amber-300" />{x}</li>)}</ul></article>
            <article className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-8"><p className="text-sm font-bold text-emerald-800">SIJIL KOMPETENSI AZAN</p><h3 className="mt-4 text-2xl font-black">Skor ≥75 + rakaman diluluskan Qari</h3><ul className="mt-6 space-y-3 text-stone-700">{["Gred akhir ditentukan Qari", "Ditandatangani Qari dan CEO", "Skor sistem bukan keputusan muktamad"].map(x=><li key={x} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 text-emerald-700" />{x}</li>)}</ul></article>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
        <div className="grid grid-cols-2 gap-4"><img src="/images/ustdzikri-ikim.png" alt="Ustaz Dzikri dalam program IKIMfm" className="col-span-2 aspect-[16/8] w-full rounded-2xl object-cover"/><img src="/images/ustdzikri-muazzin.png" alt="Program pemantapan imam dan muazzin terdahulu" className="aspect-[4/3] w-full rounded-2xl object-cover"/><div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-emerald-900 p-6 text-center text-white"><div><Award className="mx-auto h-9 w-9 text-amber-300"/><p className="mt-3 font-black">Sanad Azan</p><p className="mt-1 text-sm text-emerald-100/70">Sejak 2018</p></div></div></div>
        <div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Profil penceramah</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Belajar daripada muazzin yang aktif melatih dan berkhidmat.</h2><p className="mt-5 leading-8 text-stone-600">Ustaz Dzikri bin Mohd Nor ialah Bilal Masjid Bandar Seri Putra sejak 2016 dan Guru/Jurulatih di Akademi Muazzin Malaysia. Beliau mengikuti Kursus Muazzin Profesional pada 2017, memperoleh Sanad Azan pada 2018 dan Sijil Akademi Muazzin Malaysia pada 2019.</p><p className="mt-4 leading-8 text-stone-600">Pengalaman beliau merangkumi latihan imam dan bilal, tilawah al-Quran serta pengurusan program masjid.</p></div>
      </section>

      <section className="bg-[#0c4c3d] py-16 text-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8"><p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">Tentatif program</p><h2 className="mt-3 text-3xl font-black">Satu hari yang disusun untuk terus menghasilkan amalan.</h2><div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/15 bg-white/5">{agenda.map(([time,title,text])=><div key={time} className="grid gap-2 p-5 sm:grid-cols-[130px_190px_1fr] sm:items-center"><p className="font-black text-amber-300">{time}</p><p className="font-bold">{title}</p><p className="text-sm text-emerald-50/70">{text}</p></div>)}</div></div>
      </section>

      <section id="daftar" className="scroll-mt-24 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Daftar minat & pembayaran</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Dapatkan harga promosi RM100.</h2>
            <p className="mt-5 leading-8 text-stone-600">{campaign?.is_full ? "Pengambilan ini telah penuh. Tinggalkan maklumat untuk mendapat keutamaan bagi kursus seterusnya." : "Isi maklumat ringkas. Tempat hanya disahkan selepas pembayaran berjaya. Akaun Tarannum.ai akan dibuka atau dihubungkan selepas pembayaran."}</p>
            <div className="mt-8 rounded-2xl bg-amber-100 p-6"><div className="flex items-center gap-3"><Users className="h-6 w-6 text-emerald-800"/><p className="font-black">{campaign?.is_full ? "Senarai menunggu dibuka" : `Terhad kepada 20 peserta berbayar${campaign ? ` · ${campaign.available_count} tempat tersedia` : ""}`}</p></div><p className="mt-2 text-sm text-stone-600">Apabila penuh, borang akan bertukar kepada senarai menunggu kursus seterusnya.</p></div>
          </div>
          <form onSubmit={submitInterest} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-bold">Nama penuh<input className={fieldClass} name="full_name" required autoComplete="name" /></label>
              <label className="text-sm font-bold">Nombor WhatsApp<input className={fieldClass} name="phone" required autoComplete="tel" inputMode="tel" placeholder="01X-XXXXXXX" /></label>
              <label className="text-sm font-bold">Alamat e-mel<input className={fieldClass} name="email" required type="email" autoComplete="email" /></label>
              <label className="text-sm font-bold">Negeri<select className={fieldClass} name="state" value={state} required onChange={e=>{setState(e.target.value);setDistrict("");}}><option value="">Pilih negeri</option>{Object.keys(DISTRICTS).map(item=><option key={item}>{item}</option>)}</select></label>
              <label className="text-sm font-bold">Daerah<select className={fieldClass} name="district" value={district} required disabled={!state} onChange={e=>setDistrict(e.target.value)}><option value="">Pilih daerah</option>{districts.map(item=><option key={item}>{item}</option>)}</select></label>
              <label className="sm:col-span-2 text-sm font-bold">Masjid, surau atau organisasi <span className="font-normal text-stone-400">(pilihan)</span><input className={fieldClass} name="organization" /></label>
              {campaign?.is_full && <label className="sm:col-span-2 text-sm font-bold">Pilihan kursus akan datang<select className={fieldClass} name="preferred_month" required><option value="">Pilih bulan</option><option>Oktober 2026</option><option>November 2026</option><option>Disember 2026</option></select></label>}
            </div>
            <label className="mt-6 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="registration_consent" value="true" required className="mt-1 h-4 w-4 accent-emerald-700"/>Saya bersetuju maklumat ini digunakan untuk mengurus pendaftaran, pembayaran dan komunikasi kursus ini, serta telah membaca polisi pembatalan di bawah.</label>
            <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="marketing_consent" value="true" className="mt-1 h-4 w-4 accent-emerald-700"/>Saya bersetuju menerima maklumat kursus Tarannum Technologies pada masa akan datang.</label>
            <button disabled={submitting} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">{submitting ? "Memproses…" : campaign?.is_full ? "Sertai Senarai Menunggu" : "Teruskan ke Pembayaran RM100"}<ArrowRight className="h-5 w-5" /></button>
            {message && <p role="status" className="mt-4 rounded-xl bg-stone-100 p-4 text-sm text-stone-700">{message}</p>}
            <p className="mt-4 text-center text-xs leading-5 text-stone-400">Pembayaran selamat melalui ToyyibPay. Caj transaksi ditanggung Tarannum Technologies.</p>
          </form>
        </div>
      </section>

      <section className="bg-stone-100 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 lg:grid-cols-2">
          <article className="rounded-3xl bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-black">Polisi pembatalan & pertukaran</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-600">
              <li><b>14 hari atau lebih:</b> bayaran balik penuh atau pindah ke sesi seterusnya.</li>
              <li><b>7–13 hari:</b> bayaran balik 50% atau pindah penuh ke sesi seterusnya.</li>
              <li><b>Kurang 7 hari:</b> tiada bayaran balik; penggantian nama dibenarkan sehingga 48 jam sebelum kursus.</li>
              <li>Jika program dibatalkan penganjur, peserta menerima bayaran balik penuh atau pilihan pindahan. Kes kecemasan dinilai secara munasabah dengan bukti sokongan.</li>
            </ul>
          </article>
          <article className="rounded-3xl bg-emerald-950 p-7 text-white">
            <h2 className="text-2xl font-black">Perkara penting</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-emerald-50/80">
              <li>Makanan dan minuman pagi serta makan tengah hari disediakan.</li>
              <li>Akses Tarannum.ai termasuk selama 30 hari; sambungan pilihan ialah RM30 sebulan.</li>
            </ul>
            <p className="mt-6 text-sm">Pertanyaan: <a className="font-bold text-amber-300" href="https://wa.me/60192504000">WhatsApp 019-250 4000</a> atau <a className="font-bold text-amber-300" href="mailto:appstarannum@gmail.com">appstarannum@gmail.com</a></p>
          </article>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white py-12"><div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="text-2xl font-black">Masjid Bandar Seri Putra Bangi</h2><p className="mt-2 text-stone-600">Jalan Seri Putra 2/1, Bandar Seri Putra, 43000 Kajang, Selangor</p></div><a href="https://www.google.com/maps?q=2.887538,101.788540" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 px-5 py-3 font-bold text-emerald-800"><MapPin className="h-5 w-5"/>Dapatkan arah</a></div></section>
    </div>
  );
};

export default MuazzinCoursePage;
