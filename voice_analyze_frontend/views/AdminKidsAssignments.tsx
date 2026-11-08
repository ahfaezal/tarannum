import React, { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, RefreshCw, Search, Send, UserRoundCheck } from "lucide-react";
import {
  KidsAssignment,
  KidsLearningPackage,
  KidsStudent,
  createKidsAssignment,
  listKidsAssignments,
  listKidsPackages,
  listKidsStudents,
} from "../services/kidsPackageService";

const statusLabel: Record<KidsAssignment["status"], string> = {
  assigned: "Diberikan",
  in_progress: "Sedang belajar",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const statusStyle: Record<KidsAssignment["status"], string> = {
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
};

const AdminKidsAssignments: React.FC = () => {
  const [students, setStudents] = useState<KidsStudent[]>([]);
  const [packages, setPackages] = useState<KidsLearningPackage[]>([]);
  const [assignments, setAssignments] = useState<KidsAssignment[]>([]);
  const [studentId, setStudentId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<KidsAssignment["status"] | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const published = useMemo(() => packages.filter((item) => item.status === "published"), [packages]);
  const visibleStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return students;
    return students.filter((item) => `${item.name} ${item.email}`.toLocaleLowerCase().includes(term));
  }, [search, students]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentRows, packageRows, assignmentRows] = await Promise.all([
        listKidsStudents(),
        listKidsPackages("published"),
        listKidsAssignments(status === "all" ? undefined : status),
      ]);
      setStudents(studentRows);
      setPackages(packageRows);
      setAssignments(assignmentRows);
      setStudentId((current) => current || studentRows[0]?.id || "");
      setPackageId((current) => current || packageRows[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data assignment tidak dapat dimuatkan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status]);

  const assign = async () => {
    if (!studentId || !packageId) {
      setError("Pilih pelajar dan pakej yang telah diterbitkan.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createKidsAssignment({ student_id: studentId, package_id: packageId, reason });
      setMessage(`${created.package_title} telah diberikan kepada ${created.student_name}.`);
      setReason("");
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Assignment tidak berjaya.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <header className="rounded-2xl bg-gradient-to-r from-emerald-950 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div className="rounded-xl bg-emerald-500/20 p-3 text-emerald-300"><UserRoundCheck className="h-7 w-7" /></div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Tarannum Kids Admin</p>
              <h1 className="mt-1 text-2xl font-bold">Assignment Pakej Pelajar</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Gunakan akaun pelajar Tarannum.ai yang sama dan berikan hanya pakej yang telah diterbitkan.</p>
            </div>
          </div>
          <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Muat semula</button>
        </div>
      </header>

      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}
      {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</div>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><BookOpenCheck className="h-6 w-6 text-emerald-700" /><div><h2 className="text-lg font-bold text-slate-900">Berikan pakej</h2><p className="text-sm text-slate-500">Assignment tidak mengubah markah atau rekod latihan asal.</p></div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Cari pelajar</label>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama atau e-mel" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3" /></div>
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2">
              {visibleStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.email}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-sm font-semibold text-slate-700">Pakej diterbitkan</label><select value={packageId} onChange={(event) => setPackageId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">{published.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select><p className="mt-2 text-xs text-slate-500">{published.length} pakej tersedia</p></div>
          <div><label className="mb-1 block text-sm font-semibold text-slate-700">Tujuan assignment</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={2000} placeholder="Contoh: Pakej permulaan IQRA 3" className="w-full rounded-lg border border-slate-300 px-3 py-2" /></div>
        </div>
        <button disabled={saving || !studentId || !packageId} onClick={() => void assign()} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} Berikan kepada pelajar</button>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Rekod assignment</h2><p className="mt-1 text-sm text-slate-500">Pantau assignment dan run terbaru bagi setiap pelajar.</p></div><select value={status} onChange={(event) => setStatus(event.target.value as KidsAssignment["status"] | "all")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="all">Semua status</option><option value="assigned">Diberikan</option><option value="in_progress">Sedang belajar</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></div>
        {loading ? <div className="flex justify-center p-10"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : assignments.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Belum ada assignment dalam status ini.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="px-3 py-3">Pelajar</th><th className="px-3 py-3">Pakej</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Run terbaru</th><th className="px-3 py-3">Diberikan</th></tr></thead><tbody>{assignments.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{item.student_name}</p><p className="text-xs text-slate-500">{item.student_email}</p></td><td className="px-3 py-3"><p className="font-semibold">{item.package_title}</p><p className="text-xs text-slate-500">{item.package_key} · v{item.package_version}</p></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyle[item.status]}`}>{statusLabel[item.status]}</span></td><td className="px-3 py-3 text-slate-600">{item.latest_run ? `${item.latest_run.status} · ${Math.round(item.latest_run.valid_activity_seconds / 60)} min` : "Belum bermula"}</td><td className="px-3 py-3 text-slate-600">{item.assigned_at ? new Date(item.assigned_at).toLocaleString("ms-MY") : "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
};

export default AdminKidsAssignments;
