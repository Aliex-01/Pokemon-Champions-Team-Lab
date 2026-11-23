import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeam } from '../store/teamStore';
import { calcAllStats } from '../lib/stats';
import { getSpecies, localizeName } from '../lib/championsData';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { PokemonSprite } from '../components/PokemonSprite';
import { Dropdown } from '../components/Dropdown';
import { InfoTooltip } from '../components/InfoTooltip';
import { useFlip } from '../lib/useFlip';
import { useLang } from '../lib/i18n';
import { TYPE_NAMES } from '../lib/typeChart';

const CUSTOM_KEY = 'speedtier-custom';
const TOP_KEY = 'speedtier-topN';
const TOP_OPTIONS = [25, 50, 75, 100, 150, 0]; // 0 = todos los de Smogon

function loadTopN() {
  try {
    const raw = localStorage.getItem(TOP_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (TOP_OPTIONS.includes(n)) return n;
    }
  } catch { /* ignore */ }
  return 50;
}

function loadCustom() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { include: [], exclude: [] };
}

// Color por benchmark para distinguir las variantes de un vistazo.
const BENCHMARK_COLOR = {
  'Máx +Nat': 'text-green-400',
  'Máx neutra': 'text-blue-400',
  '0 neutra': 'text-amber-400',
  '0 −Nat': 'text-red-400',
};

// Habilidades que multiplican la Velocidad bajo una condición (no Speed Boost).
const SPEED_ABILITIES = {
  Chlorophyll: 2, 'Swift Swim': 2, 'Sand Rush': 2, 'Slush Rush': 2,
  'Surge Surfer': 2, Unburden: 2, 'Quick Feet': 1.5,
};

// Fallback de tiers solo mientras carga builds.json (si Smogon no está disponible).
const KEPT_TIERS = new Set(['S', 'A', 'B']);

const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

// Habilidad que duplica la Velocidad bajo cada clima.
const WEATHER_SPEED_ABILITY = {
  sun: 'Chlorophyll',
  rain: 'Swift Swim',
  snow: 'Slush Rush',
  sand: 'Sand Rush',
};

const WEATHER_LABEL = {
  sun: 'Sol',
  rain: 'Lluvia',
  snow: 'Nieve',
  sand: 'Arena',
};

/** Velocidad a nivel 50 con la inversión y naturaleza dadas (modo champions = stat points). */
function speedOf(base, spe, nature) {
  return calcAllStats(base, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe }, MAX_IVS, nature, 50, 'champions').spe;
}

const BENCHMARKS = [
  { spe: 32, nature: 'Jolly', label: 'Máx +Nat', neutral: false },
  { spe: 32, nature: 'Docile', label: 'Máx neutra', neutral: true },
  { spe: 0, nature: 'Docile', label: '0 neutra', neutral: true },
  { spe: 0, nature: 'Brave', label: '0 −Nat', neutral: false },
];

/** Representante preferido al colapsar formas: forma base (no mega, nombre más corto). */
function preferRep(a, b) {
  if (!!a.isMega !== !!b.isMega) return a.isMega ? b : a;
  return a.name.length <= b.name.length ? a : b;
}

