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

// Palabras menores (preposiciones, artículos y conjunciones) que NO se ponen en
// mayúscula cuando van en medio de un texto. La primera palabra siempre va en mayúscula.
const MINOR_WORDS = new Set([
  // Español
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u',
  'a', 'al', 'ante', 'con', 'en', 'para', 'por', 'sin', 'sobre', 'tras', 'entre', 'hacia',
  'hasta', 'desde', 'según', 'lo',
  // Inglés
  'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'as', 'vs',
]);

/** Cambia la primera letra de una palabra a mayúscula (respeta prefijos como «(» o «+»). */
function upperFirstLetter(token: string): string {
  if (token.includes('@')) return token; // no tocar emails/handles
  const i = token.search(/\p{L}/u);
  return i === -1 ? token : token.slice(0, i) + token[i].toUpperCase() + token.slice(i + 1);
}

/** Cambia la primera letra de una palabra a minúscula (para preposiciones en medio). */
function lowerFirstLetter(token: string): string {
  const i = token.search(/\p{L}/u);
  return i === -1 ? token : token.slice(0, i) + token[i].toLowerCase() + token.slice(i + 1);
}

/** Pone la inicial de cada palabra en mayúscula, salvo preposiciones/artículos en medio. */
function titleCase(text: string): string {
  return text
    .split(' ')
    .map((token, idx) => {
      if (token === '') return token;
      const plain = token.toLowerCase().replace(/[^\p{L}]/gu, '');
      if (idx > 0 && MINOR_WORDS.has(plain)) return lowerFirstLetter(token);
      return upperFirstLetter(token);
    })
    .join(' ');
}

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
  const t = (es: string) => titleCase(lang === 'en' ? TRANSLATIONS[es] ?? es : es);

  return <LangContext.Provider value={{ lang, setLang, toggle, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang debe usarse dentro de LanguageProvider');
  return ctx;
}
