import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpecies, getLearnset, localizeName } from '../lib/championsData';
import { PokemonSprite } from '../components/PokemonSprite';
import { Dropdown } from '../components/Dropdown';
import { MoveSearch } from '../components/MoveSearch';
import { ItemSearch } from '../components/ItemSearch';
import { SegmentedControl } from '../components/SegmentedControl';
import { InfoTooltip } from '../components/InfoTooltip';
import { Icon } from '../components/Icons';
import { Toast } from '../components/Toast';
import { calcMove, emptySide } from '../lib/damageCalc';
import { calcAllStats, getNatureMod, convertInvestment, totalInvestment, MAX_TOTAL_STAT_POINTS, getStatNatureClass } from '../lib/stats';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { DEFAULT_IVS } from '../types/pokemon';

const parseSpread = (evs) => {
  const [hp, atk, def, spa, spd, spe] = evs.split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
};

const STAT_LBL = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const STAT_KEY = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
// EVs del set más usado con signo de naturaleza: "32 HP / +32 Atk / −4 SpA".
function metaSpreadEvs(build) {
  const s = build?.spreads?.[0];
  if (!s) return '—';
  const parts = s.evs.split('/').map((n, i) => {
    const v = parseInt(n, 10) || 0;
    if (v <= 0) return null;
    const mod = getNatureMod(s.nature, STAT_KEY[i]);
    const sign = mod > 0 ? '+' : mod < 0 ? '−' : '';
    return `${sign}${v} ${STAT_LBL[i]}`;
  }).filter(Boolean).join(' / ');
  return parts || '—';
}

const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

// Estado persistido en localStorage (recuerda el Pokémon elegido entre páginas).
function usePersistedState(key, initial, override) {
  const [state, setState] = useState(() => {
    if (override !== undefined) return override;
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw); } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ } }, [key, state]);
  return [state, setState];
}
const FIELD = { weather: '', terrain: '', crit: false, gravity: false, magicRoom: false, wonderRoom: false, singleTarget: true };
const SIDE = emptySide();
const WEATHER_CHIPS = [
  { id: '', label: 'Ninguno' },
  { id: 'Sun', label: 'Sol' },
  { id: 'Rain', label: 'Lluvia' },
  { id: 'Sand', label: 'Arena' },
  { id: 'Snow', label: 'Nieve' },
];
const TERRAIN_CHIPS = [
  { id: '', label: 'Ninguno' },
  { id: 'Electric', label: 'Eléctrico' },
  { id: 'Grassy', label: 'Hierba' },
  { id: 'Psychic', label: 'Psíquico' },
  { id: 'Misty', label: 'Niebla' },
];
// Naturalezas para los presets del objetivo.
const NAT = { spe: 'Jolly', atk: 'Adamant', spa: 'Modest', def: 'Bold', spd: 'Calm', neutral: 'Hardy' };

// Objetos OFENSIVOS (suben el daño del atacante) — para el atacante en Defensa.
const OFFENSIVE_ITEMS = [
  'Life Orb', 'Choice Band', 'Choice Specs', 'Expert Belt', 'Muscle Band', 'Wise Glasses',
  'Charcoal', 'Mystic Water', 'Miracle Seed', 'Magnet', 'Never-Melt Ice', 'Black Belt', 'Black Glasses',
  'Poison Barb', 'Soft Sand', 'Sharp Beak', 'Twisted Spoon', 'Silver Powder', 'Hard Stone', 'Spell Tag',
  'Dragon Fang', 'Metal Coat', 'Silk Scarf', 'Fairy Feather',
  'Flame Plate', 'Splash Plate', 'Zap Plate', 'Meadow Plate', 'Icicle Plate', 'Fist Plate', 'Toxic Plate',
  'Earth Plate', 'Sky Plate', 'Mind Plate', 'Insect Plate', 'Stone Plate', 'Spooky Plate', 'Draco Plate',
  'Dread Plate', 'Iron Plate', 'Pixie Plate',
];
// Objetos DEFENSIVOS (reducen el daño recibido) — para el objetivo en Ataque.
const DEFENSIVE_ITEMS = [
  'Assault Vest', 'Eviolite',
  'Occa Berry', 'Passho Berry', 'Wacan Berry', 'Rindo Berry', 'Yache Berry', 'Chople Berry', 'Kebia Berry',
  'Shuca Berry', 'Coba Berry', 'Payapa Berry', 'Tanga Berry', 'Charti Berry', 'Kasib Berry', 'Haban Berry',
  'Colbur Berry', 'Babiri Berry', 'Roseli Berry', 'Chilan Berry',
];

function getMonSp(p) {
  return (p.evMode ?? 'champions') === 'champions'
    ? { ...p.evs }
    : convertInvestment(p.evs, 'traditional', 'champions');
}

