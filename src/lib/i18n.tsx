import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { TRANSLATIONS } from './translations';

export type Lang = 'es' | 'en';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  /** Traduce un texto en español a inglés (o lo deja igual si no hay traducción / idioma es). */
  t: (es: string) => string;
}

const LangContext = createContext<LangContextValue | null>(null);
const STORAGE_KEY = 'champions-lang';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'es' ? saved : 'es';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState((l) => (l === 'es' ? 'en' : 'es'));
  // El propio texto español es la clave: si no hay traducción, se muestra en español.
  const t = (es: string) => (lang === 'en' ? TRANSLATIONS[es] ?? es : es);

  return <LangContext.Provider value={{ lang, setLang, toggle, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang debe usarse dentro de LanguageProvider');
  return ctx;
}
