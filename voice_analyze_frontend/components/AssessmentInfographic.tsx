import React from "react";

export type AssessmentMetric = { label: string; value?: number };

const status = (value?: number) => value === undefined ? "Not assessed" : value >= 75 ? "Strong" : value >= 50 ? "Developing" : "Focus";
const tone = (value?: number) => value === undefined ? "bg-slate-300" : value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500";

const AssessmentInfographic: React.FC<{ overall: number; metrics: AssessmentMetric[] }> = ({ overall, metrics }) => {
  const assessed = metrics.filter((metric): metric is AssessmentMetric & { value: number } => typeof metric.value === "number");
  const strongest = [...assessed].sort((a, b) => b.value - a.value)[0];
  const priority = [...assessed].sort((a, b) => a.value - b.value)[0];
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.max(0, Math.min(100, overall)) / 100;

  return <section className="mt-6" aria-label="Tarannum assessment infographic">
    <h3 className="font-bold text-slate-900">Tarannum Assessment</h3>
    <div className="mt-4 grid gap-6 rounded-2xl border border-emerald-200 bg-white p-5 lg:grid-cols-[180px_1fr]">
      <div className="flex flex-col items-center justify-center border-b border-slate-100 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Overall score ${Math.round(overall)} percent`}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10"/>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#10b981" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`}/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-slate-950">{Math.round(overall)}%</span>
            <span className="text-xs font-medium text-slate-500">Overall</span>
          </div>
        </div>
        <div className="mt-3 w-full space-y-2 text-xs">
          {strongest && <p><span className="font-semibold text-emerald-700">Strength:</span> {strongest.label}</p>}
          {priority && <p><span className="font-semibold text-rose-700">Focus next:</span> {priority.label}</p>}
        </div>
      </div>

      <div className="grid content-center gap-x-6 gap-y-3 sm:grid-cols-2">
        {metrics.map((metric) => <div key={metric.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{metric.label}</span>
            <span className="shrink-0 font-bold text-slate-950">{metric.value === undefined ? "—" : `${Math.round(metric.value)}%`}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${metric.label}: ${status(metric.value)}`}>
            <div className={`h-full rounded-full ${tone(metric.value)}`} style={{ width: `${metric.value === undefined ? 0 : Math.max(2, Math.min(100, metric.value))}%` }}/>
          </div>
        </div>)}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Score legend">
      <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"/>Strong 75–100</span>
      <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-500"/>Developing 50–74</span>
      <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-rose-500"/>Focus 0–49</span>
    </div>
  </section>;
};

export default AssessmentInfographic;
