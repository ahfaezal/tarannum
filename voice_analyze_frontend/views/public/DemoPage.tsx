import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, Headphones, Mic2 } from "lucide-react";
import { useI18n } from "../../i18n";

const copy = {
  en: {
    eyebrow: "INTERACTIVE DEMO",
    title: "Experience the Tarannum.ai workflow before creating an account.",
    intro: "Choose an Admin-approved public reference, practise with its pitch graph, record your recitation and receive a sample overall score.",
    cards: [["Guided Training", "Listen and follow the approved Qari reference."], ["Demo Recording", "Record one recitation using your microphone."], ["Overall Score", "View your Experimental Score V2.3 without the detailed breakdown."]],
    notice: "The demo score supports product exploration only. Detailed analysis, progress history and coaching guidance require an account.",
    action: "Try Interactive Demo",
  },
  ms: {
    eyebrow: "DEMO INTERAKTIF",
    title: "Cuba aliran Tarannum.ai sebelum membuka akaun.",
    intro: "Pilih rujukan awam yang diluluskan Admin, berlatih menggunakan graf pitch, rakam bacaan dan terima contoh markah keseluruhan.",
    cards: [["Latihan Berpanduan", "Dengar dan ikuti bacaan rujukan Qari yang diluluskan."], ["Rakaman Demo", "Rakam satu bacaan menggunakan mikrofon anda."], ["Markah Keseluruhan", "Lihat Experimental Score V2.3 tanpa pecahan terperinci."]],
    notice: "Markah demo hanya untuk mencuba produk. Analisis terperinci, sejarah kemajuan dan panduan memerlukan akaun.",
    action: "Cuba Demo Interaktif",
  },
} as const;

const DemoPage: React.FC = () => {
  const { language } = useI18n();
  const content = copy[language];
  const icons = [Headphones, Mic2, BarChart3];
  return <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><p className="font-semibold text-emerald-700">{content.eyebrow}</p><h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight">{content.title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{content.intro}</p><div className="mt-10 grid gap-5 md:grid-cols-3">{content.cards.map(([h,p], index)=>{const Icon=icons[index]; return <div key={h} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={24}/></div><h2 className="mt-5 text-xl font-bold">{h}</h2><p className="mt-2 leading-6 text-slate-600">{p}</p></div>})}</div><p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{content.notice}</p><Link to="/demo/interactive" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">{content.action}</Link></section>;
};
export default DemoPage;