function teamToCalc(p) {
  return {
    speciesId: p.speciesId, speciesName: p.speciesName, level: p.level || 50,
    ability: p.ability, item: p.item, nature: p.nature, evMode: 'champions', evs: getMonSp(p), ivs: p.ivs,
    moves: [...p.moves], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

function makeTarget(sp, evs, nature, item = '', ability = '') {
  return {
    speciesId: sp.id, speciesName: sp.name, level: 50, ability: ability || sp.abilities[0] || '', item,
    nature, evMode: 'champions', evs, ivs: { ...DEFAULT_IVS },
    moves: ['', '', '', ''], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

// Resuelve el reparto combinado mínimo (HP/Atk/Def/SpA/SpD/Spe) para cumplir TODOS los objetivos a la vez.
// Para objetivos de defensa busca el mínimo global de (HP + Def + SpD) aprovechando que HP cubre físico y especial.
function solveCombinedGoals(mon, goals) {
  if (!goals.length) return null;
  const base = teamToCalc(mon);
  let reqSpe = 0;
  let reqAtk = 0;
  let reqSpa = 0;
  const physGoals = [];
  const specGoals = [];

  for (const g of goals) {
    if (g.type === 'speed') reqSpe = Math.max(reqSpe, g.minSpe || 0);
    else if (g.type === 'offense') {
      if (g.atkStat === 'atk') reqAtk = Math.max(reqAtk, g.minSp || 0);
      else reqSpa = Math.max(reqSpa, g.minSp || 0);
    } else if (g.type === 'defense') {
      const atkSp = getSpecies(g.atkId);
      if (!atkSp) continue;
      const attacker = makeTarget(atkSp, g.atkEvs, g.atkNature, g.atkItem, g.atkAbility);
      const entry = {
        ...g,
        attacker,
        field: { ...FIELD, weather: g.weather || '', terrain: g.terrain || '', singleTarget: g.singleTarget },
        atkSide: g.atkSide || SIDE,
        defSide: g.defSide || SIDE,
      };
      if (g.category === 'Physical') physGoals.push(entry);
      else specGoals.push(entry);
    }
  }

  let bestHp = 0;
  let bestDef = 0;
  let bestSpd = 0;
  let defFeasible = true;

  if (physGoals.length > 0 || specGoals.length > 0) {
    const survivesAll = (list, hp, stat, val) => {
      const defMon = { ...base, evs: { ...ZERO_EVS, hp, [stat]: val } };
      for (const g of list) {
        const r = calcMove(g.attacker, defMon, g.moveId, g.field, g.atkSide, g.defSide);
        if (!r || r.pctMax * g.hits >= 100) return false;
      }
      return true;
    };
    const minStatFor = (list, hp, stat) => {
      if (list.length === 0) return 0;
      if (!survivesAll(list, hp, stat, 32)) return -1;
      let lo = 0;
      let hi = 32;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (survivesAll(list, hp, stat, mid)) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    };

    let bestBulk = Infinity;
    for (let hp = 0; hp <= 32; hp++) {
      const d = minStatFor(physGoals, hp, 'def');
      if (d < 0) continue;
      const sd = minStatFor(specGoals, hp, 'spd');
      if (sd < 0) continue;
      const bulk = hp + d + sd;
      // En empate, preferimos más HP (cubre ambos lados ante golpes no modelados).
      if (bulk < bestBulk || (bulk === bestBulk && hp > bestHp)) {
        bestBulk = bulk;
        bestHp = hp;
        bestDef = d;
        bestSpd = sd;
      }
    }
    defFeasible = bestBulk < Infinity;
  }

  const spread = { hp: bestHp, atk: reqAtk, def: bestDef, spa: reqSpa, spd: bestSpd, spe: reqSpe };
  const total = totalInvestment(spread, 'champions');
  const fits = defFeasible && total <= MAX_TOTAL_STAT_POINTS;
  return { spread, total, remaining: MAX_TOTAL_STAT_POINTS - total, defFeasible, fits };
}

// Habilidades que duplican Velocidad según el clima.
const WEATHER_SPEED_ABILITY = { Sun: 'Chlorophyll', Rain: 'Swift Swim', Sand: 'Sand Rush', Snow: 'Slush Rush' };
const weatherSpeedMult = (abilities, weather) =>
  weather && abilities.includes(WEATHER_SPEED_ABILITY[weather]) ? 2 : 1;

const speedWith = (mon, spe, opts = {}) => {
  const sp = getSpecies(mon.speciesId);
  if (!sp) return 0;
  let v = calcAllStats(sp.baseStats, { ...mon.evs, spe }, mon.ivs, mon.nature, mon.level || 50, mon.evMode).spe;
  if (opts.weatherMult && opts.weatherMult > 1) v = Math.floor(v * opts.weatherMult);
  if (opts.unburden) v = Math.floor(v * 2);
  if (opts.scarf) v = Math.floor(v * 1.5);
  if (opts.tailwind) v = Math.floor(v * 2);
  return v;
};

// ── Buscador de especies ─────────────────────────────────────────────────────
function SpeciesSearch({ data, value, onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return [];
    return data.species.filter((sp) => sp.name.toLowerCase().includes(s)).slice(0, 12);
  }, [q, data]);
  return (
    <div className="relative">
      <input className="input-field" placeholder={placeholder} value={open ? q : value} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(''); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && results.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 max-h-56 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {results.map((sp) => (
            <li key={sp.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 flex items-center gap-2" onMouseDown={() => { onPick(sp); setOpen(false); }}>
                <PokemonSprite speciesId={sp.id} className="w-6 h-6 object-contain" />
                <span className="truncate text-sm">{sp.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Botón conmutable (pastilla) con estado activo, como las opciones de campo.
function ToggleChip({ active, onClick, children, disabled, title, variant = 'pink', className = '' }) {
  const activeCls = variant === 'sky'
    ? 'border-sky-400 bg-sky-400/15 text-sky-300'
    : 'border-poke-pink bg-poke-pink/15 text-poke-pink';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${active ? activeCls : 'border-poke-accent text-gray-300 hover:bg-poke-accent/40'} ${className}`}
    >
      {children}
    </button>
  );
}

// Input numérico con steppers −/+ (mismo estilo que los EVs de la Calculadora).
function NumStepper({ value, onChange, max = 32 }) {
  const set = (v) => onChange(Math.max(0, Math.min(max, v)));
  return (
    <div className="flex items-stretch rounded-md border border-poke-accent overflow-hidden mt-1">
      <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => set(value - 1)}>−</button>
      <input
        type="number" min={0} max={max}
        className="no-spinner w-full min-w-0 bg-poke-dark text-center text-sm text-white outline-none py-1 border-x border-poke-accent"
        value={value}
        onChange={(e) => set(parseInt(e.target.value, 10) || 0)}
      />
      <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => set(value + 1)}>+</button>
    </div>
  );
}

// Barra unificada de condiciones de campo (Clima, Terreno y Efectos) para Velocidad, Defensa y Ataque.
function FieldConditionsBar({ weather, onWeather, terrain, onTerrain, extras, weatherTip, t }) {
  return (
    <div className="bg-poke-dark/50 border border-poke-accent/50 rounded-xl px-3.5 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-[5.25rem] text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5 shrink-0">
            {t('Clima')}
            {weatherTip && <InfoTooltip label={t('Más información')} side="top">{weatherTip}</InfoTooltip>}
          </span>
          {WEATHER_CHIPS.map((w) => (
            <ToggleChip
              key={w.id || 'none'}
              active={weather === w.id}
              onClick={() => onWeather(w.id)}
              className="text-xs px-2.5 py-1"
            >
              {t(w.label)}
            </ToggleChip>
          ))}
        </div>

        {extras && (
          <div className="flex flex-wrap items-center gap-1.5 lg:border-l lg:border-poke-accent/40 lg:pl-5">
            <span className="min-w-[5.25rem] lg:min-w-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-0.5 shrink-0">
              {t('Campo')}
            </span>
            {extras}
          </div>
        )}
      </div>

      {onTerrain && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-[5.25rem] text-[11px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">
            {t('Terreno')}
          </span>
          {TERRAIN_CHIPS.map((tr) => (
            <ToggleChip
              key={tr.id || 'none'}
              active={terrain === tr.id}
              onClick={() => onTerrain(tr.id)}
              className="text-xs px-2.5 py-1"
            >
              {t(tr.label)}
            </ToggleChip>
          ))}
        </div>
      )}
    </div>
  );
}

export function OptimizerView({ data }) {
  const { activeTeam, updatePokemon } = useTeam();
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const teamEntries = (activeTeam?.pokemon ?? [])
    .map((p, realSlot) => ({ p, realSlot }))
    .filter(({ p }) => p.speciesId);
  const speciesParam = searchParams.get('species');
  const matchedIdx = speciesParam ? teamEntries.findIndex(({ p }) => p.speciesId === speciesParam) : -1;
  const [slot, setSlot] = usePersistedState('optimizer-slot', 0, matchedIdx >= 0 ? matchedIdx : undefined);
  const [tab, setTab] = usePersistedState('optimizer-tab', 'speed');
  const [goalsMap, setGoalsMap] = usePersistedState('optimizer-goals', {});
  const [toastMsg, setToastMsg] = useState('');

  // Si el equipo cambió y el índice quedó fuera de rango, vuelve al primero.
  const idx = slot < teamEntries.length ? slot : 0;
  const activeEntry = teamEntries[idx] ?? null;
  const mon = activeEntry?.p ?? null;
  const realSlot = activeEntry?.realSlot ?? -1;

  const goalKey = mon ? `${activeTeam?.id ?? 'default'}:${mon.slotId}:${mon.speciesId}` : '';
  const monGoals = useMemo(() => (goalKey ? goalsMap[goalKey] ?? [] : []), [goalKey, goalsMap]);

  const addGoal = (goal) => {
    if (!goalKey) return;
    setGoalsMap((prev) => ({
      ...prev,
      [goalKey]: [...(prev[goalKey] ?? []), { ...goal, id: crypto.randomUUID() }],
    }));
    setToastMsg(t('Objetivo añadido al combinador'));
  };

  const removeGoal = (id) => {
    if (!goalKey) return;
    setGoalsMap((prev) => ({
      ...prev,
      [goalKey]: (prev[goalKey] ?? []).filter((g) => g.id !== id),
    }));
  };

  const clearGoals = () => {
    if (!goalKey) return;
    setGoalsMap((prev) => {
      const next = { ...prev };
      delete next[goalKey];
      return next;
    });
  };

  // Aplica un parche parcial de SP (desde Velocidad/Defensa/Ataque) o un reparto completo (desde Combinador).
  const applySpToTeam = (patch, { replaceAll = false } = {}) => {
    if (!mon || realSlot < 0) return;
    const baseSp = replaceAll ? { ...ZERO_EVS } : getMonSp(mon);
    const nextSp = { ...baseSp, ...patch };
    const total = totalInvestment(nextSp, 'champions');
    if (total > MAX_TOTAL_STAT_POINTS) {
      const excess = total - MAX_TOTAL_STAT_POINTS;
      setToastMsg(
        lang === 'en'
          ? `Exceeds 66 SP (${total}/66, +${excess} over). Free up SP or use the Goal Combiner.`
          : `Supera los 66 SP (${total}/66, sobran ${excess}). Libera puntos o usa el Combinador.`
      );
      return;
    }
    const targetMode = mon.evMode ?? 'champions';
    const nextEvs = targetMode === 'champions'
      ? nextSp
      : convertInvestment(nextSp, 'champions', 'traditional');
    updatePokemon(realSlot, { evs: nextEvs });
    const rem = MAX_TOTAL_STAT_POINTS - total;
    setToastMsg(
      lang === 'en'
        ? `Applied to ${mon.speciesName} (${total}/66 SP · ${rem} left)`
        : `Aplicado a ${mon.speciesName} (${total}/66 SP · ${rem} libres)`
    );
  };

  if (teamEntries.length === 0) {
    return (
      <div className="page-enter">
        <div className="mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {t('Optimizador de EVs')}
            <InfoTooltip label={t('Más información')} side="bottom">
              {lang === 'en'
                ? 'Calculates the minimum EV investment (in Champions Stat Points) your team’s Pokémon need to reach a specific goal: outspeed a target, survive a given attack, or OHKO/2HKO an opponent. Pick a Pokémon and a tab, set the scenario, and it finds the exact spread.'
                : 'Calcula la inversión mínima de EVs (en Stat Points de Champions) que necesitan los Pokémon de tu equipo para lograr un objetivo concreto: superar en velocidad, sobrevivir un ataque o hacer OHKO/2HKO a un rival. Elige un Pokémon y una pestaña, define el escenario y te da el reparto exacto.'}
            </InfoTooltip>
          </h2>
        </div>
        <div className="panel p-6 text-gray-400 text-center">{t('Añade Pokémon a tu equipo para optimizar sus EVs.')}</div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {t('Optimizador de EVs')}
          <InfoTooltip label={t('Más información')} side="bottom">
            {lang === 'en'
              ? 'Calculates the minimum EV investment (in Champions Stat Points) your team’s Pokémon need to reach a specific goal: outspeed a target, survive a given attack, or OHKO/2HKO an opponent. Pick a Pokémon and a tab, set the scenario, and it finds the exact spread.'
              : 'Calcula la inversión mínima de EVs (en Stat Points de Champions) que necesitan los Pokémon de tu equipo para lograr un objetivo concreto: superar en velocidad, sobrevivir un ataque o hacer OHKO/2HKO a un rival. Elige un Pokémon y una pestaña, define el escenario y te da el reparto exacto.'}
          </InfoTooltip>
        </h2>
      </div>

      {/* Elegir tu Pokémon */}
      <div className="panel p-4 mb-4">
        <div className="text-xs text-gray-400 uppercase mb-2 flex items-center gap-1.5">
          {t('Tu Pokémon')}
          <InfoTooltip label={t('Más información')} side="bottom">
            {lang === 'en'
              ? 'The Pokémon from your active team whose EVs you want to optimize. Every calculation below uses its species, item, ability and nature.'
              : 'El Pokémon de tu equipo activo cuyos EVs quieres optimizar. Todos los cálculos de abajo usan su especie, objeto, habilidad y naturaleza.'}
          </InfoTooltip>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {teamEntries.map(({ p }, i) => {
            const types = getSpecies(p.speciesId)?.types ?? [];
            const gCount = (goalsMap[`${activeTeam?.id ?? 'default'}:${p.slotId}:${p.speciesId}`] ?? []).length;
            return (
              <button
                key={p.slotId}
                type="button"
                onClick={() => setSlot(i)}
                className={`relative p-2 rounded-xl border flex flex-col items-center gap-1 transition-all active:scale-95 ${idx === i ? 'border-poke-pink bg-poke-pink/10 ring-1 ring-poke-pink/40' : 'border-poke-accent/40 hover:border-poke-accent hover:bg-poke-accent/20 hover:-translate-y-0.5'}`}
              >
                {gCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-poke-pink/20 border border-poke-pink/50 text-[10px] font-mono font-bold text-poke-pink leading-none">
                    {gCount}
                  </span>
                )}
                <PokemonSprite speciesId={p.speciesId} className="w-14 h-14 object-contain" />
                <span className="text-xs font-medium truncate w-full text-center">{p.speciesName}</span>
                <div className="flex flex-wrap justify-center gap-0.5">
                  {types.map((type) => (
                    <span key={type} className={`type-${type.toLowerCase()} px-1 py-0.5 rounded text-[8px] font-medium leading-none`}>{type}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pestañas */}
      <SegmentedControl
        fluid
        className="mb-4 max-w-md"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'speed', label: <span className="inline-flex items-center gap-1.5"><Icon name="bolt" className="w-3.5 h-3.5" />{t('Velocidad')}</span> },
          { value: 'defense', label: <span className="inline-flex items-center gap-1.5"><Icon name="shield" className="w-3.5 h-3.5" />{t('Defensa')}</span> },
          { value: 'offense', label: <span className="inline-flex items-center gap-1.5"><Icon name="sword" className="w-3.5 h-3.5" />{t('Ataque')}</span> },
        ]}
      />

      {tab === 'speed' && (
        <SpeedTool
          key={`${mon.slotId}-${mon.item}`}
          data={data}
          mon={mon}
          t={t}
          lang={lang}
          onApply={(patch) => applySpToTeam(patch)}
          onAddGoal={addGoal}
        />
      )}
      {tab === 'defense' && (
        <DefenseTool
          data={data}
          mon={mon}
          t={t}
          lang={lang}
          onApply={(patch) => applySpToTeam(patch)}
          onAddGoal={addGoal}
        />
      )}
      {tab === 'offense' && (
        <OffenseTool
          data={data}
          mon={mon}
          t={t}
          lang={lang}
          onApply={(patch) => applySpToTeam(patch)}
          onAddGoal={addGoal}
        />
      )}

      {/* Combinador de objetivos */}
      <GoalCombiner
        key={goalKey}
        mon={mon}
        goals={monGoals}
        data={data}
        t={t}
        lang={lang}
        onRemoveGoal={removeGoal}
        onClear={clearGoals}
        onApplySpread={(spread) => applySpToTeam(spread, { replaceAll: true })}
      />

      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
    </div>
  );
}

// ── 🏃 Velocidad ──────────────────────────────────────────────────────────────
function SpeedTool({ data, mon, t, lang, onApply, onAddGoal }) {
  const [targetId, setTargetId] = usePersistedState('optimizer-speed-target', '');
  const target = targetId ? getSpecies(targetId) ?? null : null;
  const [preset, setPreset] = useState('maxpos');
  const [myTailwind, setMyTailwind] = useState(false);
  const [myScarf, setMyScarf] = useState(mon.item === 'Choice Scarf');
  const [myUnburden, setMyUnburden] = useState(false);
  const [tgtTailwind, setTgtTailwind] = useState(false);
  const [tgtScarf, setTgtScarf] = useState(false);
  const [tgtUnburden, setTgtUnburden] = useState(false);
  const [weather, setWeather] = useState('');
  const [builds, setBuilds] = useState(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  const metaBuild = useMemo(() => {
    if (!builds || !target) return null;
    return builds.pokemon[target.id] ?? (target.baseSpeciesId ? builds.pokemon[target.baseSpeciesId] : null) ?? null;
  }, [builds, target]);
  const hasMeta = !!metaBuild?.spreads?.[0];
  const hasMyUnburden = mon.ability === 'Unburden';
  const hasTgtUnburden = !!target?.abilities.includes('Unburden');
  const myUnburdenEff = hasMyUnburden && myUnburden;
  const tgtUnburdenEff = hasTgtUnburden && tgtUnburden;

  const calc = useMemo(() => {
    if (!target) return null;
    let evs = preset === 'min' ? { ...ZERO_EVS } : { ...ZERO_EVS, spe: 32 };
    let nat = preset === 'maxpos' ? NAT.spe : NAT.neutral;
    let tgtScarfEff = tgtScarf;
    if (preset === 'meta' && metaBuild?.spreads?.[0]) {
      evs = parseSpread(metaBuild.spreads[0].evs);
      nat = metaBuild.spreads[0].nature;
      if (metaBuild.items?.[0]?.name === 'Choice Scarf') tgtScarfEff = true;
    }
    const tgtMon = makeTarget(target, evs, nat);
    const tgtSpeed = speedWith(tgtMon, evs.spe, {
      tailwind: tgtTailwind,
      scarf: tgtScarfEff,
      unburden: tgtUnburdenEff,
      weatherMult: weatherSpeedMult(target.abilities, weather),
    });
    const me = teamToCalc(mon);
    const myWeather = weatherSpeedMult([mon.ability], weather);
    const mine = (sp) => speedWith(me, sp, {
      tailwind: myTailwind,
      scarf: myScarf,
      unburden: myUnburdenEff,
      weatherMult: myWeather,
    });
    // Sugerencia de naturaleza +Spe si actualmente no potencia Velocidad.
    let altSpeSp = null;
    if (getNatureMod(mon.nature, 'spe') <= 0) {
      const mePlus = { ...me, nature: NAT.spe };
      for (let sp = 0; sp <= 32; sp++) {
        const v = speedWith(mePlus, sp, { tailwind: myTailwind, scarf: myScarf, unburden: myUnburdenEff, weatherMult: myWeather });
        if (v > tgtSpeed) { altSpeSp = sp; break; }
      }
    }
    for (let sp = 0; sp <= 32; sp++) {
      if (mine(sp) > tgtSpeed) {
        const natHint = altSpeSp !== null && altSpeSp < sp ? { sp: altSpeSp, saved: sp - altSpeSp } : null;
        return { ok: true, sp, mySpeed: mine(sp), tgtSpeed, natHint };
      }
    }
    const natHint = altSpeSp !== null ? { sp: altSpeSp, saved: null } : null;
    return { ok: false, tgtSpeed, mySpeed: mine(32), natHint };
  }, [target, preset, tgtTailwind, tgtScarf, tgtUnburdenEff, myTailwind, myScarf, myUnburdenEff, weather, metaBuild, mon]);

  const handleAddSpeedGoal = () => {
    if (!calc?.ok || !target) return;
    const mods = [];
    if (preset === 'meta') mods.push('Meta');
    else if (preset === 'maxpos') mods.push('Máx +nat');
    else if (preset === 'maxneu') mods.push('Máx');
    else mods.push('0 Spe');
    if (myTailwind) mods.push('TW tuyo');
    if (myScarf) mods.push('Scarf tuyo');
    if (myUnburdenEff) mods.push(`${localizeName('abilities', 'Unburden', lang)} tuyo`);
    if (tgtTailwind) mods.push('TW rival');
    if (tgtScarf) mods.push('Scarf rival');
    if (tgtUnburdenEff) mods.push(`${localizeName('abilities', 'Unburden', lang)} rival`);
    if (weather) mods.push(weather);
    onAddGoal({
      type: 'speed',
      targetId: target.id,
      targetName: target.name,
      minSpe: calc.sp,
      mySpeed: calc.mySpeed,
      tgtSpeed: calc.tgtSpeed,
      detail: mods.join(' · '),
    });
  };

  const mySpecies = getSpecies(mon.speciesId);
  const myNatSpe = getNatureMod(mon.nature, 'spe');
  const myCurSpeSp = getMonSp(mon).spe;
  const myCurSpeed = useMemo(() => {
    const me = teamToCalc(mon);
    return speedWith(me, myCurSpeSp, {
      tailwind: myTailwind,
      scarf: myScarf,
      unburden: myUnburdenEff,
      weatherMult: weatherSpeedMult([mon.ability], weather),
    });
  }, [mon, myCurSpeSp, myTailwind, myScarf, myUnburdenEff, weather]);
  const maxBar = calc ? Math.max(calc.mySpeed, calc.tgtSpeed, 1) * 1.08 : 1;
  const myPct = calc ? Math.min(100, Math.round((calc.mySpeed / maxBar) * 100)) : 0;
  const tgtPct = calc ? Math.min(100, Math.round((calc.tgtSpeed / maxBar) * 100)) : 0;

  return (
    <div className="panel p-4 space-y-3 animate-fade-in-up">
      {/* Cara a cara (Versus) */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-stretch">
        {/* Tu Pokémon */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3.5 my-auto">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className={`absolute inset-1 rounded-full blur-md pointer-events-none ${mySpecies?.types?.[0] ? `type-glow-${mySpecies.types[0].toLowerCase()}` : 'bg-poke-pink/15'}`} />
              <PokemonSprite speciesId={mon.speciesId} className="relative w-20 h-20 object-contain drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-poke-pink">{t('Tu Pokémon')}</div>
              <div className="text-lg font-bold text-white truncate leading-tight">{mon.speciesName}</div>
              {mySpecies && mySpecies.types.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {mySpecies.types.map((type) => (
                    <span key={type} className={`type-${type.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium leading-none`}>{type}</span>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-gray-400 truncate mt-1.5">
                {mon.ability ? localizeName('abilities', mon.ability, lang) : '—'}
                {mon.item ? ` · ${localizeName('items', mon.item, lang)}` : ''}
              </div>
            </div>
            <div className="shrink-0 text-right pl-2 border-l border-poke-accent/40">
              <div className="font-mono text-2xl font-extrabold text-white leading-none">{myCurSpeed}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">Spe</div>
              {mySpecies && (
                <div className="text-[10px] font-mono text-gray-400 mt-1">
                  Base {mySpecies.baseStats.spe}{myNatSpe > 0 ? ' · +Spe' : myNatSpe < 0 ? ' · −Spe' : ''}
                </div>
              )}
            </div>
          </div>
          <div className={`grid gap-2 ${hasMyUnburden ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <ToggleChip active={myTailwind} onClick={() => setMyTailwind((v) => !v)} className="w-full text-xs">Tailwind ×2</ToggleChip>
            <ToggleChip active={myScarf} onClick={() => setMyScarf((v) => !v)} className="w-full text-xs">Scarf ×1.5</ToggleChip>
            {hasMyUnburden && (
              <ToggleChip active={myUnburden} onClick={() => setMyUnburden((v) => !v)} className="w-full text-xs">
                {localizeName('abilities', 'Unburden', lang)} ×2
              </ToggleChip>
            )}
          </div>
        </div>

        {/* Separador VS */}
        <div className="flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-poke-dark border border-poke-accent flex items-center justify-center text-[11px] font-extrabold tracking-wider text-gray-400">
            VS
          </div>
        </div>

        {/* Objetivo a superar */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            {target ? (
              <PokemonSprite speciesId={target.id} className="w-14 h-14 object-contain shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-poke-dark border border-dashed border-poke-accent/70 flex items-center justify-center text-gray-600 text-lg font-bold shrink-0">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-400 mb-1 flex items-center gap-1.5">
                {t('Objetivo a superar')}
                {target && <span className="font-mono font-normal text-gray-400">Base {target.baseStats.spe}</span>}
                <InfoTooltip label={t('Más información')} side="bottom">
                  {lang === 'en'
                    ? 'Finds the minimum Speed Stat Points your Pokémon needs to outspeed this target by at least 1 point, factoring in preset, Tailwind, Choice Scarf and weather abilities.'
                    : 'Calcula los Stat Points mínimos de Velocidad que tu Pokémon necesita para superar a este objetivo por al menos 1 punto, teniendo en cuenta el preset, Tailwind, Choice Scarf y habilidades de clima.'}
                </InfoTooltip>
              </div>
              <SpeciesSearch data={data} value={target?.name ?? ''} onPick={(sp) => setTargetId(sp.id)} placeholder={t('Buscar Pokémon objetivo…')} />
            </div>
          </div>
          <Dropdown
            value={preset}
            options={['maxpos', 'maxneu', 'min', ...(hasMeta ? ['meta'] : [])]}
            render={(p) => p === 'meta' ? `${t('Spread del meta')} (${metaSpreadEvs(metaBuild)})` : t(p === 'maxpos' ? 'Máx velocidad (+nat)' : p === 'maxneu' ? 'Máx velocidad (neutra)' : 'Sin invertir (0)')}
            onChange={(p) => setPreset(p)}
          />
          <div className={`grid gap-2 ${hasTgtUnburden ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <ToggleChip variant="sky" active={tgtTailwind} onClick={() => setTgtTailwind((v) => !v)} className="w-full text-xs">Tailwind ×2</ToggleChip>
            <ToggleChip variant="sky" active={tgtScarf} onClick={() => setTgtScarf((v) => !v)} className="w-full text-xs">Scarf ×1.5</ToggleChip>
            {hasTgtUnburden && (
              <ToggleChip variant="sky" active={tgtUnburden} onClick={() => setTgtUnburden((v) => !v)} className="w-full text-xs">
                {localizeName('abilities', 'Unburden', lang)} ×2
              </ToggleChip>
            )}
          </div>
        </div>
      </div>

      {/* Condiciones de campo (Clima) */}
      <FieldConditionsBar
        weather={weather}
        onWeather={setWeather}
        weatherTip={
          lang === 'en'
            ? 'Weather applied to both Pokémon. Matters for speed-doubling abilities: Chlorophyll (sun), Swift Swim (rain), Sand Rush (sand) and Slush Rush (snow).'
            : 'Clima aplicado a ambos Pokémon. Importa para las habilidades que duplican Velocidad: Clorofila (sol), Nado Rápido (lluvia), Ímpetu Arena (arena) e Ímpetu Nieve (nieve).'
        }
        t={t}
      />

      {/* Resultado con barras comparativas */}
      {calc && (
        <div className={`rounded-xl border p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 animate-fade-in-up ${calc.ok ? 'border-green-500/40 bg-green-900/15' : 'border-red-500/40 bg-red-900/15'}`}>
          <div className="shrink-0 text-center min-w-[64px]">
            {calc.ok ? (
              <>
                <div className="text-4xl font-bold text-poke-pink font-mono leading-none">{calc.sp}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">stat points</div>
              </>
            ) : (
              <span className="text-3xl font-bold text-red-400/70 leading-none">—</span>
            )}
          </div>

          <div className="flex-1 min-w-[200px] space-y-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-200 truncate">
                  <strong className="text-white">{mon.speciesName}</strong>{' '}
                  <span className="text-gray-400">({calc.ok ? `${calc.sp} SP` : '32 SP máx'})</span>
                </span>
                <span className={`font-mono font-bold ${calc.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {calc.mySpeed} Spe
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-black/45 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ease-out ${calc.ok ? 'bg-green-600' : 'bg-red-600/80'}`}
                  style={{ width: `${myPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1 text-gray-400">
                <span className="truncate">{target?.name}</span>
                <span className="font-mono text-sky-300">{calc.tgtSpeed} Spe</span>
              </div>
              <div className="h-2.5 rounded-full bg-black/45 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-400 transition-[width] duration-300 ease-out"
                  style={{ width: `${tgtPct}%` }}
                />
              </div>
            </div>
            {calc.natHint && (
              <div className="text-[11px] text-amber-300/90 pt-0.5 inline-flex items-center gap-1">
                <Icon name="bulb" className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t('Con naturaleza')} <strong className="font-mono">+Spe</strong>:{' '}
                  <strong className="font-mono">{calc.natHint.sp} SP</strong>
                  {calc.natHint.saved != null && ` (${t('ahorras')} ${calc.natHint.saved} SP)`}
                </span>
              </div>
            )}
          </div>

          {calc.ok ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleAddSpeedGoal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-poke-accent text-gray-200 hover:border-poke-pink/60 hover:text-white transition-colors"
              >
                + {t('Al combinador')}
              </button>
              <button
                type="button"
                onClick={() => onApply({ spe: calc.sp })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-pink/20 border border-poke-pink/50 text-poke-pink hover:bg-poke-pink/30 transition-colors"
              >
                {t('Aplicar al equipo')}
              </button>
            </div>
          ) : (
            <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-red-500/15 border border-red-500/35 text-red-300">
              {t('Faltan')} {calc.tgtSpeed - calc.mySpeed + 1} pts
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── 🛡️ Defensa (sobrevivir) ──────────────────────────────────────────────────
function DefenseTool({ data, mon, t, lang, onApply, onAddGoal }) {
  const [atkId, setAtkId] = usePersistedState('optimizer-def-atk', '');
  const atk = atkId ? getSpecies(atkId) ?? null : null;
  const [moveId, setMoveId] = usePersistedState('optimizer-def-move', '');
  const [atkItem, setAtkItem] = usePersistedState('optimizer-def-item', '');
  const [atkInvest, setAtkInvest] = useState('max');
  const [atkNatureFav, setAtkNatureFav] = useState(true);
  const [hits, setHits] = useState(1);
  const [builds, setBuilds] = useState(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  const [hpMin, setHpMin] = useState(0);
  const [defMin, setDefMin] = useState(0);
  const [spdMin, setSpdMin] = useState(0);
  const [atkAbility, setAtkAbility] = usePersistedState('optimizer-def-ability', '');
  const [weather, setWeather] = useState('');
  const [terrain, setTerrain] = useState('');
  const [myReflect, setMyReflect] = useState(false);
  const [myLightScreen, setMyLightScreen] = useState(false);
  const [myAuroraVeil, setMyAuroraVeil] = useState(false);
  const [rivalHH, setRivalHH] = useState(false);
  // Objetivo del ataque: único (sin reducción) o área/doble (×0.75 para movimientos de área).
  const [singleTarget, setSingleTarget] = usePersistedState('optimizer-def-single', true);
  // Habilidad efectiva del atacante (la elegida si es válida; si no, la primera).
  const atkAbilityEff = atk && atk.abilities.includes(atkAbility) ? atkAbility : (atk?.abilities[0] ?? '');

  const learn = atk ? getLearnset(atk.id, data) : [];
  const move = moveId ? data.moveData?.[moveId] : undefined;
  const defStat = move?.category === 'Physical' ? 'def' : 'spd';
  // Set más usado del atacante (para la opción "Spread del meta").
  const metaBuild = useMemo(() => {
    if (!builds || !atk) return null;
    return builds.pokemon[atk.id] ?? (atk.baseSpeciesId ? builds.pokemon[atk.baseSpeciesId] : null) ?? null;
  }, [builds, atk]);
  const hasMeta = !!metaBuild?.spreads?.[0];
  const metaItemName = metaBuild?.items?.[0]?.name;
  const atkItemEff = atkInvest === 'meta' ? (metaItemName && metaItemName !== 'Sin objeto' ? metaItemName : '') : atkItem;

  // Busca el reparto HP + (Def o SpD) MÍNIMO en total que sobrevive el ataque.
  const calc = useMemo(() => {
    if (!atk || !moveId || !move || move.category === 'Status') return null;
    const atkStat = move.category === 'Physical' ? 'atk' : 'spa';
    let aEvs = atkInvest === 'max' ? { ...ZERO_EVS, [atkStat]: 32 } : { ...ZERO_EVS };
    let aNat = atkNatureFav ? (atkStat === 'atk' ? NAT.atk : NAT.spa) : NAT.neutral;
    if (atkInvest === 'meta' && metaBuild?.spreads?.[0]) { aEvs = parseSpread(metaBuild.spreads[0].evs); aNat = metaBuild.spreads[0].nature; }
    const attacker = makeTarget(atk, aEvs, aNat, atkItemEff, atkAbilityEff);
    const field = { ...FIELD, weather, terrain, singleTarget };
    const atkSide = { ...SIDE, helpingHand: rivalHH };
    const defSide = { ...SIDE, reflect: myReflect, lightScreen: myLightScreen, auroraVeil: myAuroraVeil };
    const base = teamToCalc(mon);
    const otherStat = defStat === 'def' ? 'spd' : 'def';
    const otherMin = defStat === 'def' ? spdMin : defMin;
    const relMin = defStat === 'def' ? defMin : spdMin;
    const solveFor = (monBase) => {
      const evsFor = (hp, dv) => ({ ...monBase.evs, hp, [defStat]: dv, [otherStat]: otherMin });
      for (let total = hpMin + relMin; total <= 64; total++) {
        for (let hp = hpMin; hp <= Math.min(32, total - relMin); hp++) {
          const dv = total - hp;
          if (dv > 32 || dv < relMin) continue;
          const r = calcMove(attacker, { ...monBase, evs: evsFor(hp, dv) }, moveId, field, atkSide, defSide);
          if (r && r.pctMax * hits < 100) {
            return { ok: true, hp, dv, total, pct: r.pctMax * hits };
          }
        }
      }
      const worst = calcMove(attacker, { ...monBase, evs: evsFor(32, 32) }, moveId, field, atkSide, defSide);
      return { ok: false, pct: (worst?.pctMax ?? 0) * hits };
    };

    const res = solveFor(base);
    let natHint = null;
    if (getNatureMod(mon.nature, defStat) <= 0) {
      const altNat = defStat === 'def' ? NAT.def : NAT.spd;
      const alt = solveFor({ ...base, nature: altNat });
      if (alt.ok && (!res.ok || alt.total < res.total)) {
        natHint = { hp: alt.hp, dv: alt.dv, total: alt.total, saved: res.ok ? res.total - alt.total : null };
      }
    }
    return { ...res, aEvs, aNat, atkSide, defSide, natHint };
  }, [atk, moveId, move, defStat, hits, hpMin, defMin, spdMin, atkItemEff, atkInvest, atkNatureFav, atkAbilityEff, singleTarget, weather, terrain, myReflect, myLightScreen, myAuroraVeil, rivalHH, metaBuild, mon]);

  const defLabel = defStat === 'def' ? 'Def' : 'SpD';
  const mySpecies = getSpecies(mon.speciesId);
  const myStats = useMemo(() => {
    if (!mySpecies) return null;
    return calcAllStats(mySpecies.baseStats, getMonSp(mon), mon.ivs, mon.nature, mon.level || 50, 'champions');
  }, [mySpecies, mon]);

  const handleAddDefGoal = () => {
    if (!calc?.ok || !atk || !move) return;
    const mods = [];
    mods.push(hits === 1 ? '1 golpe' : '2 golpes');
    if (!singleTarget) mods.push('Área');
    if (atkInvest === 'meta') mods.push('Meta');
    else if (atkInvest === 'max') mods.push(atkNatureFav ? 'Máx +nat' : 'Máx');
    else mods.push('0 SP');
    if (atkItemEff) mods.push(atkItemEff);
    if (weather) mods.push(weather);
    if (terrain) mods.push(terrain);
    if (myReflect) mods.push('Reflejo');
    if (myLightScreen) mods.push('P. Luz');
    if (myAuroraVeil) mods.push('Velo Aurora');
    if (rivalHH) mods.push('Refuerzo');
    onAddGoal({
      type: 'defense',
      atkId: atk.id,
      atkName: atk.name,
      moveId,
      moveName: data.moveNames?.[moveId] ?? moveId,
      category: move.category,
      hits,
      singleTarget,
      weather,
      terrain,
      atkSide: calc.atkSide,
      defSide: calc.defSide,
      atkEvs: calc.aEvs,
      atkNature: calc.aNat,
      atkItem: atkItemEff,
      atkAbility: atkAbilityEff,
      detail: mods.join(' · '),
    });
  };

  const dmgPct = calc ? Math.min(100, Math.round(calc.pct)) : 0;
  const keepPct = Math.max(0, 100 - dmgPct);

  return (
    <div className="panel p-4 space-y-3 animate-fade-in-up">
      {/* Cara a cara (Versus) */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-stretch">
        {/* Tu Pokémon */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3.5 my-auto">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className={`absolute inset-1 rounded-full blur-md pointer-events-none ${mySpecies?.types?.[0] ? `type-glow-${mySpecies.types[0].toLowerCase()}` : 'bg-poke-pink/15'}`} />
              <PokemonSprite speciesId={mon.speciesId} className="relative w-20 h-20 object-contain drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-poke-pink">{t('Tu Pokémon')}</div>
              <div className="text-lg font-bold text-white truncate leading-tight">{mon.speciesName}</div>
              {mySpecies && mySpecies.types.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {mySpecies.types.map((type) => (
                    <span key={type} className={`type-${type.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium leading-none`}>{type}</span>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-gray-400 truncate mt-1.5">
                {mon.ability ? localizeName('abilities', mon.ability, lang) : '—'}
                {mon.item ? ` · ${localizeName('items', mon.item, lang)}` : ''}
              </div>
            </div>
            {myStats && (
              <div className="shrink-0 flex flex-col gap-1 pl-2.5 border-l border-poke-accent/40 text-right font-mono text-xs">
                <div><span className="text-gray-400">HP</span> <strong className="text-white">{myStats.hp}</strong></div>
                <div><span className="text-gray-400">Def</span> <strong className="text-white">{myStats.def}</strong></div>
                <div><span className="text-gray-400">SpD</span> <strong className="text-white">{myStats.spd}</strong></div>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <ToggleChip active={hits === 1} onClick={() => setHits(1)} className="w-full text-xs">
                {t('Aguantar 1 golpe')}
              </ToggleChip>
              <ToggleChip active={hits === 2} onClick={() => setHits(2)} className="w-full text-xs">
                {t('Aguantar 2 golpes')}
              </ToggleChip>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 uppercase mb-1 flex items-center gap-1.5">
                {t('Mínimos')} (SP)
                <InfoTooltip label={t('Más información')} side="top">
                  {lang === 'en'
                    ? 'Optional floors (in Stat Points) for HP/Def/SpD you’ve already committed elsewhere. The optimizer keeps at least these values and minimizes the rest on top of them.'
                    : 'Suelos opcionales (en Stat Points) de HP/Def/SpD que ya has fijado por otro motivo. El optimizador mantiene al menos estos valores y minimiza el resto por encima de ellos.'}
                </InfoTooltip>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-[11px] text-gray-400 text-center">HP<NumStepper value={hpMin} onChange={setHpMin} /></label>
                <label className="text-[11px] text-gray-400 text-center">Def<NumStepper value={defMin} onChange={setDefMin} /></label>
                <label className="text-[11px] text-gray-400 text-center">SpD<NumStepper value={spdMin} onChange={setSpdMin} /></label>
              </div>
            </div>
          </div>
        </div>

        {/* Separador VS */}
        <div className="flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-poke-dark border border-poke-accent flex items-center justify-center text-[11px] font-extrabold tracking-wider text-gray-400">
            VS
          </div>
        </div>

        {/* Atacante rival */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            {atk ? (
              <PokemonSprite speciesId={atk.id} className="w-14 h-14 object-contain shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-poke-dark border border-dashed border-poke-accent/70 flex items-center justify-center text-gray-600 text-lg font-bold shrink-0">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-400 mb-1 flex items-center gap-1.5">
                {t('Atacante rival')}
                <InfoTooltip label={t('Más información')} side="bottom">
                  {lang === 'en'
                    ? 'The rival Pokémon and move you want to survive. Finds the minimum HP + Def/SpD Stat Points so the worst-case roll stays below 100%.'
                    : 'El Pokémon rival y movimiento que quieres sobrevivir. Calcula el mínimo de Stat Points en HP + Def/SpD para que la tirada máxima no llegue al 100%.'}
                </InfoTooltip>
              </div>
              <SpeciesSearch data={data} value={atk?.name ?? ''} onPick={(sp) => { setAtkId(sp.id); setMoveId(''); }} placeholder={t('Buscar atacante…')} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <MoveSearch moves={learn} value={moveId} names={data.moveNames ?? {}} onPick={setMoveId} placeholder={t('Buscar movimiento…')} lang={lang} />
            </div>
            <ToggleChip variant="sky" active={!singleTarget} onClick={() => setSingleTarget((v) => !v)} title={t('Objetivo del ataque')} className="text-xs shrink-0">
              {singleTarget ? t('Único') : t('Área')}
            </ToggleChip>
          </div>

          <div className="flex items-center gap-2">
            <Dropdown
              className="flex-1 min-w-0"
              value={atkInvest}
              options={['max', 'none', ...(hasMeta ? ['meta'] : [])]}
              render={(v) => v === 'meta' ? `${t('Spread del meta')} (${metaSpreadEvs(metaBuild)})` : t(v === 'max' ? 'Máx inversión' : 'Sin invertir')}
              onChange={(v) => setAtkInvest(v)}
            />
            <ToggleChip variant="sky" active={atkNatureFav && atkInvest !== 'meta'} disabled={atkInvest === 'meta'} onClick={() => setAtkNatureFav((v) => !v)} className="text-xs shrink-0">
              {t('Nat. favorable')}
            </ToggleChip>
          </div>

          <div className={`grid gap-2 ${atk ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <ItemSearch items={OFFENSIVE_ITEMS.filter((i) => data.items.includes(i))} value={atkItemEff} onPick={setAtkItem} placeholder={t('Sin objeto')} lang={lang} disabled={atkInvest === 'meta'} clearable />
            {atk && (
              <Dropdown value={atkAbilityEff} options={atk.abilities} render={(a) => localizeName('abilities', a, lang)} onChange={setAtkAbility} />
            )}
          </div>
        </div>
      </div>

      {/* Condiciones de campo (Clima, Terreno y Efectos) */}
      <FieldConditionsBar
        weather={weather}
        onWeather={setWeather}
        terrain={terrain}
        onTerrain={setTerrain}
        t={t}
        extras={
          <>
            <ToggleChip active={myReflect} onClick={() => setMyReflect((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Reflejo')}
            </ToggleChip>
            <ToggleChip active={myLightScreen} onClick={() => setMyLightScreen((v) => !v)} className="text-xs px-2.5 py-1">
              {t('P. Luz')}
            </ToggleChip>
            <ToggleChip active={myAuroraVeil} onClick={() => setMyAuroraVeil((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Velo Aurora')}
            </ToggleChip>
            <ToggleChip variant="sky" active={rivalHH} onClick={() => setRivalHH((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Refuerzo')} ({t('rival')})
            </ToggleChip>
          </>
        }
      />

      {/* Resultado con barra de vida restante */}
      {calc && (
        <div className={`rounded-xl border p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 animate-fade-in-up ${calc.ok ? 'border-green-500/40 bg-green-900/15' : 'border-red-500/40 bg-red-900/15'}`}>
          <div className="shrink-0 text-center min-w-[64px]">
            {calc.ok ? (
              <>
                <div className="text-4xl font-bold text-poke-pink font-mono leading-none">{calc.total}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">stat points</div>
              </>
            ) : (
              <span className="text-3xl font-bold text-red-400/70 leading-none">—</span>
            )}
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="flex items-baseline justify-between gap-2 text-sm mb-1.5">
              <span className="text-gray-200">
                {calc.ok
                  ? <><strong className="text-white">HP {calc.hp} / {defLabel} {calc.dv}</strong> {t('para sobrevivir')}</>
                  : t('No sobrevive ni con inversión máxima')}
              </span>
              <span className={`font-mono text-xs font-bold shrink-0 ${calc.ok ? 'text-green-400' : 'text-red-400'}`}>
                {Math.round(calc.pct)}% {t('máx')}
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-black/45">
              <div className="bg-green-600 transition-[width] duration-300 ease-out" style={{ width: `${keepPct}%` }} />
              <div className="bg-red-600/70 transition-[width] duration-300 ease-out" style={{ width: `${dmgPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
              <span>{t('HP restante mín')}: <strong className="font-mono text-gray-200">{keepPct}%</strong></span>
              <span className="truncate">
                {atk?.name} · {localizeName('moves', data.moveNames?.[moveId] ?? moveId, lang)} ({hits === 1 ? t('1 golpe') : t('2 golpes')})
              </span>
            </div>
            {calc.natHint && (
              <div className="text-[11px] text-amber-300/90 mt-1 inline-flex items-center gap-1">
                <Icon name="bulb" className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t('Con naturaleza')} <strong className="font-mono">+{defLabel}</strong>:{' '}
                  <strong className="font-mono">HP {calc.natHint.hp} / {defLabel} {calc.natHint.dv}</strong> ({calc.natHint.total} SP
                  {calc.natHint.saved != null ? ` · ${t('ahorras')} ${calc.natHint.saved} SP` : ''})
                </span>
              </div>
            )}
          </div>

          {calc.ok && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleAddDefGoal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-poke-accent text-gray-200 hover:border-poke-pink/60 hover:text-white transition-colors"
              >
                + {t('Al combinador')}
              </button>
              <button
                type="button"
                onClick={() => onApply({ hp: calc.hp, [defStat]: calc.dv })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-pink/20 border border-poke-pink/50 text-poke-pink hover:bg-poke-pink/30 transition-colors"
              >
                {t('Aplicar al equipo')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ⚔️ Ataque (OHKO/2HKO) ─────────────────────────────────────────────────────
function OffenseTool({ data, mon, t, lang, onApply, onAddGoal }) {
  const [moveId, setMoveId] = usePersistedState('optimizer-off-move', '');
  const [targetId, setTargetId] = usePersistedState('optimizer-off-target', '');
  const target = targetId ? getSpecies(targetId) ?? null : null;
  const [bulk, setBulk] = useState('none');
  const [defNatureFav, setDefNatureFav] = useState(false);
  const [defItem, setDefItem] = usePersistedState('optimizer-off-item', '');
  const [defAbility, setDefAbility] = usePersistedState('optimizer-off-ability', '');
  const [singleTarget, setSingleTarget] = usePersistedState('optimizer-off-single', true);
  const [weather, setWeather] = useState('');
  const [terrain, setTerrain] = useState('');
  const [myHH, setMyHH] = useState(false);
  const [rivalReflect, setRivalReflect] = useState(false);
  const [rivalLightScreen, setRivalLightScreen] = useState(false);
  const [rivalAuroraVeil, setRivalAuroraVeil] = useState(false);
  const [goal, setGoal] = useState('ohko');
  const [builds, setBuilds] = useState(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);

  const defAbilityEff = target && target.abilities.includes(defAbility) ? defAbility : (target?.abilities[0] ?? '');
  const myMoves = mon.moves.filter((m) => m && data.moveData?.[m]?.category !== 'Status');
  const activeMoveId = myMoves.includes(moveId) ? moveId : (myMoves[0] ?? '');
  const move = activeMoveId ? data.moveData?.[activeMoveId] : undefined;
  // Build más usado del objetivo (por id o por su especie base).
  const metaBuild = useMemo(() => {
    if (!builds || !target) return null;
    return builds.pokemon[target.id] ?? (target.baseSpeciesId ? builds.pokemon[target.baseSpeciesId] : null) ?? null;
  }, [builds, target]);
  const hasMeta = !!metaBuild?.spreads?.[0];
  // Objeto del objetivo: manual, o el más usado del meta cuando se elige ese spread.
  const metaItem = metaBuild?.items?.[0]?.name;
  const offItem = bulk === 'meta' ? (metaItem && metaItem !== 'Sin objeto' ? metaItem : '') : defItem;

  const calc = useMemo(() => {
    if (!target || !activeMoveId || !move || move.category === 'Status') return null;
    const atkStat = move.category === 'Physical' ? 'atk' : 'spa';
    let dEvs = { ...ZERO_EVS };
    let dNature = NAT.neutral;
    if (bulk === 'hp') dEvs = { ...ZERO_EVS, hp: 32 };
    else if (bulk === 'def') dEvs = { ...ZERO_EVS, def: 32 };
    else if (bulk === 'spd') dEvs = { ...ZERO_EVS, spd: 32 };
    else if (bulk === 'hpdef') dEvs = { ...ZERO_EVS, hp: 32, def: 32 };
    else if (bulk === 'hpspd') dEvs = { ...ZERO_EVS, hp: 32, spd: 32 };
    if (bulk === 'meta' && metaBuild?.spreads?.[0]) {
      dEvs = parseSpread(metaBuild.spreads[0].evs);
      dNature = metaBuild.spreads[0].nature; // la naturaleza viene del propio spread
    } else if (defNatureFav) {
      dNature = atkStat === 'atk' ? 'Bold' : 'Calm'; // sube la defensa relevante (+Def o +SpD)
    }
    const def = makeTarget(target, dEvs, dNature, offItem, defAbilityEff);
    const field = { ...FIELD, weather, terrain, singleTarget };
    const atkSide = { ...SIDE, helpingHand: myHH };
    const defSide = { ...SIDE, reflect: rivalReflect, lightScreen: rivalLightScreen, auroraVeil: rivalAuroraVeil };
    const base = teamToCalc(mon);
    const need = goal === 'ohko' ? 100 : 50; // pctMin garantizado

    const solveFor = (monBase) => {
      for (let sp = 0; sp <= 32; sp++) {
        const me = { ...monBase, evs: { ...monBase.evs, [atkStat]: sp } };
        const r = calcMove(me, def, activeMoveId, field, atkSide, defSide);
        if (r && r.pctMin >= need) return { ok: true, sp, pctMin: r.pctMin, pctMax: r.pctMax };
      }
      const best = calcMove({ ...monBase, evs: { ...monBase.evs, [atkStat]: 32 } }, def, activeMoveId, field, atkSide, defSide);
      return { ok: false, pctMin: best?.pctMin ?? 0, pctMax: best?.pctMax ?? 0 };
    };

    const res = solveFor(base);
    let natHint = null;
    if (getNatureMod(mon.nature, atkStat) <= 0) {
      const altNat = atkStat === 'atk' ? NAT.atk : NAT.spa;
      const alt = solveFor({ ...base, nature: altNat });
      if (alt.ok && (!res.ok || alt.sp < res.sp)) {
        natHint = { sp: alt.sp, saved: res.ok ? res.sp - alt.sp : null };
      }
    }
    return { ...res, atkStat, natHint };
  }, [target, activeMoveId, move, bulk, goal, defNatureFav, offItem, defAbilityEff, singleTarget, weather, terrain, myHH, rivalReflect, rivalLightScreen, rivalAuroraVeil, metaBuild, mon]);

  const mySpecies = getSpecies(mon.speciesId);
  const myStats = useMemo(() => {
    if (!mySpecies) return null;
    return calcAllStats(mySpecies.baseStats, getMonSp(mon), mon.ivs, mon.nature, mon.level || 50, 'champions');
  }, [mySpecies, mon]);

  const handleAddOffGoal = () => {
    if (!calc?.ok || !target || !move) return;
    const bulkLabel = bulk === 'meta' ? 'Meta'
      : bulk === 'none' ? '0 bulk'
      : bulk === 'hp' ? 'HP máx'
      : bulk === 'def' ? 'Def máx'
      : bulk === 'spd' ? 'SpD máx'
      : bulk === 'hpdef' ? 'HP/Def máx' : 'HP/SpD máx';
    const mods = [goal.toUpperCase(), bulkLabel];
    if (!singleTarget) mods.push('Área');
    if (defNatureFav && bulk !== 'meta') mods.push('+nat');
    if (offItem) mods.push(offItem);
    if (weather) mods.push(weather);
    if (terrain) mods.push(terrain);
    if (myHH) mods.push('Refuerzo');
    if (rivalReflect) mods.push('Reflejo rival');
    if (rivalLightScreen) mods.push('P. Luz rival');
    if (rivalAuroraVeil) mods.push('Velo Aurora rival');
    onAddGoal({
      type: 'offense',
      targetId: target.id,
      targetName: target.name,
      moveId: activeMoveId,
      moveName: data.moveNames?.[activeMoveId] ?? activeMoveId,
      atkStat: calc.atkStat,
      goal,
      minSp: calc.sp,
      pctMin: calc.pctMin,
      pctMax: calc.pctMax,
      detail: mods.join(' · '),
    });
  };

  const remainMin = calc ? Math.max(0, 100 - calc.pctMax) : 0;
  const remainMax = calc ? Math.max(0, 100 - calc.pctMin) : 0;
  const redWidth = calc ? Math.max(0, Math.min(100, calc.pctMin)) : 0;
  const yellowWidth = calc ? Math.max(0, remainMax - remainMin) : 0;

  return (
    <div className="panel p-4 space-y-3 animate-fade-in-up">
      {/* Cara a cara (Versus) */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-stretch">
        {/* Tu Pokémon */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3.5 my-auto">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className={`absolute inset-1 rounded-full blur-md pointer-events-none ${mySpecies?.types?.[0] ? `type-glow-${mySpecies.types[0].toLowerCase()}` : 'bg-poke-pink/15'}`} />
              <PokemonSprite speciesId={mon.speciesId} className="relative w-20 h-20 object-contain drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-poke-pink">{t('Tu Pokémon')}</div>
              <div className="text-lg font-bold text-white truncate leading-tight">{mon.speciesName}</div>
              {mySpecies && mySpecies.types.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {mySpecies.types.map((type) => (
                    <span key={type} className={`type-${type.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium leading-none`}>{type}</span>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-gray-400 truncate mt-1.5">
                {mon.ability ? localizeName('abilities', mon.ability, lang) : '—'}
                {mon.item ? ` · ${localizeName('items', mon.item, lang)}` : ''}
              </div>
            </div>
            {myStats && (
              <div className="shrink-0 flex flex-col gap-1 pl-2.5 border-l border-poke-accent/40 text-right font-mono text-xs">
                <div><span className="text-gray-400">Atk</span> <strong className="text-white">{myStats.atk}</strong></div>
                <div><span className="text-gray-400">SpA</span> <strong className="text-white">{myStats.spa}</strong></div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {myMoves.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5">
                {myMoves.map((mid) => {
                  const md = data.moveData?.[mid];
                  const isActive = activeMoveId === mid;
                  const typeLbl = md?.type ?? '';
                  const typeCls = typeLbl ? `type-${typeLbl.toLowerCase()}` : 'bg-poke-accent';
                  return (
                    <button
                      key={mid}
                      type="button"
                      onClick={() => setMoveId(mid)}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all active:scale-95 ${
                        isActive
                          ? 'border-poke-pink bg-poke-pink/15 text-white font-medium'
                          : 'border-poke-accent bg-poke-dark/50 text-gray-300 hover:border-poke-pink/50 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{localizeName('moves', data.moveNames?.[mid] ?? mid, lang)}</span>
                      {typeLbl && (
                        <span className={`${typeCls} px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none shrink-0`}>
                          {typeLbl}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t('Este Pokémon no tiene movimientos ofensivos en el equipo.')}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <ToggleChip active={goal === 'ohko'} onClick={() => setGoal('ohko')} className="w-full text-xs">
                OHKO
              </ToggleChip>
              <ToggleChip active={goal === '2hko'} onClick={() => setGoal('2hko')} className="w-full text-xs">
                2HKO
              </ToggleChip>
              <ToggleChip active={!singleTarget} onClick={() => setSingleTarget((v) => !v)} title={t('Objetivo del ataque')} className="w-full text-xs">
                {singleTarget ? t('Único') : t('Área')}
              </ToggleChip>
            </div>
          </div>
        </div>

        {/* Separador VS */}
        <div className="flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-poke-dark border border-poke-accent flex items-center justify-center text-[11px] font-extrabold tracking-wider text-gray-400">
            VS
          </div>
        </div>

        {/* Objetivo rival */}
        <div className="bg-poke-dark/70 border border-poke-accent/60 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            {target ? (
              <PokemonSprite speciesId={target.id} className="w-14 h-14 object-contain shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-poke-dark border border-dashed border-poke-accent/70 flex items-center justify-center text-gray-600 text-lg font-bold shrink-0">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-400 mb-1 flex items-center gap-1.5">
                {t('Objetivo rival')}
                <InfoTooltip label={t('Más información')} side="bottom">
                  {lang === 'en'
                    ? 'The Pokémon you want to knock out. Finds the minimum Atk/SpA Stat Points so the low damage roll guarantees an OHKO or 2HKO against its chosen bulk, nature, ability and item.'
                    : 'El Pokémon al que quieres debilitar. Calcula los Stat Points mínimos de Atk/SpA para que la tirada mínima garantice OHKO o 2HKO contra su defensa, naturaleza, habilidad y objeto.'}
                </InfoTooltip>
              </div>
              <SpeciesSearch data={data} value={target?.name ?? ''} onPick={(sp) => setTargetId(sp.id)} placeholder={t('Buscar objetivo…')} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Dropdown
              className="flex-1 min-w-0"
              expand
              value={bulk}
              options={['none', 'hp', 'def', 'spd', 'hpdef', 'hpspd', ...(hasMeta ? ['meta'] : [])]}
              render={(b) => b === 'meta' ? `${t('Spread del meta')} (${metaSpreadEvs(metaBuild)})` : t(
                b === 'none' ? 'Sin invertir' : b === 'hp' ? 'HP máx' : b === 'def' ? 'Def máx' :
                b === 'spd' ? 'SpD máx' : b === 'hpdef' ? 'HP/Def máx' : 'HP/SpD máx'
              )}
              onChange={(b) => setBulk(b)}
            />
            <ToggleChip variant="sky" active={defNatureFav && bulk !== 'meta'} disabled={bulk === 'meta'} onClick={() => setDefNatureFav((v) => !v)} className="text-xs shrink-0">
              {t('Nat. favorable')}
            </ToggleChip>
          </div>

          <div className={`grid gap-2 ${target ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <ItemSearch items={DEFENSIVE_ITEMS.filter((i) => data.items.includes(i))} value={offItem} onPick={setDefItem} placeholder={t('Sin objeto')} lang={lang} disabled={bulk === 'meta'} clearable />
            {target && (
              <Dropdown value={defAbilityEff} options={target.abilities} render={(a) => localizeName('abilities', a, lang)} onChange={setDefAbility} />
            )}
          </div>
        </div>
      </div>

      {/* Condiciones de campo (Clima, Terreno y Efectos) */}
      <FieldConditionsBar
        weather={weather}
        onWeather={setWeather}
        terrain={terrain}
        onTerrain={setTerrain}
        t={t}
        extras={
          <>
            <ToggleChip active={myHH} onClick={() => setMyHH((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Refuerzo')}
            </ToggleChip>
            <ToggleChip variant="sky" active={rivalReflect} onClick={() => setRivalReflect((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Reflejo')} ({t('rival')})
            </ToggleChip>
            <ToggleChip variant="sky" active={rivalLightScreen} onClick={() => setRivalLightScreen((v) => !v)} className="text-xs px-2.5 py-1">
              {t('P. Luz')} ({t('rival')})
            </ToggleChip>
            <ToggleChip variant="sky" active={rivalAuroraVeil} onClick={() => setRivalAuroraVeil((v) => !v)} className="text-xs px-2.5 py-1">
              {t('Velo Aurora')} ({t('rival')})
            </ToggleChip>
          </>
        }
      />

      {/* Resultado con barra de daño */}
      {calc && (
        <div className={`rounded-xl border p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 animate-fade-in-up ${calc.ok ? 'border-green-500/40 bg-green-900/15' : 'border-red-500/40 bg-red-900/15'}`}>
          <div className="shrink-0 text-center min-w-[64px]">
            {calc.ok ? (
              <>
                <div className="text-4xl font-bold text-poke-pink font-mono leading-none">{calc.sp}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">stat points</div>
              </>
            ) : (
              <span className="text-3xl font-bold text-red-400/70 leading-none">—</span>
            )}
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="flex items-baseline justify-between gap-2 text-sm mb-1.5">
              <span className="text-gray-200 truncate">
                {calc.ok
                  ? <><strong className="text-white">{goal.toUpperCase()}</strong> ({calc.atkStat === 'atk' ? 'Atk' : 'SpA'}) · {localizeName('moves', data.moveNames?.[activeMoveId] ?? activeMoveId, lang)}</>
                  : t('No se logra ni con 32 SP')}
              </span>
              <span className={`font-mono text-xs font-bold shrink-0 ${calc.ok ? 'text-green-400' : 'text-red-400'}`}>
                {calc.pctMin}–{calc.pctMax}%
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-black/45">
              <div className="bg-green-600 transition-[width] duration-300 ease-out" style={{ width: `${remainMin}%` }} />
              <div className="bg-yellow-500/70 transition-[width] duration-300 ease-out" style={{ width: `${yellowWidth}%` }} />
              <div className="bg-red-600/70 transition-[width] duration-300 ease-out" style={{ width: `${redWidth}%` }} />
            </div>
            {calc.natHint && (
              <div className="text-[11px] text-amber-300/90 mt-1 inline-flex items-center gap-1">
                <Icon name="bulb" className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t('Con naturaleza')} <strong className="font-mono">+{calc.atkStat === 'atk' ? 'Atk' : 'SpA'}</strong>:{' '}
                  <strong className="font-mono">{calc.natHint.sp} SP</strong>
                  {calc.natHint.saved != null && ` (${t('ahorras')} ${calc.natHint.saved} SP)`}
                </span>
              </div>
            )}
          </div>

          {calc.ok && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleAddOffGoal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-poke-accent text-gray-200 hover:border-poke-pink/60 hover:text-white transition-colors"
              >
                + {t('Al combinador')}
              </button>
              <button
                type="button"
                onClick={() => onApply({ [calc.atkStat]: calc.sp })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-pink/20 border border-poke-pink/50 text-poke-pink hover:bg-poke-pink/30 transition-colors"
              >
                {t('Aplicar al equipo')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 🎯 Combinador de objetivos (Spread completo de 66 SP) ─────────────────────
function GoalCombiner({ mon, goals, data, t, lang, onRemoveGoal, onClear, onApplySpread }) {
  const solved = useMemo(() => solveCombinedGoals(mon, goals), [mon, goals]);
  const [bonusSp, setBonusSp] = useState({ ...ZERO_EVS });
  const species = getSpecies(mon.speciesId);

  // Combina el reparto mínimo resuelto + los SP libres que el usuario haya volcado (siempre respetando 32/stat y 66 total).
  const combined = useMemo(() => {
    if (!solved || !solved.defFeasible) return null;
    if (!solved.fits) return { spread: solved.spread, total: solved.total, remaining: solved.remaining, hasBonus: false };
    let left = solved.remaining;
    const spread = { ...solved.spread };
    let hasBonus = false;
    for (const k of STAT_KEY) {
      const want = bonusSp[k] || 0;
      if (want > 0 && left > 0) {
        const add = Math.min(want, 32 - spread[k], left);
        if (add > 0) {
          spread[k] += add;
          left -= add;
          hasBonus = true;
        }
      }
    }
    return { spread, total: MAX_TOTAL_STAT_POINTS - left, remaining: left, hasBonus };
  }, [solved, bonusSp]);

  const finalStats = useMemo(() => {
    if (!combined || !species) return null;
    return calcAllStats(species.baseStats, combined.spread, mon.ivs, mon.nature, mon.level || 50, 'champions');
  }, [combined, species, mon]);

  const dumpRemainingInto = (k) => {
    if (!combined || combined.remaining <= 0) return;
    const room = 32 - combined.spread[k];
    if (room <= 0) return;
    const add = Math.min(combined.remaining, room);
    setBonusSp((prev) => ({ ...prev, [k]: (prev[k] || 0) + add }));
  };

  return (
    <div className="panel p-4 mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
            <Icon name="target" className="w-4 h-4 text-poke-pink" />
            {t('Combinador de objetivos')} ({mon.speciesName})
            <InfoTooltip label={t('Más información')} side="top">
              {lang === 'en'
                ? 'Combine multiple Speed, Defense and Offense benchmarks for this Pokémon into a single 66 Stat Points spread. For multiple defensive targets, it optimizes HP + Def + SpD together to save points.'
                : 'Combina varios requisitos de Velocidad, Defensa y Ataque para este Pokémon en un único reparto de 66 Stat Points. Si añades varios ataques a sobrevivir, optimiza HP + Def + SpD a la vez para ahorrar puntos.'}
            </InfoTooltip>
          </h3>
          {goals.length > 0 && (
            <span className="text-xs font-mono text-gray-400">
              {goals.length} {goals.length === 1 ? t('objetivo') : t('objetivos')}
            </span>
          )}
        </div>
        {goals.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            {t('Limpiar lista')}
          </button>
        )}
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-gray-400">
          {t('Añade objetivos desde Velocidad, Defensa o Ataque con «+ Al combinador» para calcular el reparto conjunto en 66 SP.')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {goals.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-2 bg-poke-dark/60 border border-poke-accent/40 rounded-lg px-2.5 py-2"
              >
                <PokemonSprite speciesId={g.type === 'defense' ? g.atkId : g.targetId} className="w-8 h-8 object-contain shrink-0" />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-medium text-white truncate flex items-center gap-1.5">
                    {g.type === 'speed' && <><Icon name="bolt" className="w-3.5 h-3.5 text-amber-300 shrink-0" /><span className="truncate">{t('Superar a')} {g.targetName}</span></>}
                    {g.type === 'defense' && <><Icon name="shield" className="w-3.5 h-3.5 text-sky-400 shrink-0" /><span className="truncate">{g.atkName} · {localizeName('moves', data.moveNames?.[g.moveId] ?? g.moveName, lang)}</span></>}
                    {g.type === 'offense' && <><Icon name="sword" className="w-3.5 h-3.5 text-poke-pink shrink-0" /><span className="truncate">{localizeName('moves', data.moveNames?.[g.moveId] ?? g.moveName, lang)} → {g.targetName}</span></>}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {g.detail}
                    {g.type === 'speed' && <> · <span className="text-poke-pink font-mono">{g.minSpe} Spe</span></>}
                    {g.type === 'offense' && <> · <span className="text-poke-pink font-mono">{g.minSp} {g.atkStat === 'atk' ? 'Atk' : 'SpA'}</span></>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={t('Eliminar')}
                  onClick={() => onRemoveGoal(g.id)}
                  className="shrink-0 px-1.5 py-0.5 text-gray-500 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {solved && (
            <div className={`rounded-xl border p-4 space-y-3 ${solved.fits ? 'border-green-500/40 bg-green-900/15' : 'border-red-500/40 bg-red-900/15'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold font-mono ${solved.fits ? 'text-green-400' : 'text-red-400'}`}>
                    {combined ? `${combined.total} / ${MAX_TOTAL_STAT_POINTS} SP` : '—'}
                  </span>
                  <span className="text-xs text-gray-300">
                    {!solved.defFeasible
                      ? t('Imposible sobrevivir a todos los ataques defensivos a la vez.')
                      : solved.fits
                        ? `${t('Reparto viable')} · ${combined.remaining} SP ${t('libres')}`
                        : `${t('Excede el presupuesto por')} ${-solved.remaining} SP`}
                  </span>
                </div>
                {solved.fits && combined && (
                  <button
                    type="button"
                    onClick={() => onApplySpread(combined.spread)}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {t('Aplicar spread al equipo')}
                  </button>
                )}
              </div>

              {solved.fits && combined && (combined.remaining > 0 || combined.hasBonus) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-gray-400 mr-1">
                    {combined.remaining > 0
                      ? `${t('Volcar')} ${combined.remaining} SP ${t('libres en')}:`
                      : `${t('SP libres asignados')}:`}
                  </span>
                  {STAT_KEY.map((k, i) => {
                    const disabled = combined.remaining <= 0 || combined.spread[k] >= 32;
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={disabled}
                        onClick={() => dumpRemainingInto(k)}
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border border-poke-accent bg-poke-dark/60 text-gray-200 hover:border-poke-pink hover:text-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                      >
                        +{STAT_LBL[i]}
                      </button>
                    );
                  })}
                  {combined.hasBonus && (
                    <button
                      type="button"
                      onClick={() => setBonusSp({ ...ZERO_EVS })}
                      className="ml-1 text-[11px] text-poke-pink hover:text-white transition-colors"
                    >
                      {t('Reset')}
                    </button>
                  )}
                </div>
              )}

              {combined && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  {STAT_KEY.map((k, i) => (
                    <div
                      key={k}
                      className={`rounded-lg py-1.5 px-1 ${getStatNatureClass(mon.nature, k) || 'bg-poke-dark/50'}`}
                    >
                      <div className="text-[10px] text-gray-400 uppercase">{STAT_LBL[i]}</div>
                      <div className={`font-mono text-base font-bold ${combined.spread[k] > 0 ? 'text-poke-pink' : 'text-gray-500'}`}>
                        {combined.spread[k]}
                      </div>
                      {finalStats && (
                        <div className="font-mono text-[10px] text-gray-400">{finalStats[k]}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}