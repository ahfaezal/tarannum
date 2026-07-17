import React from "react";
import { useI18n } from "../../i18n";

const ContactPage: React.FC = () => {
  const { language } = useI18n();
  const content = language === "ms" ? {
    title: "Hubungi Kami",
    description: "Untuk pertanyaan berkaitan sesi latihan, akaun atau penggunaan Tarannum.ai, hubungi Tarannum Technologies. Borang sokongan dalam aplikasi akan ditambah selepas sistem pemantauan tersedia.",
  } : {
    title: "Contact Us",
    description: "For enquiries about training sessions, accounts or using Tarannum.ai, contact Tarannum Technologies. An in-app support form will be added once the monitoring system is available.",
  };
  return <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6"><h1 className="text-4xl font-bold">{content.title}</h1><p className="mt-5 text-lg leading-8 text-slate-600">{content.description}</p><div className="mt-8 rounded-2xl border bg-white p-6"><p className="font-bold">Tarannum Technologies</p><p className="mt-2 text-slate-600">Bandar Baru Bangi, Selangor</p></div></section>;
};
export default ContactPage;
