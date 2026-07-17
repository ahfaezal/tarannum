import React, { createContext, useContext, useMemo, useState } from "react";

export type Language = "en" | "ms";

const messages = {
  en: {
    home: "Home", about: "About", howToUse: "How to Use", demo: "Demo", contact: "Contact",
    login: "Log in", logout: "Log out", startTraining: "Start Training", training: "Training",
    recording: "Recording & Assessment", progress: "Progress", profile: "Profile", dashboard: "Dashboard",
    loading: "Loading page", aiNotice: "AI supports practice and does not replace a qualified teacher's assessment.",
  },
  ms: {
    home: "Utama", about: "Tentang", howToUse: "Cara Menggunakan", demo: "Demo", contact: "Hubungi",
    login: "Log masuk", logout: "Log keluar", startTraining: "Mulakan Latihan", training: "Latihan",
    recording: "Rakaman & Penilaian", progress: "Kemajuan", profile: "Profil", dashboard: "Dashboard",
    loading: "Memuatkan halaman", aiNotice: "AI membantu latihan dan tidak menggantikan penilaian guru yang berkelayakan.",
  },
} as const;

type MessageKey = keyof typeof messages.en;
type I18nValue = { language: Language; setLanguage: (language: Language) => void; t: (key: MessageKey) => string };
const I18nContext = createContext<I18nValue | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem("tarannum_language") === "ms" ? "ms" : "en");
  const setLanguage = (next: Language) => { localStorage.setItem("tarannum_language", next); setLanguageState(next); };
  const value = useMemo(() => ({ language, setLanguage, t: (key: MessageKey) => messages[language][key] }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
};

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useI18n();
  return <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-700">
    <option value="en">EN</option><option value="ms">BM</option>
  </select>;
};
