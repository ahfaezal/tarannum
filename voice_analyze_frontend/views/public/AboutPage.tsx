import React from "react";
import { useI18n } from "../../i18n";

const copy = {
  en: ["ABOUT TARANNUM.AI", "Technology that supports practice without replacing the teacher.", "Tarannum.ai helps learners listen to reference recitations, understand melodic contours and practise independently through a structured workflow.", "The assessment remains under validation. V2.3 is labelled an experimental score and is not an official result or participant ranking."],
  ms: ["TENTANG TARANNUM.AI", "Teknologi yang menyokong latihan tanpa menggantikan guru.", "Tarannum.ai membantu pelajar mendengar bacaan rujukan, memahami kontur melodi dan berlatih secara kendiri melalui aliran kerja yang tersusun.", "Penilaian masih dalam proses pengesahan. V2.3 dilabel sebagai skor eksperimen dan bukan keputusan rasmi atau kedudukan peserta."],
} as const;
const AboutPage: React.FC=()=> { const { language } = useI18n(); const c=copy[language]; return <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6"><p className="font-semibold text-emerald-700">{c[0]}</p><h1 className="mt-4 text-4xl font-bold">{c[1]}</h1><div className="mt-8 space-y-5 text-lg leading-8 text-slate-600"><p>{c[2]}</p><p>{c[3]}</p></div></article>; };
export default AboutPage;
