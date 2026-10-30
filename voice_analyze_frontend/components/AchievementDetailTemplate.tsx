import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Award, CalendarDays, Download, ExternalLink, MapPin, Quote, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AchievementGalleryItem, AchievementRecord } from "../data/achievements";

const AchievementDetailTemplate: React.FC<{ achievement: AchievementRecord }> = ({ achievement }) => {
  const [selected, setSelected] = useState<AchievementGalleryItem | null>(null);

  useEffect(() => {
    document.title = `${achievement.award} ${achievement.event} | Tarannum.ai`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", achievement.excerpt);
    return () => { document.title = "Tarannum AI Trainer"; };
  }, [achievement]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return <article className="bg-[#f7f4ea] text-slate-950">
    <section className="relative isolate min-h-[76vh] overflow-hidden bg-[#071d18] text-white">
      <img src={achievement.heroImage} alt={achievement.heroAlt} className="absolute inset-0 h-full w-full object-cover opacity-50" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#071d18] via-[#071d18]/90 to-[#071d18]/20" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#071d18] to-transparent" />
      <div className="relative mx-auto flex min-h-[76vh] max-w-7xl items-end px-5 py-16 sm:px-8 lg:py-24">
        <div className="max-w-4xl">
          <Link to="/pencapaian" className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur"><ArrowLeft size={16}/> Semua pencapaian</Link>
          <p className="flex items-center gap-2 text-sm font-black tracking-[.22em] text-amber-300"><Sparkles size={17}/>{achievement.eyebrow}</p>
          <p className="mt-5 inline-flex items-center gap-3 rounded-full bg-amber-300 px-5 py-2 text-lg font-black text-emerald-950"><Award size={22}/>{achievement.award}</p>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] sm:text-6xl lg:text-7xl">{achievement.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-50/85 sm:text-xl">{achievement.excerpt}</p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><CalendarDays size={17}/>{achievement.dateLabel}</span><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><MapPin size={17}/>{achievement.venue}</span></div>
        </div>
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
      <div><p className="text-sm font-black tracking-[.18em] text-emerald-700">TENTANG PENCAPAIAN</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Teknologi yang dinilai melalui nilai pendidikan dan kepakaran manusia.</h2>{achievement.introduction.map(p=><p key={p} className="mt-5 text-lg leading-8 text-slate-600">{p}</p>)}<div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6"><Quote className="text-amber-600"/><p className="mt-3 text-lg font-bold leading-8">“{achievement.theme}”</p><p className="mt-2 text-sm font-bold text-slate-500">Tema kNOVASI 2026</p></div></div>
      <dl className="grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-2">{achievement.facts.map(({label,value})=><div key={label} className="bg-white p-6"><dt className="text-xs font-black uppercase tracking-[.15em] text-emerald-700">{label}</dt><dd className="mt-2 font-bold leading-6">{value}</dd></div>)}</dl>
    </section>

    <section className="bg-emerald-950 py-16 text-white sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-8"><p className="text-sm font-black tracking-[.18em] text-amber-300">MAKNA PENGIKTIRAFAN</p><div className="mt-8 grid gap-5 md:grid-cols-3">{achievement.significance.map((item,index)=><div key={item} className="rounded-3xl border border-white/10 bg-white/[.06] p-7"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-300 font-black text-emerald-950">0{index+1}</span><p className="mt-5 text-lg font-bold leading-8 text-emerald-50/90">{item}</p></div>)}</div></div></section>

    <section className="bg-white py-16 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-3xl"><p className="text-sm font-black tracking-[.18em] text-emerald-700">GALERI kNOVASI 2026</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Dari ruang pameran ke pentas pengiktirafan.</h2><p className="mt-4 leading-7 text-slate-600">Klik gambar untuk paparan yang lebih besar.</p></div><div className="mt-10 grid auto-rows-[180px] gap-4 sm:grid-cols-2 lg:grid-cols-4">{achievement.gallery.map((image,index)=><button key={image.src} onClick={()=>setSelected(image)} className={`group relative overflow-hidden rounded-2xl bg-slate-100 text-left ${image.portrait?"row-span-2":""} ${index===0||index===3?"sm:col-span-2":""}`} aria-label={`Buka gambar: ${image.caption}`}><img src={image.src} alt={image.alt} loading={index<3?"eager":"lazy"} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-5 pb-4 pt-14 text-sm font-bold text-white opacity-0 transition group-hover:opacity-100">{image.caption}</span></button>)}</div></div></section>

    <section className="border-y border-amber-200 bg-amber-50 py-16 sm:py-24"><div className="mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.2fr_.8fr]"><a href={achievement.certificatePdf} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-3xl border border-amber-200 bg-white p-3 shadow-xl"><img src={achievement.certificateImage} alt={`Sijil ${achievement.award} ${achievement.event}`} className="w-full rounded-2xl transition duration-500 group-hover:scale-[1.015]"/></a><div><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300 text-emerald-950"><ShieldCheck size={30}/></div><p className="mt-6 text-sm font-black tracking-[.18em] text-emerald-700">SIJIL RASMI</p><h2 className="mt-3 text-3xl font-black">Pengiktirafan Pingat Emas.</h2><p className="mt-4 leading-7 text-slate-600">Dianugerahkan kepada <strong>{achievement.recipient}</strong> bagi inovasi Tarannum.ai di {achievement.event}.</p><a href={achievement.certificatePdf} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-6 py-4 font-black text-white">Buka sijil rasmi <ExternalLink size={18}/></a><a href={achievement.certificatePdf} download className="ml-3 mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-900 px-5 py-4 font-black text-emerald-950"><Download size={18}/> Muat turun</a></div></div></section>

    <section className="bg-amber-300"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-black tracking-[.15em] text-emerald-900">INOVASI UNTUK PEMBELAJARAN</p><h2 className="mt-2 text-3xl font-black">Terokai bagaimana Tarannum.ai menyokong latihan anda.</h2></div><Link to="/demo" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-6 py-4 font-black text-white">Lihat demonstrasi <ExternalLink size={18}/></Link></div></section>

    {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={()=>setSelected(null)}><button className="absolute right-5 top-5 rounded-full bg-white/10 p-3 text-white" onClick={()=>setSelected(null)} aria-label="Tutup gambar"><X/></button><figure className="max-w-6xl" onClick={event=>event.stopPropagation()}><img src={selected.src} alt={selected.alt} className="max-h-[82vh] w-auto rounded-2xl object-contain"/><figcaption className="mt-3 text-center text-sm text-white/80">{selected.caption}</figcaption></figure></div>}
  </article>;
};

export default AchievementDetailTemplate;
