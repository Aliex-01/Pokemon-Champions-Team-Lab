import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang, type Lang } from './i18n';

export const SITE_URL = 'https://champions-team-lab.netlify.app';
const SITE_NAME = 'Pokémon Champions Team Lab';

interface RouteMeta {
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
}

// Título y descripción propios por ruta: en una SPA, sin esto todas las URLs
// comparten metadatos y compiten entre sí en buscadores.
const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: {
      es: 'Constructor de Equipos VGC — Pokémon Champions Team Lab',
      en: 'VGC Team Builder — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Construye equipos de Pokémon Champions (VGC Reg M-B, dobles) con EVs en stat points, naturalezas, objetos y movimientos legales del formato.',
      en: 'Build Pokémon Champions teams (VGC Reg M-B, doubles) with stat-point EVs, natures, items and format-legal moves.',
    },
  },
  '/speed': {
    title: {
      es: 'Speed Tier VGC — Pokémon Champions Team Lab',
      en: 'VGC Speed Tier — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Compara la velocidad de tu equipo con el meta de Champions: Tailwind ×2, Trick Room, Scarf y benchmarks neutros.',
      en: "Compare your team's Speed against the Champions meta: Tailwind ×2, Trick Room, Scarf and neutral benchmarks.",
    },
  },
  '/builds': {
    title: {
      es: 'Builds del Meta VGC — Pokémon Champions Team Lab',
      en: 'Meta Builds VGC — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Sets más usados del meta de Pokémon Champions: spreads de EVs, objetos, habilidades, naturalezas y compañeros por porcentaje de uso.',
      en: 'Most-used Pokémon Champions meta sets: EV spreads, items, abilities, natures and teammates by usage.',
    },
  },
  '/coverage': {
    title: {
      es: 'Cobertura de Tipos VGC — Pokémon Champions Team Lab',
      en: 'Type Coverage VGC — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Analiza la cobertura ofensiva y defensiva de tu equipo de Champions, con habilidades y debilidades compartidas.',
      en: "Analyze your Champions team's offensive and defensive type coverage, including abilities and shared weaknesses.",
    },
  },
  '/damage': {
    title: {
      es: 'Calculadora de Daño VGC — Pokémon Champions Team Lab',
      en: 'Damage Calculator VGC — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Calculadora de daño de Pokémon Champions (Gen 9, dobles): clima, terreno, pantallas, objetivo único o de área y sets del meta.',
      en: 'Pokémon Champions damage calculator (Gen 9, doubles): weather, terrain, screens, single or spread target and meta sets.',
    },
  },
  '/analysis': {
    title: {
      es: 'Análisis de Equipo VGC — Pokémon Champions Team Lab',
      en: 'Team Analysis VGC — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Análisis del equipo de Champions: arquetipo, puntuación por categoría, roles, sinergias, amenazas del meta y avisos.',
      en: 'Champions team analysis: archetype, category score, roles, synergies, meta threats and warnings.',
    },
  },
  '/replays': {
    title: {
      es: 'Análisis de Repeticiones VGC — Pokémon Champions Team Lab',
      en: 'Replay Analysis VGC — Pokémon Champions Team Lab',
    },
    desc: {
      es: 'Importa repeticiones de Pokémon Showdown y analiza tus resultados: win-rate por equipo, leads, bring-rate y rivales más enfrentados.',
      en: 'Import Pokémon Showdown replays and analyze your results: win rate by team, leads, bring rate and most-faced opponents.',
    },
  },
};

const FALLBACK: RouteMeta = ROUTE_META['/'];

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Actualiza title, description, canonical y Open Graph/Twitter según la ruta y el idioma. */
export function useRouteSeo() {
  const { pathname } = useLocation();
  const { lang } = useLang();

  useEffect(() => {
    const meta = ROUTE_META[pathname] ?? FALLBACK;
    const title = meta.title[lang];
    const desc = meta.desc[lang];
    const url = SITE_URL + (pathname === '/' ? '' : pathname);

    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', desc);
    setLink('canonical', url);

    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[property="og:locale"]', 'property', 'og:locale', lang === 'es' ? 'es_ES' : 'en_US');
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);

    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', desc);
  }, [pathname, lang]);
}
