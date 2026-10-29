import React, { lazy, Suspense, useEffect } from "react";
import { Headphones, Mic2, Radio } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const TrainingWorkspace = lazy(() => import("../TrainingStudio"));
const RecordingWorkspace = lazy(() => import("../recording/RecordingPage"));

type StudioActivity = "listen" | "practice" | "record";

const WorkspaceLoader = () => (
  <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4" role="status">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    <p className="text-sm font-medium text-slate-600">Menyediakan Studio Latihan 2.0…</p>
  </div>
);

const activities: Array<{id: StudioActivity; title: string; detail: string; icon: React.ComponentType<{size?: number}>}> = [
  {id: "listen", title: "Dengar", detail: "Dengar dan perhatikan alunan Qari", icon: Headphones},
  {id: "practice", title: "Latih", detail: "Ikuti bacaan sambil melihat nada", icon: Mic2},
  {id: "record", title: "Rakam & Nilai", detail: "Rakam bacaan untuk mendapatkan markah", icon: Radio},
];

const TrainingPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get("activity");
  const activity: StudioActivity = requested === "listen" || requested === "record" ? requested : "practice";

  useEffect(() => {
    if (!requested || activity === "record") return;
    const timer = window.setTimeout(() => {
      document.getElementById(activity === "listen" ? "reference-audio" : "training-workspace")?.scrollIntoView({behavior: "smooth", block: "start"});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activity, requested]);

  const selectActivity = (next: StudioActivity) => {
    const updated = new URLSearchParams(params);
    updated.set("activity", next);
    const savedReference = sessionStorage.getItem("tarannum_active_reference_id");
    if (savedReference) updated.set("reference", savedReference);
    setParams(updated);
  };

  return <section className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
    <div className="rounded-3xl border border-emerald-100 bg-gradient-to-r from-emerald-950 to-teal-800 p-5 text-white shadow-lg sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Studio Latihan 2.0</p><h1 className="mt-2 text-2xl font-black sm:text-4xl">Dengar, latih dan rakam di satu tempat.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50 sm:text-base">Pilih Qari dan rujukan sekali. Pilihan anda dikekalkan apabila bertukar aktiviti.</p></div>
        <span className="rounded-full bg-white/15 px-4 py-2 text-xs font-bold">VERSI 2.0</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3" aria-label="Pilih aktiviti Studio Latihan">
        {activities.map(item => { const Icon = item.icon; const active = activity === item.id; return <button key={item.id} type="button" aria-pressed={active} onClick={() => selectActivity(item.id)} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition ${active ? "border-white bg-white text-slate-950 shadow-xl" : "border-white/20 bg-white/10 text-white hover:bg-white/15"}`}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${active ? "bg-emerald-100 text-emerald-800" : "bg-white/15"}`}><Icon size={23}/></span><span><span className="block text-lg font-black">{item.title}</span><span className={`mt-1 block text-sm ${active ? "text-slate-600" : "text-emerald-50"}`}>{item.detail}</span></span></button>; })}
      </div>
    </div>
    <Suspense fallback={<WorkspaceLoader />}>
      {activity === "record" ? <RecordingWorkspace embedded /> : <TrainingWorkspace />}
    </Suspense>
  </section>;
};

export default TrainingPage;