export function SpeedTierView({ data }) {
  const { activeTeam } = useTeam();
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const monParam = searchParams.get('mon');
  const [tailwind, setTailwind] = useState(false);
  const [weather, setWeather] = useState('none');
  const [trickRoom, setTrickRoom] = useState(false);
  const [unburden, setUnburden] = useState(false);
  const [showNeutral, setShowNeutral] = useState(false);
  const [showAbilities, setShowAbilities] = useState(false);
  const [showScarf, setShowScarf] = useState(false);
  const [builds, setBuilds] = useState(null);
  const [topN, setTopN] = useState(loadTopN);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [speedMin, setSpeedMin] = useState('');
  const [speedMax, setSpeedMax] = useState('');
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  useEffect(() => { localStorage.setItem(TOP_KEY, String(topN)); }, [topN]);
  const [userInclude, setUserInclude] = useState(() => new Set(loadCustom().include));
  const [userExclude, setUserExclude] = useState(() => new Set(loadCustom().exclude));

  useEffect(() => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify({ include: [...userInclude], exclude: [...userExclude] }));
  }, [userInclude, userExclude]);

  const addPokemon = (id) => {
    setUserInclude((s) => new Set(s).add(id));
    setUserExclude((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const removePokemon = (id) => {
    setUserExclude((s) => new Set(s).add(id));
    setUserInclude((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const resetCustom = () => { setUserInclude(new Set()); setUserExclude(new Set()); };

  const benchmarks = useMemo(() => (showNeutral ? BENCHMARKS : BENCHMARKS.filter((b) => !b.neutral)), [showNeutral]);

  // Ranking de uso de Smogon (ordenado de mayor a menor % de uso).
  const usageRankedIds = useMemo(() => {
    if (!builds?.pokemon) return [];
    const validIds = new Set(data.species.map((s) => s.id));
    return Object.entries(builds.pokemon)
      .filter(([id]) => validIds.has(id))
      .sort((a, b) => b[1].usage - a[1].usage)
      .map(([id]) => id);
  }, [builds, data.species]);

  const topUsageSet = useMemo(() => {
    if (usageRankedIds.length === 0) return null;
    const slice = topN > 0 ? usageRankedIds.slice(0, topN) : usageRankedIds;
    return new Set(slice);
  }, [usageRankedIds, topN]);

  // Entradas de referencia (benchmarks). NO dependen de Tailwind/clima/TR/unburden,
  // así que se calculan una vez y no se rehacen en cada toggle del entorno.
  const benchmarkEntries = useMemo(() => {
    const entries = [];

    // Pokémon de referencia incluidos: Top N de uso en Smogon (+ añadidos manuales, − excluidos).
    const isIncluded = (sp) => {
      if (userExclude.has(sp.id)) return false;
      if (userInclude.has(sp.id)) return true;
      if (topUsageSet) return topUsageSet.has(sp.id);
      return KEPT_TIERS.has(sp.tier ?? '');
    };

    // Colapsa formas del mismo Pokémon (mismo nº de dex) que comparten velocidad base
    // (megas con misma velocidad, Tauros de Paldea, Basculegion ♂/♀, etc.).
    const collapseSkip = new Set();
    const rep = new Map();
    for (const sp of data.species) {
      if (!isIncluded(sp) || userInclude.has(sp.id)) continue;
      const k = `${sp.num}-${sp.baseStats.spe}`;
      const cur = rep.get(k);
      if (!cur) { rep.set(k, sp); continue; }
      const keep = preferRep(cur, sp) === cur ? cur : sp;
      collapseSkip.add(keep === cur ? sp.id : cur.id);
      rep.set(k, keep);
    }

    // % de uso de Choice Scarf según los datos de Smogon (por id de Pokémon).
    const scarfPct = (id) =>
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
      // Filas extra con Choice Scarf (×1.5) para portadores frecuentes en Smogon (>20%).
      if (showScarf && scarfPct(sp.id) > 20) {
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

    return entries;
  }, [data, benchmarks, showAbilities, showScarf, builds, userInclude, userExclude, topUsageSet]);

  const { groups, summary, shownIds } = useMemo(() => {
    const entries = [];

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

    entries.push(...benchmarkEntries);

    const out = [];

    // Tus Pokémon siempre en filas en solitario.
    for (const e of entries) {
      if (e.isTeam) out.push({ key: e.key, speed: e.speed, items: [e], hasTeam: true });
    }

    // El resto agrupados por velocidad BASE + benchmark (solo se juntan los que
    // comparten velocidad base, no los que coinciden por casualidad). Hasta 3 por fila.
    const byKey = new Map();
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
    const threatRange = new Map();
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
    const summary = entries
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
  }, [activeTeam, tailwind, weather, trickRoom, unburden, lang, benchmarkEntries]);

  const hasTableFilters = Boolean(searchQuery.trim() || typeFilter || speedMin !== '' || speedMax !== '');
  const clearTableFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
    setSpeedMin('');
    setSpeedMax('');
  };

  const visibleGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const minV = speedMin === '' ? null : parseInt(speedMin, 10);
    const maxV = speedMax === '' ? null : parseInt(speedMax, 10);
    if (!q && !typeFilter && minV == null && maxV == null) return groups;

    const out = [];
    for (const g of groups) {
      // Tus Pokémon siempre permanecen visibles para comparar su velocidad con lo filtrado.
      if (g.hasTeam) {
        out.push(g);
        continue;
      }
      if (minV != null && !Number.isNaN(minV) && g.speed < minV) continue;
      if (maxV != null && !Number.isNaN(maxV) && g.speed > maxV) continue;
      if (!q && !typeFilter) {
        out.push(g);
        continue;
      }
      const matched = g.items.filter((e) => {
        if (typeFilter && !e.types.includes(typeFilter)) return false;
        if (q && !e.name.toLowerCase().includes(q) && !e.speciesId.includes(q.replace(/\s+/g, ''))) return false;
        return true;
      });
      if (matched.length > 0) {
        out.push({ ...g, items: matched });
      }
    }
    return out;
  }, [groups, searchQuery, typeFilter, speedMin, speedMax]);

  const maxSpeed = Math.max(1, ...groups.map((g) => g.speed));

  // Las filas se deslizan a su nueva posición al reordenar (Tailwind, TR, Scarf…).
  const flipBodyRef = useFlip(visibleGroups);

  // id de fila a partir de su key (sin caracteres problemáticos para el DOM).
  const tableScrollRef = useRef(null);
  const rowId = (key) => `speedrow-${key.replace(/[^a-z0-9]/gi, '-')}`;
  const goToRow = (key) => {
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

  // Si se llega desde un atajo del Team Builder (?mon=speciesId), centra su fila.
  useEffect(() => {
    if (!monParam) return;
    const entry = summary.find((s) => s.speciesId === monParam);
    if (!entry) return;
    const id = setTimeout(() => goToRow(entry.key), 180);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monParam]);

  // Al entrar, las barras crecen desde 0 hasta su anchura (transición en el render).
  // setTimeout (no rAF) para que dispare aunque la pestaña no esté en primer plano.
  const [barsReady, setBarsReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBarsReady(true), 50);
    return () => clearTimeout(id);
  }, []);

  // Reordenamiento animado (FLIP): cuando las filas cambian de posición al togglear
  // un modificador, se deslizan suavemente a su nuevo sitio en vez de saltar.
  const prevRects = useRef(new Map());
  useLayoutEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('tr[id^="speedrow-"]');
    const newRects = new Map();
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
  }, [visibleGroups]);

  const toggleWeather = (w) => setWeather((cur) => (cur === w ? 'none' : w));

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          Speed Tier
          <InfoTooltip side="bottom" label={t('Más información')}>
            {lang === 'en'
              ? 'Speed ranking of the whole format with your team highlighted, so you can see who outspeeds whom. Use the toggles to apply Tailwind, weather, Trick Room, Unburden or Choice Scarf.'
              : 'Ranking de Velocidad de todo el formato con tu equipo resaltado, para ver quién supera a quién. Usa los toggles para aplicar Viento Afín, clima, Espacio Raro, Liviano o Pañuelo Elección.'}
          </InfoTooltip>
        </h2>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1">
          <ToggleChip label="≋ Tailwind" active={tailwind} onClick={() => setTailwind((v) => !v)} />
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Tailwind doubles the Speed of your team for the rows shown here.'
              : 'Viento Afín duplica la Velocidad de tu equipo en las filas mostradas aquí.'}
          </InfoTooltip>
        </span>
        <ToggleChip label={t(WEATHER_LABEL.sun)} active={weather === 'sun'} onClick={() => toggleWeather('sun')} />
        <ToggleChip label={t(WEATHER_LABEL.rain)} active={weather === 'rain'} onClick={() => toggleWeather('rain')} />
        <ToggleChip label={t(WEATHER_LABEL.snow)} active={weather === 'snow'} onClick={() => toggleWeather('snow')} />
        <span className="inline-flex items-center gap-1">
          <ToggleChip label={t(WEATHER_LABEL.sand)} active={weather === 'sand'} onClick={() => toggleWeather('sand')} />
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Weather adds benchmark rows for abilities that double Speed under it (Chlorophyll in sun, Swift Swim in rain, Slush Rush in snow, Sand Rush in sandstorm).'
              : 'El clima añade filas de referencia para habilidades que duplican la Velocidad bajo él (Clorofila con sol, Nado Rápido con lluvia, Quitanieve con nieve, Ímpetu Arena con tormenta de arena).'}
          </InfoTooltip>
        </span>
        <span className="inline-flex items-center gap-1">
          <ToggleChip label={`⧗ ${t('Trick Room')}`} active={trickRoom} onClick={() => setTrickRoom((v) => !v)} />
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Trick Room reverses turn order for five turns: the slowest Pokémon moves first, so the tier list is inverted.'
              : 'Espacio Raro invierte el orden de turno durante cinco turnos: el Pokémon más lento actúa primero, así que la tabla se invierte.'}
          </InfoTooltip>
        </span>
        <span className="inline-flex items-center gap-1">
          <ToggleChip label={`❧ ${localizeName('abilities', 'Unburden', lang)}`} active={unburden} onClick={() => setUnburden((v) => !v)} />
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Unburden doubles the holder’s Speed once it uses or loses its held item.'
              : 'Liviano duplica la Velocidad del portador una vez que usa o pierde su objeto.'}
          </InfoTooltip>
        </span>
        <ToggleChip className="ml-auto" label={t('Habilidades')} active={showAbilities} onClick={() => setShowAbilities((v) => !v)} />
        <span className="inline-flex items-center gap-1">
          <ToggleChip label="Choice Scarf" active={showScarf} onClick={() => setShowScarf((v) => !v)} />
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Choice Scarf multiplies Speed by 1.5. Shown as extra benchmark rows for common users based on Smogon usage.'
              : 'Pañuelo Elección multiplica la Velocidad por 1,5. Se muestra como filas de referencia extra para portadores comunes según el uso de Smogon.'}
          </InfoTooltip>
        </span>
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
                onClick={() => {
                  if (hasTableFilters) {
                    clearTableFilters();
                    setTimeout(() => goToRow(s.key), 60);
                  } else {
                    goToRow(s.key);
                  }
                }}
                title={t('Ver en la tabla')}
                className="flex items-center gap-2 bg-poke-dark/40 rounded-lg px-2 py-1.5 text-left w-full transition-colors hover:bg-poke-dark/70 active:scale-[0.98]"
              >
                <PokemonSprite speciesId={s.speciesId} className="w-8 h-8 object-contain shrink-0" />
                <div className="min-w-0 text-xs">
                  <div className="font-medium truncate">
                    <span className="text-gray-500 font-mono">#{s.position}</span> {t(s.name)}<span className="text-gray-400">{s.scarfNote && ` ${t(s.scarfNote.trim())}`}</span> <span className="font-mono text-poke-pink">{s.speed}</span>
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

      <div className="panel p-3 mb-3 flex flex-wrap items-center gap-2">
        <Dropdown
          className="w-44 shrink-0"
          value={String(topN)}
          options={TOP_OPTIONS.map(String)}
          onChange={(v) => setTopN(parseInt(v, 10))}
          render={(v) => {
            const n = parseInt(v, 10);
            return n === 0
              ? `${t('Todos')} (${usageRankedIds.length || 'Smogon'})`
              : `Top ${n} Smogon`;
          }}
        />
        <input
          className="input-field flex-1 min-w-[11rem]"
          placeholder={t('Buscar Pokémon en la tabla…')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Dropdown
          className="w-40 shrink-0"
          value={typeFilter}
          options={['', ...TYPE_NAMES]}
          placeholder={t('Todos los tipos')}
          render={(ty) => (ty ? ty : t('Todos los tipos'))}
          onChange={setTypeFilter}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-400">{t('Vel.')}</span>
          <input
            type="number"
            min={0}
            className="no-spinner input-field w-20 text-center"
            placeholder={t('Mín')}
            value={speedMin}
            onChange={(e) => setSpeedMin(e.target.value)}
          />
          <span className="text-gray-500">–</span>
          <input
            type="number"
            min={0}
            className="no-spinner input-field w-20 text-center"
            placeholder={t('Máx')}
            value={speedMax}
            onChange={(e) => setSpeedMax(e.target.value)}
          />
        </div>
        {hasTableFilters && (
          <button
            type="button"
            className="text-xs text-poke-pink hover:underline px-1"
            onClick={clearTableFilters}
          >
            {t('Limpiar')}
          </button>
        )}
      </div>

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
          <tbody ref={flipBodyRef}>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400">
                  {t('Ningún Pokémon coincide con los filtros.')}
                </td>
              </tr>
            ) : visibleGroups.map((g, i) => (
              <tr
                key={g.key}
                id={rowId(g.key)}
                data-flip-id={g.key}
                className={`border-t border-poke-accent/30 ${g.hasTeam ? 'bg-poke-pink/15 border-l-4 border-l-poke-pink' : i % 2 ? 'bg-white/[0.02]' : ''}`}
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
                            {e.isTeam && <span className="text-[10px] text-poke-pink">{t('(equipo)')}</span>}
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
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${g.hasTeam ? 'bg-poke-pink' : 'bg-poke-accent'}`}
                      style={{
                        width: `${barsReady ? (g.speed / maxSpeed) * 100 : 0}%`,
                        transitionDelay: barsReady ? `${Math.min(i * 12, 400)}ms` : '0ms',
                      }}
                    />
                  </div>
                  <div className={`text-[10px] mt-0.5 truncate ${BENCHMARK_COLOR[g.items[0].variant] ?? 'text-gray-500'}`}>
                    {[...new Set(g.items.map((e) => t(e.variant)))].join(' / ')}
                    {g.items[0].boostAbility && (
                      <span className="text-poke-pink"> · {localizeName('abilities', g.items[0].boostAbility, lang)}</span>
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

function SpeciesPicker({ species, placeholder, onPick }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
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

function ToggleChip({ label, active, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-sm border transition-all active:scale-95 ${className} ${
        active
          ? 'border-poke-pink text-white'
          : 'bg-poke-dark border-poke-accent text-gray-300 hover:bg-poke-accent/40'
      }`}
    >
      <span className={`absolute inset-0 bg-poke-pink origin-left transition-transform duration-300 ease-out ${active ? 'scale-x-100' : 'scale-x-0'}`} />
      <span className="relative">{label}</span>
    </button>
  );
}
