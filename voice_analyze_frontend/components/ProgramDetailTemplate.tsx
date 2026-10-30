import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Mic2, UserRound, X } from "lucide-react";
import type { ProgramGalleryItem, ProgramRecord } from "../data/programs";

const ProgramDetailTemplate: React.FC<{ program: ProgramRecord }> = ({ program }) => {
  const [selected, setSelected] = useState<ProgramGalleryItem | null>(null);

  useEffect(() => {
    document.title = `${program.title} | Tarannum.ai`;
    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute("content", program.excerpt);
    return () => { document.title = "Tarannum AI Trainer"; };
  }, [program]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return <article className="bg-[#f7f6f1] text-slate-950">
    <section className="relative isolate min-h-[72vh] overflow-hidden bg-emerald-950 text-white">
      <img src={program.heroImage} alt={program.heroAlt} className="absolute inset-0 h-full w-full object-cover opacity-45" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-950 via-emerald-950/80 to-emerald-950/20" />
      <div className="relative mx-auto flex min-h-[72vh] max-w-7xl items-end px-5 py-16 sm:px-8 lg:py-24">
        <div className="max-w-4xl">
          <Link to="/program" className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur"><ArrowLeft size={16}/> Semua program</Link>
          <p className="text-sm font-black tracking-[.22em] text-amber-300">{program.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] sm:text-6xl lg:text-7xl">{program.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-emerald-50/85 sm:text-xl">{program.excerpt}</p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><CalendarDays size={17}/>{program.dateLabel}</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><MapPin size={17}/>{program.location}</span>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
      <div><p className="text-sm font-black tracking-[.18em] text-emerald-700">TENTANG PROGRAM</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Bimbingan tradisi diperkukuh dengan latihan digital.</h2>{program.introduction.map(p=><p key={p} className="mt-5 text-lg leading-8 text-slate-600">{p}</p>)}</div>
      <dl className="grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-2">{program.facts.map(({label,value},index)=><div key={label} className="bg-white p-6"><dt className="text-xs font-black uppercase tracking-[.15em] text-emerald-700">{label}</dt><dd className="mt-2 font-bold leading-6">{value}</dd>{index===3 && <UserRound className="mt-5 text-amber-500"/>}</div>)}</dl>
    </section>

    <section className="bg-emerald-950 py-16 text-white sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-8"><p className="text-sm font-black tracking-[.18em] text-amber-300">IMPAK PROGRAM</p><div className="mt-8 grid gap-5 md:grid-cols-3">{program.outcomes.map(item=><div key={item.label} className="rounded-3xl border border-white/10 bg-white/[.06] p-7"><p className="text-4xl font-black text-amber-300">{item.value}</p><h3 className="mt-3 text-xl font-black">{item.label}</h3><p className="mt-3 leading-7 text-emerald-50/70">{item.description}</p></div>)}</div></div></section>

    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24"><p className="text-center text-sm font-black tracking-[.18em] text-emerald-700">PERJALANAN PROGRAM</p><h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-black sm:text-4xl">Satu hari, satu aliran pembelajaran yang lengkap.</h2><div className="mt-10 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-sm">{program.journey.map(item=><div key={`${item.time}-${item.title}`} className="grid gap-2 p-6 sm:grid-cols-[140px_230px_1fr] sm:items-center"><p className="font-black text-emerald-700">{item.time}</p><h3 className="font-black">{item.title}</h3><p className="text-slate-600">{item.description}</p></div>)}</div></section>

    <section className="bg-white py-16 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-3xl"><p className="text-sm font-black tracking-[.18em] text-emerald-700">GALERI PROGRAM</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Detik pembelajaran, latihan dan penghargaan.</h2><p className="mt-4 leading-7 text-slate-600">Klik gambar untuk paparan yang lebih besar.</p></div><div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">{program.gallery.map((image,index)=><button key={image.src} onClick={()=>setSelected(image)} className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-slate-100 text-left" aria-label={`Buka gambar: ${image.caption}`}><img src={image.src} alt={image.alt} loading={index<3?"eager":"lazy"} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-105"/><span className="absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-black/85 to-transparent px-5 pb-4 pt-12 text-sm font-bold text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">{image.caption}</span></button>)}</div></div></section>

    <section className="bg-amber-300"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-black tracking-[.15em] text-emerald-900">PROGRAM BERSAMA TARANNUM.AI</p><h2 className="mt-2 text-3xl font-black">Berminat membawa latihan ini ke organisasi anda?</h2></div><Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-6 py-4 font-black text-white">Hubungi kami <ArrowRight size={18}/></Link></div></section>

    {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={()=>setSelected(null)}><button className="absolute right-5 top-5 rounded-full bg-white/10 p-3 text-white" onClick={()=>setSelected(null)} aria-label="Tutup gambar"><X/></button><figure className="max-w-6xl" onClick={event=>event.stopPropagation()}><img src={selected.src} alt={selected.alt} className="max-h-[82vh] w-auto rounded-2xl object-contain"/><figcaption className="mt-3 text-center text-sm text-white/80">{selected.caption}</figcaption></figure></div>}
  </article>;
};

export default ProgramDetailTemplate;
