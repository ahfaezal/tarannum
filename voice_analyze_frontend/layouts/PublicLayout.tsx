import React, { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { LanguageSelector, useI18n } from "../i18n";

const PublicLayout: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const links = [["/", t("home")], ["/about", t("about")], ["/how-to-use", t("howToUse")], ["/demo", t("demo")], ["/contact", t("contact")]];
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-3 font-bold"><img src="/images/logo-web.jpg" width="44" height="44" alt="Tarannum.ai logo" className="h-11 w-11 rounded-full object-cover shadow-sm"/><span>Tarannum.ai</span></Link>
        <nav className="hidden items-center gap-6 lg:flex">{links.map(([to,label])=><NavLink key={to} to={to} className={({isActive})=>`text-sm font-medium ${isActive?"text-emerald-700":"text-slate-600 hover:text-slate-900"}`}>{label}</NavLink>)}</nav>
        <div className="hidden items-center gap-2 lg:flex"><LanguageSelector/><Link to="/login" className="px-4 py-2 text-sm font-semibold text-slate-700">{t("login")}</Link><Link to="/training" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">{t("startTraining")}</Link></div>
        <button className="rounded-lg p-2 lg:hidden" onClick={()=>setOpen(!open)} aria-label="Open menu">{open?<X/>:<Menu/>}</button>
      </div>
      {open && <nav className="border-t border-slate-100 bg-white px-4 py-4 lg:hidden">{links.map(([to,label])=><NavLink key={to} to={to} onClick={()=>setOpen(false)} className="block rounded-lg px-3 py-3 font-medium text-slate-700">{label}</NavLink>)}<div className="mt-3 grid grid-cols-2 gap-2"><Link to="/login" className="rounded-xl border px-4 py-3 text-center font-semibold">{t("login")}</Link><Link to="/training" className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white">{t("training")}</Link></div></nav>}
    </header>
    <main><Outlet /></main>
    <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:px-6 md:flex-row md:justify-between"><span>© Tarannum Technologies</span><span>{t("aiNotice")}</span></div></footer>
  </div>;
};
export default PublicLayout;
