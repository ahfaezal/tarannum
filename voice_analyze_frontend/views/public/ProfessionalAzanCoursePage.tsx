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
import { getMetaConsent, metaPixelConfigured, setMetaConsent, trackMetaEvent } from "../../services/metaPixel";

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
  ["2:00 – 3:30", "Latihan intensif", "Rakaman, semakan skor dan pengulangan"],
  ["3:30 – 4:00", "Pelan susulan", "Sasaran 60 minit, sijil dan komitmen peserta"],
];

const fieldClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
const ATTRIBUTION_KEY = "professional_azan_attribution";

const getAttribution = () => {
  const params = new URLSearchParams(window.location.search);
  const stored = (() => {
    try { return JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_KEY) || "{}") as Record<string, string>; }
    catch { return {} as Record<string, string>; }
  })();
  const source = params.get("utm_source") || (params.has("fbclid") ? "facebook" : "");
  const medium = params.get("utm_medium") || (params.has("fbclid") ? "paid_social" : "");
  const campaign = params.get("utm_campaign") || "";
  const attribution = {
    attribution_source: (source || stored.attribution_source || "unknown").slice(0, 80),
    attribution_medium: (medium || stored.attribution_medium || "").slice(0, 80),
    attribution_campaign: (campaign || stored.attribution_campaign || "").slice(0, 160),
  };
  try { window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); }
  catch { /* Session storage may be disabled; the current URL still works. */ }
  return attribution;
};

