import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, CalendarDays, MapPin } from "lucide-react";
import { achievements } from "../../data/achievements";

const AchievementsPage: React.FC = () => {
  useEffect(() => { document.title = "Pencapaian & Pengiktirafan | Tarannum.ai"; return () => { document.title = "Tarannum AI Trainer"; }; }, []);
  return <>
    <section className="bg-emerald-950 text-white"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><p className="flex items-center gap-2 text-sm font-black tracking-[.2em] text-amber-300"><Award size={19}/> ARKIB PENCAPAIAN</p><h1 className="mt-4 max-w-4xl text-4xl font-black sm:text-6xl">Inovasi, pengiktirafan dan perjalanan Tarannum.ai.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-50/75">Rekod rasmi pencapaian yang mengukuhkan usaha kami membina latihan tarannum berasaskan teknologi, bimbingan dan nilai pendidikan.</p></div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><div className="grid gap-8 lg:grid-cols-2">{achievements.map(item=><article key={item.slug} className="group overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><Link to={`/pencapaian/${item.slug}`} className="relative block overflow-hidden"><img src={item.heroImage} alt={item.heroAlt} className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.03]"/><span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-black text-emerald-950 shadow"><Award size={18}/>{item.award}</span></Link><div className="p-6 sm:p-8"><p className="text-xs font-black tracking-[.16em] text-emerald-700">{item.event}</p><h2 className="mt-3 text-2xl font-black sm:text-3xl"><Link to={`/pencapaian/${item.slug}`}>{item.title}</Link></h2><p className="mt-4 leading-7 text-slate-600">{item.excerpt}</p><div className="mt-5 space-y-2 text-sm font-semibold text-slate-600"><p className="flex items-center gap-2"><CalendarDays size={17} className="text-amber-600"/>{item.dateLabel}</p><p className="flex items-center gap-2"><MapPin size={17} className="text-amber-600"/>{item.venue}</p></div><Link to={`/pencapaian/${item.slug}`} className="mt-7 inline-flex items-center gap-2 font-black text-emerald-700">Lihat rekod pencapaian <ArrowRight size={18}/></Link></div></article>)}</div></section>
  </>;
};

export default AchievementsPage;
