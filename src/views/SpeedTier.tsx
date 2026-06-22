import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTeam } from '../store/teamStore';
import { calcAllStats } from '../lib/stats';
import { getSpecies, localizeName } from '../lib/championsData';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { PokemonSprite } from '../components/PokemonSprite';
import { useLang } from '../lib/i18n';
import type { ChampionsData, EvSpread, SpeciesData, MetaBuildsData } from '../types/pokemon';

interface SpeedTierProps {
  data: ChampionsData;
}

const CUSTOM_KEY = 'speedtier-custom';

function loadCustom(): { include: string[]; exclude: string[] } {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { include: [], exclude: [] };
}

// Color por benchmark para distinguir las variantes de un vistazo.
const BENCHMARK_COLOR: Record<string, string> = {
  'Máx +Nat': 'text-green-400',
  'Máx neutra': 'text-blue-400',
  '0 neutra': 'text-amber-400',
  '0 −Nat': 'text-red-400',
};

interface Entry {
  key: string;
  name: string;
  speciesId: string;
  types: string[];
  baseSpe: number;
  speed: number;
  variant: string;
  isTeam: boolean;
  /** Habilidad (EN) que dobla/aumenta la velocidad en esta fila extra. */
  boostAbility?: string;
  /** Objeto (EN) que aumenta la velocidad en esta fila extra (Choice Scarf). */
  boostItem?: string;
}

// Habilidades que multiplican la Velocidad bajo una condición (no Speed Boost).
const SPEED_ABILITIES: Record<string, number> = {
  Chlorophyll: 2, 'Swift Swim': 2, 'Sand Rush': 2, 'Slush Rush': 2,
  'Surge Surfer': 2, Unburden: 2, 'Quick Feet': 1.5,
};

interface GroupRow {
  key: string;
  speed: number;
  items: Entry[];
  hasTeam: boolean;
}

interface TeamSummary {
  key: string;
  name: string;
  speciesId: string;
  speed: number;
  scarfNote: string;
  position: number;
  faster: number;
  tie: number;
  slower: number;
  total: number;
}

// Tiers que se muestran en la tabla de referencia.
const KEPT_TIERS = new Set(['S', 'A', 'B']);

// Pokémon de otros tiers que se incluyen igualmente (por interés del usuario).
const EXTRA_INCLUDE = new Set(['ninetales', 'ninetalesalola', 'hydrapple']);

// Pokémon que se excluyen de la tabla.
// (aegislashblade se omite: comparte velocidad con la base Aegislash, que la representa).
const EXTRA_EXCLUDE = new Set([
  'furfrou', 'ditto', 'aegislashblade',
  'pikachu', 'stunfisk', 'stunfiskgalar', 'musharna', 'pangoro',
  'glaceon', 'flareon', 'houndstone', 'slurpuff', 'qwilfish',
  'gourgeist', 'gourgeistsmall', 'gourgeistlarge', 'gourgeistsuper',
]);

// Formas electrodoméstico de Rotom: misma velocidad, se muestran como una sola fila.
const ROTOM_APPLIANCE = new Set(['rotomheat', 'rotomwash', 'rotomfrost', 'rotomfan', 'rotommow']);

// Toda la familia Slowbro/Slowking (misma velocidad) se trata como un solo Pokémon.
const SLOW_FAMILY = new Set(['slowbro', 'slowbrogalar', 'slowbromega', 'slowking', 'slowkinggalar']);

type Weather = 'none' | 'sun' | 'rain' | 'snow' | 'sand';

const MAX_IVS: EvSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

// Habilidad que duplica la Velocidad bajo cada clima.
const WEATHER_SPEED_ABILITY: Record<Exclude<Weather, 'none'>, string> = {
  sun: 'Chlorophyll',
  rain: 'Swift Swim',
  snow: 'Slush Rush',
  sand: 'Sand Rush',
};

const WEATHER_LABEL: Record<Exclude<Weather, 'none'>, string> = {
  sun: '☀ Sol',
  rain: '🌧 Lluvia',
  snow: '❄ Nieve',
  sand: '☷ Arena',
};

/** Velocidad a nivel 50 con la inversión y naturaleza dadas (modo champions = stat points). */
function speedOf(base: EvSpread, spe: number, nature: string): number {
  return calcAllStats(base, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe }, MAX_IVS, nature, 50, 'champions').spe;
}

