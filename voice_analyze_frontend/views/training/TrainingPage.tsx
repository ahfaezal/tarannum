import React, { lazy, Suspense, useState } from "react";
import { Headphones, Mic2, PlayCircle, ShieldCheck } from "lucide-react";

const TrainingWorkspace = lazy(() => import("../TrainingStudio"));

const WorkspaceLoader = () => (
  <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4" role="status">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    <p className="text-sm font-medium text-slate-600">Menyediakan Training Studio…</p>
  </div>
);

const TrainingPage: React.FC = () => {
  const [workspaceStarted, setWorkspaceStarted] = useState(false);

  if (workspaceStarted) {
    return <Suspense fallback={<WorkspaceLoader />}><TrainingWorkspace /></Suspense>;
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-sm font-bold tracking-wide text-emerald-700">PERSEDIAAN LATIHAN</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-slate-950 sm:text-5xl">
        Mulakan studio hanya apabila anda bersedia untuk berlatih.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        Audio rujukan, waveform dan graph pitch belum dimuatkan pada halaman ini. Ini menjadikan akses awal lebih pantas dan mengurangkan beban serentak.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          [Headphones, "Gunakan headset", "Pastikan Jabra Evolve 30 disambungkan."],
          [Mic2, "Semak mikrofon", "Benarkan mikrofon hanya apabila mula merakam."],
          [ShieldCheck, "Ruang yang sesuai", "Kurangkan bunyi persekitaran sebelum latihan."],
        ].map(([Icon, title, description]) => {
          const ItemIcon = Icon as React.ComponentType<{ size?: number; className?: string }>;
          return <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ItemIcon size={24} className="text-emerald-600" />
            <h2 className="mt-4 font-bold text-slate-900">{String(title)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{String(description)}</p>
          </div>;
        })}
      </div>

      <button
        type="button"
        onClick={() => setWorkspaceStarted(true)}
        className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
      >
        <PlayCircle size={20} /> Mula Training Studio
      </button>
      <p className="mt-3 text-sm text-slate-500">Kandungan qari dan audio rujukan hanya akan diminta selepas butang ini ditekan.</p>
    </section>
  );
};

export default TrainingPage;
