import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n";

const copy = {
  en: {
    eyebrow: "LIGHTWEIGHT DEMO",
    title: "Explore the Tarannum.ai workflow before you practise.",
    cards: [["Audio Demo", "Listen to a sample reference recitation."], ["Pitch Graph Demo", "View a prepared example of a melodic contour."], ["Sample Result", "Understand how an experimental result is presented."]],
    notice: "This demo does not run production scoring or generate an official result.",
    action: "Start Training",
  },
  ms: {
    eyebrow: "DEMO RINGKAS",
    title: "Kenali aliran Tarannum.ai sebelum berlatih.",
    cards: [["Demo Audio", "Dengar contoh bacaan rujukan."], ["Demo Graf Pic", "Lihat contoh bentuk alunan yang telah disediakan."], ["Contoh Keputusan", "Fahami cara keputusan eksperimen dipaparkan."]],
    notice: "Demo ini tidak menjalankan penilaian produksi dan tidak menghasilkan keputusan rasmi.",
    action: "Mulakan Latihan",
  },
} as const;

const DemoPage: React.FC = () => {
  const { language } = useI18n();
  const content = copy[language];
  return <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><p className="font-semibold text-emerald-700">{content.eyebrow}</p><h1 className="mt-4 text-4xl font-bold">{content.title}</h1><div className="mt-10 grid gap-5 md:grid-cols-3">{content.cards.map(([h,p])=><div key={h} className="rounded-2xl border bg-white p-6"><div className="h-32 rounded-xl bg-slate-100"/><h2 className="mt-5 text-xl font-bold">{h}</h2><p className="mt-2 text-slate-600">{p}</p></div>)}</div><p className="mt-8 rounded-xl bg-amber-50 p-4 text-amber-900">{content.notice}</p><Link to="/training" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white">{content.action}</Link></section>;
};
export default DemoPage;