const BENCHMARKS: { spe: number; nature: string; label: string; neutral: boolean }[] = [
  { spe: 32, nature: 'Jolly', label: 'Máx +Nat', neutral: false },
  { spe: 32, nature: 'Docile', label: 'Máx neutra', neutral: true },
  { spe: 0, nature: 'Docile', label: '0 neutra', neutral: true },
  { spe: 0, nature: 'Brave', label: '0 −Nat', neutral: false },
];

/** Representante preferido al colapsar formas: forma base (no mega, nombre más corto). */
function preferRep(a: { isMega?: boolean; name: string }, b: { isMega?: boolean; name: string }) {
  if (!!a.isMega !== !!b.isMega) return a.isMega ? b : a;
  return a.name.length <= b.name.length ? a : b;
}

export function SpeedTierView({ data }: SpeedTierProps) {
  const { activeTeam } = useTeam();
  const { t, lang } = useLang();
  const [tailwind, setTailwind] = useState(false);
  const [weather, setWeather] = useState<Weather>('none');
  const [trickRoom, setTrickRoom] = useState(false);
  const [unburden, setUnburden] = useState(false);
  const [showNeutral, setShowNeutral] = useState(false);
  const [showAbilities, setShowAbilities] = useState(false);
  const [showScarf, setShowScarf] = useState(false);
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  const [userInclude, setUserInclude] = useState<Set<string>>(() => new Set(loadCustom().include));
  const [userExclude, setUserExclude] = useState<Set<string>>(() => new Set(loadCustom().exclude));

  useEffect(() => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify({ include: [...userInclude], exclude: [...userExclude] }));
  }, [userInclude, userExclude]);

  const addPokemon = (id: string) => {
    setUserInclude((s) => new Set(s).add(id));
    setUserExclude((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const removePokemon = (id: string) => {
    setUserExclude((s) => new Set(s).add(id));
    setUserInclude((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const resetCustom = () => { setUserInclude(new Set()); setUserExclude(new Set()); };

  const benchmarks = showNeutral ? BENCHMARKS : BENCHMARKS.filter((b) => !b.neutral);

  const { groups, summary, shownIds } = useMemo<{ groups: GroupRow[]; summary: TeamSummary[]; shownIds: Set<string> }>(() => {
    const entries: Entry[] = [];

    // Tus Pokémon con la velocidad de su spread (Tailwind y clima solo afectan aquí).
    for (const p of activeTeam?.pokemon ?? []) {
      if (!p.speciesId) continue;
      const sp = getSpecies(p.speciesId);
      if (!sp) continue;
      const baseSpe = calcAllStats(sp.baseStats, p.evs, p.ivs, p.nature, 50, p.evMode ?? 'champions').spe;
      const weatherBoost = weather !== 'none' && p.ability === WEATHER_SPEED_ABILITY[weather];
      const unburdenBoost = unburden && p.ability === 'Unburden';
      const envMult = (tailwind ? 2 : 1) * (weatherBoost ? 2 : 1) * (unburdenBoost ? 2 : 1);
      const baseTags = [
        `${p.nature}${p.evs.spe ? ` · ${p.evs.spe} Spe` : ''}`,
        tailwind ? '+Tailwind' : '',
        weatherBoost ? `+${WEATHER_LABEL[weather].split(' ')[1]}` : '',
        unburdenBoost ? `+${localizeName('abilities', 'Unburden', lang)}` : '',
      ].filter(Boolean).join(' ');

      // Con Choice Scarf: dos filas (con la Scarf y sin ella, por Desarme/Truco).
      const scarfVariants = p.item === 'Choice Scarf'
        ? [{ mult: 1.5, label: ' · con Scarf' }, { mult: 1, label: ' · sin Scarf' }]
        : [{ mult: 1, label: '' }];

      for (const sv of scarfVariants) {
        entries.push({
          key: `team-${p.slotId}${sv.label}`,
          name: p.speciesName,
          speciesId: p.speciesId,
          types: sp.types,
          baseSpe: sp.baseStats.spe,
          speed: Math.floor(baseSpe * envMult * sv.mult),
          variant: `${baseTags}${sv.label}`,
          isTeam: true,
        });
      }
    }

    // Pokémon de referencia incluidos (S/A/B + extras, sin exclusiones ni colapsos especiales).
    const isIncluded = (sp: ChampionsData['species'][number]) =>
      !EXTRA_EXCLUDE.has(sp.id) &&
      !userExclude.has(sp.id) &&
      !ROTOM_APPLIANCE.has(sp.id) &&
      !SLOW_FAMILY.has(sp.id) &&
      (KEPT_TIERS.has(sp.tier ?? '') || EXTRA_INCLUDE.has(sp.id) || userInclude.has(sp.id));

    // Colapsa formas del mismo Pokémon (mismo nº de dex) que comparten velocidad base
    // (megas con misma velocidad, Tauros de Paldea, Basculegion ♂/♀, etc.).
    const collapseSkip = new Set<string>();
    const rep = new Map<string, ChampionsData['species'][number]>();
    for (const sp of data.species) {
      if (!isIncluded(sp)) continue;
      const k = `${sp.num}-${sp.baseStats.spe}`;
      const cur = rep.get(k);
      if (!cur) { rep.set(k, sp); continue; }
      const keep = preferRep(cur, sp) === cur ? cur : sp;
      collapseSkip.add(keep === cur ? sp.id : cur.id);
      rep.set(k, keep);
    }

    // % de uso de Choice Scarf según los datos de Smogon (por id de Pokémon).
    const scarfPct = (id: string) =>
      builds?.pokemon?.[id]?.items.find((it) => it.name === 'Choice Scarf')?.pct ?? 0;

    // 4 entradas (o menos según toggle) por cada Pokémon del formato.
    for (const sp of data.species) {
      if (!isIncluded(sp) || collapseSkip.has(sp.id)) continue;
      // Habilidad que aumenta la velocidad (Clorofila, Nado Rápido, etc.).
      const spdAbility = sp.abilities?.find((a) => SPEED_ABILITIES[a]);
      for (const b of benchmarks) {
        entries.push({
          key: `${sp.id}-${b.label}`,
          name: sp.name,
          speciesId: sp.id,
          types: sp.types,
          baseSpe: sp.baseStats.spe,
          speed: speedOf(sp.baseStats, b.spe, b.nature),
          variant: b.label,
          isTeam: false,
        });
      }
      // Filas extra con el aumento de la habilidad (siempre, no según el clima).
      // Solo con inversión en Velocidad (sin las de 0 EVs ni naturaleza negativa).
      if (spdAbility && showAbilities) {
        const mult = SPEED_ABILITIES[spdAbility];
        for (const b of benchmarks) {
          if (b.spe === 0) continue;
          entries.push({
            key: `${sp.id}-${b.label}-${spdAbility}`,
            name: sp.name,
            speciesId: sp.id,
            types: sp.types,
            baseSpe: sp.baseStats.spe,
            speed: Math.floor(speedOf(sp.baseStats, b.spe, b.nature) * mult),
            variant: b.label,
            isTeam: false,
            boostAbility: spdAbility,
          });
        }
      }
      // Filas extra con Choice Scarf (×1.5) si es tier S/A y su uso supera el 20%
      // (Garchomp se incluye como excepción; Floette-Eternal se excluye: su tier es
      // por la mega, no por la forma base).
      if (showScarf && sp.id !== 'floetteeternal' && (sp.tier === 'S' || sp.tier === 'A') && (scarfPct(sp.id) > 20 || sp.id === 'garchomp')) {
        for (const b of benchmarks) {
          if (b.spe === 0) continue;
          entries.push({
            key: `${sp.id}-${b.label}-scarf`,
            name: sp.name,
            speciesId: sp.id,
            types: sp.types,
            baseSpe: sp.baseStats.spe,
            speed: Math.floor(speedOf(sp.baseStats, b.spe, b.nature) * 1.5),
            variant: b.label,
            isTeam: false,
            boostItem: 'Choice Scarf',
          });
        }
      }
    }

    // Rotom electrodoméstico colapsado (todas comparten velocidad).
    const appliance = data.species.find((s) => ROTOM_APPLIANCE.has(s.id));
    if (appliance) {
      for (const b of benchmarks) {
        entries.push({
          key: `rotom-appliance-${b.label}`,
          name: 'Rotom (electrodom.)',
          speciesId: 'rotom',
          types: ['Electric'],
          baseSpe: appliance.baseStats.spe,
          speed: speedOf(appliance.baseStats, b.spe, b.nature),
          variant: b.label,
          isTeam: false,
        });
      }
      // Rotom como tier A: Choice Scarf según el uso de la forma Horno.
      if (showScarf && scarfPct('rotomheat') > 20) {
        for (const b of benchmarks) {
          if (b.spe === 0) continue;
          entries.push({
            key: `rotom-appliance-${b.label}-scarf`,
            name: 'Rotom (electrodom.)',
            speciesId: 'rotom',
            types: ['Electric'],
            baseSpe: appliance.baseStats.spe,
            speed: Math.floor(speedOf(appliance.baseStats, b.spe, b.nature) * 1.5),
            variant: b.label,
            isTeam: false,
            boostItem: 'Choice Scarf',
          });
        }
      }
    }

    // Familia Slowbro/Slowking colapsada (todas comparten velocidad).
    const slow = data.species.find((s) => SLOW_FAMILY.has(s.id));
    if (slow) {
      for (const b of benchmarks) {
        entries.push({
          key: `slow-family-${b.label}`,
          name: 'Slowbro / Slowking',
          speciesId: 'slowbro',
          types: ['Water', 'Psychic'],
          baseSpe: slow.baseStats.spe,
          speed: speedOf(slow.baseStats, b.spe, b.nature),
          variant: b.label,
          isTeam: false,
        });
      }
    }

    const out: GroupRow[] = [];

    // Tus Pokémon siempre en filas en solitario.
    for (const e of entries) {
      if (e.isTeam) out.push({ key: e.key, speed: e.speed, items: [e], hasTeam: true });
    }

    // El resto agrupados por velocidad BASE + benchmark (solo se juntan los que
    // comparten velocidad base, no los que coinciden por casualidad). Hasta 3 por fila.
    const byKey = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.isTeam) continue;
      const k = `${e.baseSpe}-${e.variant}-${e.boostAbility ?? ''}-${e.boostItem ?? ''}`;
      const arr = byKey.get(k);
      if (arr) arr.push(e);
      else byKey.set(k, [e]);
    }
    for (const [k, items] of byKey) {
      const speed = items[0].speed;
      for (let i = 0; i < items.length; i += 4) {
        out.push({ key: `${k}-${i}`, speed, items: items.slice(i, i + 4), hasTeam: false });
      }
    }

    // Ordenar por velocidad; en empate, tu equipo primero.
    out.sort((a, b) => {
      const d = trickRoom ? a.speed - b.speed : b.speed - a.speed;
      return d !== 0 ? d : Number(b.hasTeam) - Number(a.hasTeam);
    });

    // Rango de velocidad (mín 0 −Nat … máx +Nat) de cada amenaza del formato.
    const threatRange = new Map<string, { min: number; max: number }>();
    for (const e of entries) {
      if (e.isTeam || e.boostAbility || e.boostItem) continue;
      const cur = threatRange.get(e.speciesId) ?? { min: Infinity, max: -Infinity };
      cur.min = Math.min(cur.min, e.speed);
      cur.max = Math.max(cur.max, e.speed);
      threatRange.set(e.speciesId, cur);
    }
    const threats = [...threatRange.values()];

    // Resumen: comparamos tu velocidad contra el RANGO de cada amenaza.
    // supera = ganas incluso a su máximo · pierde = ni a su mínimo llegas · resto = depende de EVs.
    const summary: TeamSummary[] = entries
      .filter((e) => e.isTeam && !e.variant.includes('sin Scarf'))
      .map((e) => {
        let faster = 0, slower = 0, depends = 0;
        for (const t of threats) {
          // Bajo Trick Room actúa antes el más lento, así que se invierte.
          const beats = trickRoom ? e.speed < t.min : e.speed > t.max;
          const loses = trickRoom ? e.speed > t.max : e.speed < t.min;
          if (beats) faster++;
          else if (loses) slower++;
          else depends++;
        }
        return {
          key: e.key,
          name: e.name,
          speciesId: e.speciesId,
          speed: e.speed,
          scarfNote: e.variant.includes('con Scarf') ? ' (Scarf)' : e.variant.includes('sin Scarf') ? ' (sin Scarf)' : '',
          position: out.findIndex((g) => g.key === e.key) + 1,
          faster,
          tie: depends,
          slower,
          total: threats.length,
        };
      });

    const shownIds = new Set(entries.filter((e) => !e.isTeam).map((e) => e.speciesId));

    return { groups: out, summary, shownIds };
  }, [data, activeTeam, tailwind, weather, trickRoom, unburden, lang, benchmarks, showAbilities, showScarf, builds, userInclude, userExclude]);

  const maxSpeed = Math.max(1, ...groups.map((g) => g.speed));

  // id de fila a partir de su key (sin caracteres problemáticos para el DOM).
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowId = (key: string) => `speedrow-${key.replace(/[^a-z0-9]/gi, '-')}`;
  const goToRow = (key: string) => {
    const container = tableScrollRef.current;
    const el = document.getElementById(rowId(key));
    if (!container || !el) return;
    // Scroll SOLO dentro del contenedor de la tabla (sin mover la página).
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top = container.scrollTop + (eRect.top - cRect.top) - (container.clientHeight - eRect.height) / 2;
    container.scrollTo({ top, behavior: 'smooth' });
    // Quita el resalte de cualquier fila anterior para no acumular varias.
    container.querySelectorAll('.row-flash').forEach((r) => r.classList.remove('row-flash'));
    void el.offsetWidth; // reinicia la animación
    el.classList.add('row-flash');
  };

  // Al entrar, las barras crecen desde 0 hasta su anchura (transición en el render).
  // setTimeout (no rAF) para que dispare aunque la pestaña no esté en primer plano.
  const [barsReady, setBarsReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBarsReady(true), 50);
    return () => clearTimeout(id);
  }, []);

  // Reordenamiento animado (FLIP): cuando las filas cambian de posición al togglear
  // un modificador, se deslizan suavemente a su nuevo sitio en vez de saltar.
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLTableRowElement>('tr[id^="speedrow-"]');
    const newRects = new Map<string, DOMRect>();
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      newRects.set(row.id, rect);
      const prev = prevRects.current.get(row.id);
      if (prev) {
        const dy = prev.top - rect.top;
        if (Math.abs(dy) > 1) {
          row.style.transition = 'none';
          row.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            row.style.transition = 'transform 0.35s ease';
            row.style.transform = '';
          });
        }
      }
    });
    prevRects.current = newRects;
  }, [groups]);

  const toggleWeather = (w: Exclude<Weather, 'none'>) => setWeather((cur) => (cur === w ? 'none' : w));

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Speed Tier</h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <ToggleChip label="≋ Tailwind" active={tailwind} onClick={() => setTailwind((v) => !v)} />
        <ToggleChip label={t(WEATHER_LABEL.sun)} active={weather === 'sun'} onClick={() => toggleWeather('sun')} />
        <ToggleChip label={t(WEATHER_LABEL.rain)} active={weather === 'rain'} onClick={() => toggleWeather('rain')} />
        <ToggleChip label={t(WEATHER_LABEL.snow)} active={weather === 'snow'} onClick={() => toggleWeather('snow')} />
        <ToggleChip label={t(WEATHER_LABEL.sand)} active={weather === 'sand'} onClick={() => toggleWeather('sand')} />
        <ToggleChip label={`⧗ ${t('Trick Room')}`} active={trickRoom} onClick={() => setTrickRoom((v) => !v)} />
        <ToggleChip label={`❧ ${localizeName('abilities', 'Unburden', lang)}`} active={unburden} onClick={() => setUnburden((v) => !v)} />
        <ToggleChip className="ml-auto" label={t('Habilidades')} active={showAbilities} onClick={() => setShowAbilities((v) => !v)} />
        <ToggleChip label="Choice Scarf" active={showScarf} onClick={() => setShowScarf((v) => !v)} />
        <ToggleChip label={t('Spreads Neutros')} active={showNeutral} onClick={() => setShowNeutral((v) => !v)} />
      </div>

      {summary.length > 0 && (
        <div className="panel p-3 mb-4">
          <h3 className="font-semibold text-sm mb-2">{t('Resumen de velocidad de tu equipo')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {summary.map((s) => (
              <button
                type="button"
                key={s.key}
                onClick={() => goToRow(s.key)}
                title={t('Ver en la tabla')}
                className="flex items-center gap-2 bg-poke-dark/40 rounded-lg px-2 py-1.5 text-left w-full transition-colors hover:bg-poke-dark/70 active:scale-[0.98]"
              >
                <PokemonSprite speciesId={s.speciesId} className="w-8 h-8 object-contain shrink-0" />
                <div className="min-w-0 text-xs">
                  <div className="font-medium truncate">
                    <span className="text-gray-500 font-mono">#{s.position}</span> {t(s.name)}<span className="text-gray-400">{s.scarfNote && ` ${t(s.scarfNote.trim())}`}</span> <span className="font-mono text-poke-gold">{s.speed}</span>
                  </div>
                  <div className="text-gray-400">
                    <span className="text-green-400">{s.faster} {t('supera')}</span>
                    {' · '}<span className="text-yellow-400">{s.tie} {t('depende')}</span>
                    {' · '}<span className="text-red-400">{s.slower} {t('pierde')}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <div ref={tableScrollRef} className="max-h-[72vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-poke-accent sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 w-12">#</th>
              <th className="text-left px-3 py-2">{t('Pokémon')}</th>
              <th className="text-right px-3 py-2 w-16">{t('Vel.')}</th>
              <th className="text-left px-3 py-2 w-[28%]"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr
                key={g.key}
                id={rowId(g.key)}
                className={`border-t border-poke-accent/30 ${g.hasTeam ? 'bg-poke-gold/15 border-l-4 border-l-poke-gold' : i % 2 ? 'bg-white/[0.02]' : ''}`}
              >
                <td className="px-3 py-1.5 text-gray-400 align-top">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {g.items.map((e) => (
                      <div key={e.key} className="flex items-center gap-2 min-w-0">
                        <PokemonSprite speciesId={e.speciesId} className="w-8 h-8 object-contain shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            {t(e.name)}
                            {e.isTeam && <span className="text-[10px] text-poke-gold">{t('(equipo)')}</span>}
                          </div>
                          <div className="flex gap-1 mt-0.5">
                            {e.types.map((t) => (
                              <span key={t} className={`type-${t.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right align-top">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-poke-dark font-mono font-bold">{g.speed}</span>
                </td>
                <td className="px-3 py-1.5 align-top">
                  <div className="h-2 rounded-full bg-black/30 overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${g.hasTeam ? 'bg-poke-gold' : 'bg-poke-accent'}`}
                      style={{
                        width: `${barsReady ? (g.speed / maxSpeed) * 100 : 0}%`,
                        transitionDelay: barsReady ? `${Math.min(i * 12, 400)}ms` : '0ms',
                      }}
                    />
                  </div>
                  <div className={`text-[10px] mt-0.5 truncate ${BENCHMARK_COLOR[g.items[0].variant] ?? 'text-gray-500'}`}>
                    {[...new Set(g.items.map((e) => t(e.variant)))].join(' / ')}
                    {g.items[0].boostAbility && (
                      <span className="text-poke-gold"> · {localizeName('abilities', g.items[0].boostAbility, lang)}</span>
                    )}
                    {g.items[0].boostItem && (
                      <span className="text-sky-400"> · {localizeName('items', g.items[0].boostItem, lang)}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="panel p-3 mt-4">
        <h3 className="font-semibold text-sm mb-2">{t('Personalizar tabla')}</h3>
        <div className="flex flex-wrap gap-2 items-start">
          <SpeciesPicker species={data.species.filter((s) => !shownIds.has(s.id))} placeholder={t('+ Añadir Pokémon a la tabla')} onPick={(s) => addPokemon(s.id)} />
          <SpeciesPicker species={data.species.filter((s) => shownIds.has(s.id))} placeholder={t('− Quitar Pokémon de la tabla')} onPick={(s) => removePokemon(s.id)} />
          {(userInclude.size > 0 || userExclude.size > 0) && (
            <button type="button" className="btn-secondary text-sm border border-transparent" onClick={resetCustom}>
              {t('Restablecer')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeciesPicker({ species, placeholder, onPick }: { species: SpeciesData[]; placeholder: string; onPick: (sp: SpeciesData) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.toLowerCase().trim();
  const results = species.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30);

  return (
    <div ref={ref} className="relative flex-1 min-w-[200px]">
      <input
        className="input-field"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && q && (
        <ul className="absolute z-20 w-full mt-1 max-h-60 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 flex items-center gap-2"
                onClick={() => { onPick(s); setQuery(''); setOpen(false); }}
              >
                <PokemonSprite speciesId={s.id} className="w-6 h-6 object-contain shrink-0" />
                <span>{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToggleChip({ label, active, onClick, className = '' }: { label: string; active: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-sm border transition-all active:scale-95 ${className} ${
        active
          ? 'border-poke-gold text-white'
          : 'bg-poke-dark border-poke-accent text-gray-300 hover:bg-poke-accent/40'
      }`}
    >
      <span className={`absolute inset-0 bg-poke-gold origin-left transition-transform duration-300 ease-out ${active ? 'scale-x-100' : 'scale-x-0'}`} />
      <span className="relative">{label}</span>
    </button>
  );
}