const ProfessionalAzanCoursePage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<{ available_count: number; is_full: boolean } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<{ paid: boolean; account_linked: boolean; email: string; full_name: string; status: string } | null>(null);
  const [statusRefresh, setStatusRefresh] = useState(0);
  const [statusChecking, setStatusChecking] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(() => getMetaConsent());
  const districts = useMemo(() => DISTRICTS[state] || [], [state]);
  const isPaymentReturn = location.pathname.endsWith("/pembayaran");
  const registrationToken = searchParams.get("registration") || "";

  useEffect(() => {
    document.title = "Kursus Profesional Azan | Tarannum.ai";
    if (!isPaymentReturn) getAttribution();
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    fetch(`${API_URL}/api/promotions/kursus-profesional-azan-hijjaz-oktober-2026`)
      .then(response => response.ok ? response.json() : null)
      .then(data => data && setCampaign(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isPaymentReturn && analyticsConsent === "granted") {
      trackMetaEvent("ViewContent", {
        content_name: "Kursus Profesional Azan Maqam Hijjaz",
        content_category: "Kursus",
        value: 200,
        currency: "MYR",
      });
    }
  }, [analyticsConsent, isPaymentReturn]);

  useEffect(() => {
    if (!paymentStatus?.paid || analyticsConsent !== "granted" || !registrationToken) return;
    const purchaseKey = `professional_azan_purchase_${registrationToken}`;
    if (window.localStorage.getItem(purchaseKey)) return;
    if (trackMetaEvent("Purchase", {
      content_name: "Kursus Profesional Azan Maqam Hijjaz",
      content_type: "product",
      value: 200,
      currency: "MYR",
    })) window.localStorage.setItem(purchaseKey, "sent");
  }, [analyticsConsent, paymentStatus?.paid, registrationToken]);

  useEffect(() => {
    if (!isPaymentReturn || !registrationToken) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const readStatus = async () => {
      if (!cancelled) setStatusChecking(true);
      let terminal = false;
      try {
        const response = await fetch(`${API_URL}/api/promotions/kursus-profesional-azan-hijjaz-oktober-2026/registrations/${encodeURIComponent(registrationToken)}`);
        if (!response.ok) throw new Error("Status pembayaran belum dapat disemak. Sila cuba semula.");
        const data = await response.json();
        if (!cancelled) { setPaymentStatus(data); setMessage(null); }
        terminal = data.paid || data.status === "payment_failed";
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Status belum dapat disemak.");
      } finally {
        if (!cancelled) setStatusChecking(false);
        attempts += 1;
        if (!cancelled && !terminal && attempts < 10) timer = window.setTimeout(readStatus, 3000);
      }
    };
    void readStatus();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [isPaymentReturn, registrationToken, statusRefresh]);

  const submitInterest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const endpoint = campaign?.is_full ? "waitlist" : "registrations";
      const response = await fetch(`${API_URL}/api/promotions/kursus-profesional-azan-hijjaz-oktober-2026/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), ...getAttribution() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Pendaftaran belum dapat diproses.");
      if (payload.already_paid && payload.registration_token) window.location.assign(`/kursus-profesional-azan/pembayaran?registration=${encodeURIComponent(payload.registration_token)}`);
      else if (payload.checkout_url) {
        trackMetaEvent("InitiateCheckout", {
          content_name: "Kursus Profesional Azan Maqam Hijjaz",
          content_type: "product",
          value: 200,
          currency: "MYR",
        });
        window.location.assign(payload.checkout_url);
      }
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
        <p className="mt-6 text-sm font-black uppercase tracking-[.2em] text-emerald-700">Kursus Profesional Azan</p>
        <h1 className="mt-3 text-3xl font-black">{paid ? "Pembayaran berjaya. Tempat anda disahkan." : paymentStatus?.status === "payment_failed" ? "Pembayaran belum berjaya." : "Pembayaran sedang disahkan."}</h1>
        <p className="mt-5 leading-7 text-stone-600">{paid ? "Langkah terakhir ialah membuka atau menghubungkan akaun Tarannum.ai untuk akses latihan 30 hari dan persijilan." : paymentStatus?.status === "payment_failed" ? "Transaksi ini tidak berjaya. Hubungi pihak penganjur jika wang telah ditolak sebelum mencuba pembayaran semula." : "Pengesahan ToyyibPay mungkin mengambil sedikit masa. Jangan buat bayaran kedua sebelum menyemak status transaksi pertama."}</p>
        {paid && !paymentStatus?.account_linked && <Link to={`/register?course_registration=${encodeURIComponent(registrationToken)}&email=${encodeURIComponent(paymentStatus?.email || "")}&name=${encodeURIComponent(paymentStatus?.full_name || "")}`} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Buka akaun Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
        {paid && paymentStatus?.account_linked && <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white">Log masuk Tarannum.ai <ArrowRight className="h-5 w-5" /></Link>}
        {!paid && <div className="mt-7 flex flex-wrap justify-center gap-3"><button type="button" disabled={statusChecking} onClick={() => { setMessage(null); setStatusRefresh(value => value + 1); }} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60">{statusChecking ? "Menyemak…" : "Semak status semula"}</button><a href="https://wa.me/60192504000?text=Saya%20perlukan%20bantuan%20menyemak%20bayaran%20Kursus%20Profesional%20Azan" className="rounded-xl border border-stone-300 px-5 py-3 font-bold text-emerald-800">Bantuan WhatsApp</a></div>}
        {message && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p>}
      </div>
    </section>;
  }

  return (
    <div className="bg-[#f7f4ec] text-stone-900">
      {metaPixelConfigured && analyticsConsent === null && <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl" aria-label="Persetujuan analitik pemasaran">
        <p className="font-black text-stone-900">Bantu kami menilai keberkesanan promosi</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">Dengan izin anda, Meta Pixel merekodkan lawatan dan peringkat pembayaran kursus. Nama, e-mel, nombor telefon dan ID klik individu tidak dihantar melalui integrasi ini.</p>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => { setMetaConsent(true); setAnalyticsConsent("granted"); }} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">Benarkan analitik</button><button type="button" onClick={() => { setMetaConsent(false); setAnalyticsConsent("denied"); }} className="rounded-xl border border-stone-300 px-5 py-3 font-bold text-stone-700">Tidak, terima kasih</button></div>
      </aside>}
      <section className="relative isolate overflow-hidden bg-[#073f32] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(212,168,73,.24),transparent_30%),linear-gradient(135deg,transparent_0%,rgba(255,255,255,.04)_55%,transparent_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
          <div>
            <div className="mb-8 flex flex-wrap items-center gap-5">
              <img src="/images/logo.png" alt="Logo Tarannum Technologies" className="h-24 w-24 rounded-full object-cover" />
              <img src="/images/logo-surau-al-amin.png" alt="Logo Surau Jumaat Al-Amin" className="h-24 w-auto max-w-[13rem] object-contain" />
            </div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[.16em] text-emerald-100/80">Anjuran bersama Tarannum Technologies dan Surau Jumaat Al-Amin</p>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-200/10 px-4 py-2 text-sm font-semibold text-amber-100"><Sparkles className="h-4 w-4" /> Tempat adalah terhad</p>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Kursus Profesional Azan</h1>
            <p className="mt-4 max-w-2xl text-xl font-semibold text-amber-200 sm:text-2xl">Azan dalam Maqam Hijjaz, diperkukuh dengan latihan Tarannum.ai</p>
            <p className="mt-5 inline-flex max-w-2xl rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-amber-100 sm:text-base">Bimbingan Qari → Latihan Praktikal Guna AI → Analisis Hasil Azan</p>
            <p className="mt-6 max-w-2xl text-base leading-8 text-emerald-50/85 sm:text-lg">Belajar bersama Qari, rakam suara anda, semak perkembangan dan teruskan latihan selama 30 hari selepas kursus.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#daftar" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-black text-emerald-950 shadow-lg shadow-black/20 transition hover:bg-amber-300">{campaign?.is_full ? "Sertai senarai menunggu" : "Daftar RM200"} <ArrowRight className="h-5 w-5" /></a>
              <a href="https://wa.me/60192504000" className="rounded-xl border border-white/30 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">Tanya melalui WhatsApp</a>
            </div>
            <div className="mt-5 max-w-2xl rounded-2xl border border-amber-200/30 bg-emerald-950/45 px-5 py-4">
              <p className="font-black text-amber-200">RM200 bukan untuk satu hari sahaja.</p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/80">Yuran merangkumi kursus fizikal bersama Qari dan akses latihan Tarannum.ai selama 30 hari. iPad serta headset disediakan semasa sesi kursus.</p>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-amber-300/10 blur-2xl" />
            <img src="/images/ustaz-ahmad-tarmizi-hero.webp" alt="Ustaz Ahmad Tarmizi bin Abdul Rahman menadah tangan" width={971} height={1620} className="relative aspect-[2/3] w-full rounded-[2rem] object-cover object-top shadow-2xl ring-1 ring-white/15" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/20 bg-emerald-950/85 p-5 backdrop-blur">
              <p className="text-sm font-semibold text-amber-200">PENCERAMAH & QARI</p>
              <p className="mt-1 text-xl font-black">Ustaz Ahmad Tarmizi bin Abdul Rahman</p>
              <p className="mt-1 text-sm text-emerald-100/75">Qari, pendakwah dan tokoh al-Quran Malaysia</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-1 max-w-7xl px-5 py-8 sm:px-8">
        <div className="grid overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [CalendarDays, "24 Oktober 2026", "Sabtu"],
            [Clock3, "8:30 pagi – 4:00 petang", "Kursus sehari"],
            [MapPin, "Surau Jumaat Al-Amin", "Bandar Tun Razak, Kuala Lumpur"],
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

      <section aria-labelledby="ustaz-tarmizi-video-title" className="bg-white py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Pengalaman latihan Tarannum.ai</p>
            <h2 id="ustaz-tarmizi-video-title" className="mt-3 text-3xl font-black sm:text-4xl">Bukan sekadar dengar dan ikut—lihat, rakam dan perbaiki.</h2>
            <p id="ustaz-tarmizi-video-description" className="mt-5 leading-8 text-stone-600">Video ini menunjukkan pengalaman latihan azan menggunakan Tarannum.ai dengan bacaan Ustaz Ahmad Tarmizi sebagai panduan. Peserta dapat melihat pergerakan nada secara visual, membandingkan rakaman sendiri dengan bacaan rujukan dan mengulang latihan berdasarkan maklum balas yang tersusun.</p>
            <p className="mt-4 leading-8 text-stone-600">Berbanding latihan tradisional yang bergantung pada pendengaran dan ingatan semata-mata, Tarannum.ai membantu peserta melihat bahagian yang perlu diperbaiki. Teknologi ini melengkapi—bukan menggantikan—bimbingan qari.</p>
            <p className="mt-4 text-sm leading-6 text-stone-500">Video hanya dimainkan apabila anda menekan butang main. Gunakan fon kepala untuk pengalaman audio yang lebih jelas.</p>
          </div>
          <figure className="overflow-hidden rounded-3xl border border-stone-200 bg-emerald-950 shadow-xl">
            <video controls playsInline preload="metadata" poster="/images/ustaz-ahmad-tarmizi-azan.webp" aria-label="Video contoh pengalaman latihan azan menggunakan Tarannum.ai" aria-describedby="ustaz-tarmizi-video-description" className="mx-auto max-h-[75vh] w-full bg-black">
              <source src="/images/azan-ustaz-ahmad-tarmizi-web.mp4" type="video/mp4" />
              Pelayar anda tidak menyokong video ini. <a href="/images/azan-ustaz-ahmad-tarmizi-web.mp4">Buka video azan Ustaz Ahmad Tarmizi</a>.
            </video>
            <figcaption className="px-5 py-4 text-sm leading-6 text-emerald-50/80">Demonstrasi latihan Tarannum.ai menggunakan bacaan Ustaz Ahmad Tarmizi bin Abdul Rahman sebagai rujukan. <a href="/images/azan-ustaz-ahmad-tarmizi-web.mp4" target="_blank" rel="noreferrer" className="font-bold text-amber-300 underline">Buka video dalam tab baharu</a>.</figcaption>
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
        <div className="grid gap-4"><img src="/images/kursus-profesional-azan-oktober-2026.png" alt="Kursus Profesional Azan bersama Ustaz Ahmad Tarmizi" className="mx-auto max-h-[640px] w-auto rounded-2xl object-contain shadow-lg"/><div className="grid grid-cols-2 gap-4"><div className="rounded-2xl bg-emerald-900 p-6 text-center text-white"><Award className="mx-auto h-9 w-9 text-amber-300"/><p className="mt-3 font-black">Johan Tilawah</p><p className="mt-1 text-sm text-emerald-100/70">Terengganu 2010 & 2016</p></div><div className="rounded-2xl bg-amber-100 p-6 text-center text-emerald-950"><Mic2 className="mx-auto h-9 w-9"/><p className="mt-3 font-black">Irama Hijjaz</p><p className="mt-1 text-sm text-stone-600">Alunan merdu dan tersusun</p></div></div></div>
        <div><p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Profil pengajar</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Bimbingan qari dan tokoh al-Quran berpengalaman.</h2><p className="mt-5 leading-8 text-stone-600">Ustaz Ahmad Tarmizi bin Abdul Rahman, juga dikenali sebagai Ustaz Tarmizi Abd Rahman, ialah qari, pendakwah dan tokoh al-Quran terkenal di Malaysia.</p><p className="mt-4 leading-8 text-stone-600">Beliau merupakan qari #QuranTime TV Al-Hijrah, juri Akademi Al-Quran dan Geng Ngaji Astro Oasis, serta bekas peserta akhir Akademi Al-Quran TV9. Beliau menjuarai Tilawah Al-Quran Negeri Terengganu pada 2010 dan 2016, dan terkenal dengan alunan irama Hijjaz.</p></div>
      </section>

      <section className="bg-[#0c4c3d] py-16 text-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8"><p className="text-sm font-black uppercase tracking-[.2em] text-amber-300">Tentatif program</p><h2 className="mt-3 text-3xl font-black">Satu hari yang disusun untuk terus menghasilkan amalan.</h2><div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/15 bg-white/5">{agenda.map(([time,title,text])=><div key={time} className="grid gap-2 p-5 sm:grid-cols-[130px_190px_1fr] sm:items-center"><p className="font-black text-amber-300">{time}</p><p className="font-bold">{title}</p><p className="text-sm text-emerald-50/70">{text}</p></div>)}</div></div>
      </section>

      <section id="daftar" className="scroll-mt-24 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">{campaign?.is_full ? "Senarai menunggu kursus seterusnya" : "Daftar minat & pembayaran"}</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">{campaign?.is_full ? "Pengambilan telah penuh." : "Daftar dengan yuran RM200."}</h2>
            <p className="mt-5 leading-8 text-stone-600">{campaign?.is_full ? "Pengambilan ini telah penuh. Tinggalkan maklumat untuk mendapat keutamaan bagi kursus seterusnya." : "Isi maklumat ringkas. Tempat hanya disahkan selepas pembayaran berjaya. Akaun Tarannum.ai akan dibuka atau dihubungkan selepas pembayaran."}</p>
            <div className="mt-8 rounded-2xl bg-amber-100 p-6"><div className="flex items-center gap-3"><Users className="h-6 w-6 text-emerald-800"/><p className="font-black">{campaign?.is_full ? "Senarai menunggu dibuka" : "Tempat adalah terhad"}</p></div><p className="mt-2 text-sm text-stone-600">Apabila penuh, borang akan bertukar kepada senarai menunggu kursus seterusnya.</p></div>
          </div>
          <form onSubmit={submitInterest} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-bold">Nama penuh<input className={fieldClass} name="full_name" required autoComplete="name" /></label>
              <label className="text-sm font-bold">Nombor WhatsApp<input className={fieldClass} name="phone" required autoComplete="tel" inputMode="tel" placeholder="01X-XXXXXXX" /></label>
              <label className="text-sm font-bold">Alamat e-mel<input className={fieldClass} name="email" required type="email" autoComplete="email" /></label>
              <details className="sm:col-span-2 rounded-xl border border-stone-200 p-4 text-sm"><summary className="cursor-pointer font-bold text-emerald-800">Maklumat tambahan (pilihan)</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="font-bold">Negeri<select className={fieldClass} name="state" value={state} onChange={e=>{setState(e.target.value);setDistrict("");}}><option value="">Pilih negeri</option>{Object.keys(DISTRICTS).map(item=><option key={item}>{item}</option>)}</select></label>
                <label className="font-bold">Daerah<select className={fieldClass} name="district" value={district} disabled={!state} onChange={e=>setDistrict(e.target.value)}><option value="">Pilih daerah</option>{districts.map(item=><option key={item}>{item}</option>)}</select></label>
                <label className="sm:col-span-2 font-bold">Masjid, surau atau organisasi<input className={fieldClass} name="organization" /></label>
              </div></details>
              {campaign?.is_full && <label className="sm:col-span-2 text-sm font-bold">Pilihan kursus akan datang<select className={fieldClass} name="preferred_month" required><option value="">Pilih bulan</option><option>November 2026</option><option>Disember 2026</option><option>Januari 2027</option></select></label>}
            </div>
            <label className="mt-6 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="registration_consent" value="true" required className="mt-1 h-4 w-4 accent-emerald-700"/>Saya bersetuju maklumat ini digunakan untuk mengurus pendaftaran, pembayaran dan komunikasi kursus ini, serta telah membaca polisi pembatalan di bawah.</label>
            <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" name="marketing_consent" value="true" className="mt-1 h-4 w-4 accent-emerald-700"/>Saya bersetuju menerima maklumat kursus Tarannum Technologies pada masa akan datang.</label>
            <p className="mt-3 text-xs leading-5 text-stone-500">Sumber kempen (jika ada) direkodkan bersama pendaftaran untuk menilai keberkesanan promosi; ID klik individu tidak disimpan.</p>
            {!campaign?.is_full && <details className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <summary className="cursor-pointer font-black text-stone-900">Cara membuat pembayaran melalui ToyyibPay</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
                <li>Tekan butang <b>Teruskan ke Pembayaran RM200</b>.</li>
                <li>Di ToyyibPay, pilih <b>Online Banking</b> dan jenis akaun <b>Personal Banking</b>.</li>
                <li>Pilih bank anda, kemudian tandakan persetujuan terma dan syarat.</li>
                <li>Tekan butang untuk meneruskan ke laman bank dan lengkapkan pembayaran.</li>
                <li>Selepas berjaya, anda akan dibawa kembali ke Tarannum.ai untuk pengesahan tempat.</li>
              </ol>
              <p className="mt-4 border-t border-amber-200 pt-4 text-sm leading-6 text-stone-700">Tidak biasa menggunakan perbankan dalam talian? <a href="https://wa.me/60192504000?text=Saya%20perlukan%20bantuan%20untuk%20bayaran%20Kursus%20Profesional%20Azan" target="_blank" rel="noreferrer" className="font-black text-emerald-700 underline">Hubungi kami melalui WhatsApp</a> untuk bantuan atau pilihan pembayaran terus. Tempat disahkan selepas bayaran diterima.</p>
            </details>}
            <button disabled={submitting} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-4 font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">{submitting ? "Memproses…" : campaign?.is_full ? "Sertai Senarai Menunggu" : "Teruskan ke Pembayaran RM200"}<ArrowRight className="h-5 w-5" /></button>
            {message && <p role="status" className="mt-4 rounded-xl bg-stone-100 p-4 text-sm text-stone-700">{message}</p>}
            {!campaign?.is_full && <p className="mt-4 text-center text-xs leading-5 text-stone-400">Pembayaran selamat melalui ToyyibPay. Caj transaksi ditanggung Tarannum Technologies.</p>}
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

      <section className="border-t border-stone-200 bg-white py-12"><div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-8 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="text-2xl font-black">Surau Jumaat Al-Amin</h2><p className="mt-2 text-stone-600">Bandar Tun Razak, Kuala Lumpur</p></div><a href="https://maps.app.goo.gl/p3CLDp2h9KuEeVHcA" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 px-5 py-3 font-bold text-emerald-800"><MapPin className="h-5 w-5"/>Dapatkan arah</a></div></section>
    </div>
  );
};

export default ProfessionalAzanCoursePage;
