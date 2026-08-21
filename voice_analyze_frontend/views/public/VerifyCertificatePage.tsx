import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { verifyCertificate } from "../../services/certificationService";

const typeLabel: Record<string, string> = {
  attendance: "Sijil Kehadiran & Penyertaan",
  competency_tarannum: "Sijil Kompetensi Tarannum",
  competency_azan: "Sijil Kompetensi Azan",
};

const VerifyCertificatePage: React.FC = () => {
  const { token = "" } = useParams();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { verifyCertificate(token).then(setResult).catch((err) => setError(err.message)); }, [token]);
  return <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center p-4 sm:p-8">
    {!result && !error && <div className="mx-auto text-center"><Loader2 className="mx-auto animate-spin text-emerald-700" /><p className="mt-3">Menyemak sijil…</p></div>}
    {error && <div className="w-full rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg"><ShieldAlert className="mx-auto h-14 w-14 text-red-600" /><h1 className="mt-4 text-2xl font-bold">Sijil tidak dapat disahkan</h1><p className="mt-2 text-slate-600">{error}</p></div>}
    {result && <div className="w-full rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-lg">
      <img src="/images/logo.png" alt="Tarannum.ai" className="mx-auto h-24 w-24 rounded-full object-cover" />
      <CheckCircle2 className="mx-auto mt-5 h-14 w-14 text-emerald-600" />
      <p className="mt-3 text-sm font-bold uppercase tracking-widest text-emerald-700">Sijil disahkan</p>
      <h1 className="mt-2 text-2xl font-bold">{typeLabel[result.certificate_type]}</h1>
      <dl className="mx-auto mt-6 max-w-lg divide-y text-left">
        <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Nombor sijil</dt><dd className="font-semibold">{result.certificate_number}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Pemegang</dt><dd className="font-semibold">{result.details?.student_name}</dd></div>
        <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Kandungan</dt><dd className="font-semibold">{result.details?.course_title || result.details?.reference_title}</dd></div>
        {result.details?.final_grade && <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Tahap</dt><dd className="font-semibold">{result.details.final_grade}</dd></div>}
        <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Status</dt><dd className="font-bold text-emerald-700">{result.status}</dd></div>
      </dl>
    </div>}
  </div>;
};

export default VerifyCertificatePage;
