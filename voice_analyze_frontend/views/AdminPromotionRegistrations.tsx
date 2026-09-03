import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthHeader } from "../services/authService";

interface Registration {
  id: string; full_name: string; phone: string; email: string;
  state: string; district: string; organization: string | null;
  status: string; marketing_consent: boolean; preferred_month: string | null;
  paid_at: string | null; account_linked: boolean; created_at: string; payment_method: "direct" | "toyyibpay" | null;
}
interface Report {
  campaign: { title: string; capacity: number; paid_count: number; reserved_count: number; available_count: number };
  status_counts: Record<string, number>;
  registrations: Registration[];
}
const labels: Record<string, string> = {
  paid: "Sudah bayar", account_linked: "Sudah bayar · Akaun dipautkan", attended: "Sudah hadir",
  payment_reserved: "Menunggu bayaran", payment_failed: "Bayaran gagal", interested: "Berminat / Belum bayar",
  waitlisted: "Senarai menunggu", payment_test: "Bayaran percubaan",
};
const paidStatuses = new Set(["paid", "account_linked", "attended"]);
const date = (value: string | null) => {
  if (!value) return "—";
  // Backend stores UTC timestamps, sometimes without a timezone suffix.
  const parsed = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur" });
};

export default function AdminPromotionRegistrations() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    async function load() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/promotions/kursus-muazzin-hijjaz-2026/admin/registrations`, {
          headers: getAuthHeader(), signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error(response.status === 401 ? "Sesi tamat. Sila log masuk semula." : response.status === 403 ? "Akses terhad kepada admin sahaja." : "Data pendaftaran tidak dapat dimuatkan. Sila cuba lagi.");
        const report: Report = await response.json();
        if (!controller.signal.aborted) { setData(report); setUpdated(new Date().toISOString()); }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Sila cuba lagi.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);
  const rows = useMemo(() => (data?.registrations || []).filter(row => {
    const matchesStatus = status === "all" || (status === "paid_group" ? paidStatuses.has(row.status) : row.status === status);
    return matchesStatus && [row.full_name, row.phone, row.email, row.state, row.district, row.organization || ""].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  }), [data, query, status]);
  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <Link to="/admin" className="text-sm font-semibold text-emerald-700">← Dashboard admin</Link>
    <header className="rounded-2xl bg-emerald-950 p-6 text-white">
      <p className="text-sm text-emerald-200">Admin sahaja · Maklumat sulit peserta</p>
      <h1 className="mt-2 text-2xl font-bold">Pendaftaran Kursus Pemantapan Muazzin</h1>
      <p className="mt-2">19 September 2026 · Masjid Bandar Seri Putra, Bangi</p>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">{updated && !loading && !error ? `Dikemas kini: ${date(updated)} (waktu Malaysia)` : "Semakan pendaftaran dan bayaran"}</p>
      <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Memuatkan…" : "Muat semula"}</button>
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <Link to="/login?next=%2Fadmin%2Fpendaftaran-kursus" className="underline">Log masuk</Link></div>}
    {loading && <p role="status">Memuatkan data pendaftaran…</p>}
    {data && <>
      <section aria-label="Ringkasan pendaftaran" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Jumlah rekod", data.registrations.length], ["Peserta berbayar", `${data.campaign.paid_count} / ${data.campaign.capacity}`], ["Tempahan aktif", data.campaign.reserved_count], ["Tempat tersedia", data.campaign.available_count], ["Senarai menunggu", data.status_counts.waitlisted || 0]].map(([title, value]) => <div key={title} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{title}</p><p className="mt-2 text-3xl font-bold text-emerald-800">{value}</p></div>)}
      </section>
      <p className="text-sm text-slate-600">Tempat tersedia mengambil kira peserta berbayar dan tempahan pembayaran yang masih aktif. Status “Menunggu bayaran” bukan bukti bayaran berjaya; rekod lama mungkin mempunyai tempahan yang sudah tamat. Rekod percubaan tidak dikira sebagai peserta berbayar.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Cari peserta<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nama, telefon, e-mel, negeri atau daerah" className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal" /></label>
        <label className="text-sm font-semibold">Status<select value={status} onChange={e => setStatus(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal"><option value="all">Semua rekod</option><option value="paid_group">Semua peserta berbayar</option>{Object.keys(data.status_counts).sort().map(key => <option key={key} value={key}>{labels[key] || key}</option>)}</select></label>
      </div>
      <p className="text-sm text-slate-600" aria-live="polite">{rows.length} daripada {data.registrations.length} rekod dipaparkan.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <caption className="sr-only">Senarai pendaftaran kursus dan status pembayaran</caption>
          <thead className="bg-slate-100"><tr>{["Peserta & hubungan", "Lokasi / organisasi", "Status & akaun", "Tarikh (Malaysia)", "Kursus seterusnya"].map(title => <th scope="col" key={title} className="p-4">{title}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100 align-top">
            <td className="p-4"><p className="font-bold">{row.full_name}</p><p className="mt-1">{row.phone}</p><p className="break-all">{row.email}</p></td>
            <td className="p-4">{row.district}, {row.state}<p className="mt-1 text-slate-500">{row.organization || "—"}</p></td>
            <td className="p-4"><span className={`inline-block rounded-lg px-2 py-1 font-semibold ${paidStatuses.has(row.status) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{labels[row.status] || row.status}</span>{row.payment_method === "direct" && <p className="mt-2 font-bold text-emerald-800">Nota: Bayaran secara terus</p>}<p className="mt-2 text-slate-600">{row.account_linked ? "Akaun dipautkan" : "Akaun belum dipautkan"}</p></td>
            <td className="p-4"><p>Daftar: {date(row.created_at)}</p><p className="mt-2">Bayar: {date(row.paid_at)}</p></td>
            <td className="p-4"><p>{row.preferred_month || "Tiada pilihan bulan"}</p><p className="mt-2 text-slate-600">Persetujuan promosi: {row.marketing_consent ? "Ya" : "Tidak"}</p></td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-slate-500">{data.registrations.length ? "Tiada rekod sepadan dengan carian." : "Belum ada pendaftaran."}</p>}
      </div>
      <p className="text-xs text-slate-500">Maklumat peserta adalah sulit. Hubungi peserta mengenai promosi akan datang hanya jika persetujuan promosi diberikan. Halaman ini tidak mengubah status pembayaran.</p>
    </>}
  </main>;
}
