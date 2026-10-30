import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { programs } from "../../data/programs";

const ProgramsPage: React.FC = () => {
  useEffect(() => { document.title = "Program & Aktiviti | Tarannum.ai"; return () => { document.title = "Tarannum AI Trainer"; }; }, []);
  return <>
    <section className="bg-emerald-950 text-white"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><p className="text-sm font-black tracking-[.2em] text-amber-300">ARKIB TARANNUM.AI</p><h1 className="mt-4 max-w-4xl text-4xl font-black sm:text-6xl">Program, pembelajaran dan impak yang dirakam.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-50/75">Rekod program yang dilaksanakan bersama Qari, institusi dan komuniti—menggabungkan bimbingan bersemuka dengan teknologi latihan Tarannum.ai.</p></div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><div className="grid gap-8 lg:grid-cols-2">{programs.map(program=><article key={program.slug} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><Link to={`/program/${program.slug}`}><img src={program.heroImage} alt={program.heroAlt} className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.02]"/></Link><div className="p-6 sm:p-8"><p className="text-xs font-black tracking-[.16em] text-emerald-700">{program.category}</p><h2 className="mt-3 text-2xl font-black sm:text-3xl"><Link to={`/program/${program.slug}`}>{program.title}</Link></h2><p className="mt-4 leading-7 text-slate-600">{program.excerpt}</p><div className="mt-5 space-y-2 text-sm font-semibold text-slate-600"><p className="flex items-center gap-2"><CalendarDays size={17} className="text-emerald-600"/>{program.dateLabel}</p><p className="flex items-center gap-2"><MapPin size={17} className="text-emerald-600"/>{program.location}</p></div><Link to={`/program/${program.slug}`} className="mt-7 inline-flex items-center gap-2 font-black text-emerald-700">Lihat rekod program <ArrowRight size={18}/></Link></div></article>)}</div></section>
  </>;
};

export default ProgramsPage;
