import React, { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

const TrainingStudio = lazy(() => import("../TrainingStudio"));

const DemoInteractivePage: React.FC = () => (
  <div className="bg-slate-50">
    <section className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Interactive Demo</p>
          <h1 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">Train, record and receive a sample score.</h1>
          <p className="mt-1 text-sm text-slate-600">Only references approved by the Admin for Public Demo are available.</p>
        </div>
        <Link to="/register" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          Create an account
        </Link>
      </div>
    </section>
    <Suspense fallback={<div className="flex min-h-[55vh] items-center justify-center text-sm font-medium text-slate-600">Preparing the interactive demo…</div>}>
      <TrainingStudio />
    </Suspense>
  </div>
);

export default DemoInteractivePage;
