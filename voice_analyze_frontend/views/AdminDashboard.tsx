import React from "react";
import { Activity, BookOpenCheck, Settings2, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";

const adminSections = [
  {
    to: "/admin/users",
    title: "Users and Qaris",
    description: "Manage user roles, approvals and Qari access.",
    icon: Users,
  },
  {
    to: "/admin/presets",
    title: "Reference Presets",
    description: "Manage approved reference and training presets.",
    icon: BookOpenCheck,
  },
  {
    to: "/admin/monitoring",
    title: "System Monitoring",
    description: "Review sessions, usage, processing and platform health.",
    icon: Activity,
  },
];

const AdminDashboard: React.FC = () => (
  <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-950 to-slate-900 p-6 text-white shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-emerald-500/20 p-3 text-emerald-300">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Administration</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Tarannum.ai Admin Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Select a workspace below. Detailed data loads only after a workspace is opened, keeping this page fast and responsive.
          </p>
        </div>
      </div>
    </div>

    <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Admin workspaces">
      {adminSections.map(({ to, title, description, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100">
            <Icon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Settings2 className="h-4 w-4" /> Open workspace
          </div>
        </Link>
      ))}
    </section>
  </div>
);

export default AdminDashboard;
