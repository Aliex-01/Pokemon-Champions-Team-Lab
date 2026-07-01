import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpecies, getLearnset, localizeName } from '../lib/championsData';
import { PokemonSprite } from '../components/PokemonSprite';
import { Dropdown } from '../components/Dropdown';
import { MoveSearch } from '../components/MoveSearch';
import { ItemSearch } from '../components/ItemSearch';
import { SegmentedControl } from '../components/SegmentedControl';
import { calcMove, emptySide, type CalcMon, type FieldState } from '../lib/damageCalc';
import { calcAllStats, getNatureMod } from '../lib/stats';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { DEFAULT_IVS } from '../types/pokemon';
import type { ChampionsData, SpeciesData, EvSpread, TeamPokemon, MetaBuildsData } from '../types/pokemon';

const parseSpread = (evs: string): EvSpread => {
  const [hp, atk, def, spa, spd, spe] = evs.split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
};

const STAT_LBL = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
const STAT_KEY = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
// EVs del set más usado con signo de naturaleza: "32 HP / +32 Atk / −4 SpA".
function metaSpreadEvs(build: { spreads?: { evs: string; nature: string }[] } | null): string {
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

interface Props { data: ChampionsData }

const ZERO_EVS: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

// Estado persistido en localStorage (recuerda el Pokémon elegido entre páginas).
function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw) as T; } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ } }, [key, state]);
  return [state, setState];
}
const FIELD: FieldState = { weather: '', terrain: '', crit: false, gravity: false, magicRoom: false, wonderRoom: false, singleTarget: true };
const SIDE = emptySide();
// Naturalezas para los presets del objetivo.
const NAT = { spe: 'Jolly', atk: 'Adamant', spa: 'Modest', neutral: 'Hardy' };

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

function teamToCalc(p: TeamPokemon): CalcMon {
  return {
    speciesId: p.speciesId, speciesName: p.speciesName, level: p.level || 50,
    ability: p.ability, item: p.item, nature: p.nature, evMode: p.evMode, evs: p.evs, ivs: p.ivs,
    moves: [...p.moves], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

function makeTarget(sp: SpeciesData, evs: EvSpread, nature: string, item = '', ability = ''): CalcMon {
  return {
    speciesId: sp.id, speciesName: sp.name, level: 50, ability: ability || sp.abilities[0] || '', item,
    nature, evMode: 'champions', evs, ivs: { ...DEFAULT_IVS },
    moves: ['', '', '', ''], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

// Habilidades que duplican Velocidad según el clima.
const WEATHER_SPEED_ABILITY: Record<string, string> = { Sun: 'Chlorophyll', Rain: 'Swift Swim', Sand: 'Sand Rush', Snow: 'Slush Rush' };
const weatherSpeedMult = (abilities: string[], weather: string) =>
  weather && abilities.includes(WEATHER_SPEED_ABILITY[weather]) ? 2 : 1;

const speedWith = (mon: CalcMon, spe: number, opts: { tailwind?: boolean; scarf?: boolean; weatherMult?: number } = {}) => {
  const sp = getSpecies(mon.speciesId);
  if (!sp) return 0;
  let v = calcAllStats(sp.baseStats, { ...mon.evs, spe }, mon.ivs, mon.nature, mon.level || 50, mon.evMode).spe;
  if (opts.weatherMult && opts.weatherMult > 1) v = Math.floor(v * opts.weatherMult);
  if (opts.scarf) v = Math.floor(v * 1.5);
  if (opts.tailwind) v = Math.floor(v * 2);
  return v;
};

// ── Buscador de especies ─────────────────────────────────────────────────────
function SpeciesSearch({ data, value, onPick, placeholder }: { data: ChampionsData; value: string; onPick: (sp: SpeciesData) => void; placeholder: string }) {
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
function ToggleChip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${active ? 'border-poke-pink bg-poke-pink/15 text-poke-pink' : 'border-poke-accent text-gray-300 hover:bg-poke-accent/40'}`}
    >
      {children}
    </button>
  );
}

// Input numérico con steppers −/+ (mismo estilo que los EVs de la Calculadora).
function NumStepper({ value, onChange, max = 32 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, v)));
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

function ResultCard({ ok, sp, sprite, children }: { ok: boolean; sp?: number | null; sprite?: string; children: React.ReactNode }) {
  return (
    <div className={`mt-1 rounded-xl border p-4 flex items-center gap-4 animate-fade-in-up ${ok ? 'border-green-500/40 bg-green-900/15' : 'border-red-500/40 bg-red-900/15'}`}>
      {sprite && <PokemonSprite speciesId={sprite} className="w-12 h-12 object-contain shrink-0" />}
      <div className="shrink-0 text-center min-w-[60px]">
        {ok && sp != null ? (
          <>
            <div className="text-4xl font-bold text-poke-pink leading-none">{sp}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">stat points</div>
          </>
        ) : (
          <span className="text-3xl font-bold text-red-400/70 leading-none">—</span>
        )}
      </div>
      <div className="text-sm text-gray-200 flex-1">{children}</div>
    </div>
  );
}

export function OptimizerView({ data }: Props) {
  const { activeTeam } = useTeam();
  const { t, lang } = useLang();
  const team = (activeTeam?.pokemon ?? []).filter((p) => p.speciesId);
  const [slot, setSlot] = usePersistedState<number>('optimizer-slot', 0);
  const [tab, setTab] = usePersistedState<'speed' | 'defense' | 'offense'>('optimizer-tab', 'speed');

  // Si el equipo cambió y el índice quedó fuera de rango, vuelve al primero.
  const idx = slot < team.length ? slot : 0;
  const mon = team[idx];

  if (team.length === 0) {
    return (
      <div className="page-enter">
        <div className="mb-4"><h2 className="text-2xl font-bold">{t('Optimizador de EVs')}</h2></div>
        <div className="panel p-6 text-gray-400 text-center">{t('Añade Pokémon a tu equipo para optimizar sus EVs.')}</div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Optimizador de EVs')}</h2>
      </div>

      {/* Elegir tu Pokémon */}
      <div className="panel p-4 mb-4">
        <div className="text-xs text-gray-400 uppercase mb-2">{t('Tu Pokémon')}</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {team.map((p, i) => {
            const types = getSpecies(p.speciesId)?.types ?? [];
            return (
              <button
                key={p.slotId}
                type="button"
                onClick={() => setSlot(i)}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all active:scale-95 ${idx === i ? 'border-poke-pink bg-poke-pink/10 ring-1 ring-poke-pink/40' : 'border-poke-accent/40 hover:border-poke-accent hover:bg-poke-accent/20 hover:-translate-y-0.5'}`}
              >
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
          { value: 'speed', label: <>🏃 {t('Velocidad')}</> },
          { value: 'defense', label: <>🛡️ {t('Defensa')}</> },
          { value: 'offense', label: <>⚔️ {t('Ataque')}</> },
        ]}
      />

      {tab === 'speed' && <SpeedTool data={data} mon={mon} t={t} />}
      {tab === 'defense' && <DefenseTool data={data} mon={mon} t={t} lang={lang} />}
      {tab === 'offense' && <OffenseTool data={data} mon={mon} t={t} lang={lang} />}
    </div>
  );
}

// ── 🏃 Velocidad ──────────────────────────────────────────────────────────────
function SpeedTool({ data, mon, t }: { data: ChampionsData; mon: TeamPokemon; t: (s: string) => string }) {
  const [targetId, setTargetId] = usePersistedState<string>('optimizer-speed-target', '');
  const target = targetId ? getSpecies(targetId) ?? null : null;
  const [preset, setPreset] = useState<'maxpos' | 'maxneu' | 'min' | 'meta'>('maxpos');
  const [myTailwind, setMyTailwind] = useState(false);
  const [myScarf, setMyScarf] = useState(mon.item === 'Choice Scarf');
  const [tgtTailwind, setTgtTailwind] = useState(false);
  const [tgtScarf, setTgtScarf] = useState(false);
  const [weather, setWeather] = useState('');
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  const metaBuild = useMemo(() => {
    if (!builds || !target) return null;
    return builds.pokemon[target.id] ?? (target.baseSpeciesId ? builds.pokemon[target.baseSpeciesId] : null) ?? null;
  }, [builds, target]);
  const hasMeta = !!metaBuild?.spreads?.[0];

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
    const tgtSpeed = speedWith(tgtMon, evs.spe, { tailwind: tgtTailwind, scarf: tgtScarfEff, weatherMult: weatherSpeedMult(target.abilities, weather) });
    const me = teamToCalc(mon);
    const myWeather = weatherSpeedMult([mon.ability], weather);
    const mine = (sp: number) => speedWith(me, sp, { tailwind: myTailwind, scarf: myScarf, weatherMult: myWeather });
    for (let sp = 0; sp <= 32; sp++) {
      if (mine(sp) > tgtSpeed) return { ok: true, sp, mySpeed: mine(sp), tgtSpeed };
    }
    return { ok: false, tgtSpeed, mySpeed: mine(32) };
  }, [target, preset, tgtTailwind, tgtScarf, myTailwind, myScarf, weather, metaBuild, mon]);

  return (
    <div className="panel p-4 grid gap-4 sm:grid-cols-2 animate-fade-in-up">
      <div>
        <div className="text-xs text-gray-400 uppercase mb-1">{t('Superar a')}</div>
        <SpeciesSearch data={data} value={target?.name ?? ''} onPick={(sp) => setTargetId(sp.id)} placeholder={t('Buscar Pokémon objetivo…')} />
        <div className="mt-2">
          <Dropdown value={preset} options={['maxpos', 'maxneu', 'min', ...(hasMeta ? ['meta'] : [])]} render={(p) => p === 'meta' ? `${t('Spread del meta')} (${metaSpreadEvs(metaBuild)})` : t(p === 'maxpos' ? 'Máx velocidad (+nat)' : p === 'maxneu' ? 'Máx velocidad (neutra)' : 'Sin invertir (0)')} onChange={(p) => setPreset(p as typeof preset)} />
        </div>
        <div className="text-xs text-gray-400 uppercase mb-1 mt-3">{t('Clima (ambos)')}</div>
        <Dropdown value={weather} options={['', 'Sun', 'Rain', 'Sand', 'Snow']} render={(w) => t(w === '' ? 'Sin clima' : w === 'Sun' ? 'Sol' : w === 'Rain' ? 'Lluvia' : w === 'Sand' ? 'Arena' : 'Nieve')} onChange={setWeather} placeholder={t('Sin clima')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-400 uppercase mb-1">{t('Opciones de tu Pokémon')}</div>
          <div className="flex flex-col gap-2 [&_button]:w-full">
            <ToggleChip active={myTailwind} onClick={() => setMyTailwind((v) => !v)}>Tailwind</ToggleChip>
            <ToggleChip active={myScarf} onClick={() => setMyScarf((v) => !v)}>Choice Scarf</ToggleChip>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase mb-1">{t('Opciones de tu rival')}</div>
          <div className="flex flex-col gap-2 [&_button]:w-full">
            <ToggleChip active={tgtTailwind} onClick={() => setTgtTailwind((v) => !v)}>Tailwind</ToggleChip>
            <ToggleChip active={tgtScarf} onClick={() => setTgtScarf((v) => !v)}>Choice Scarf</ToggleChip>
          </div>
        </div>
      </div>
      {calc && (
        <div className="sm:col-span-2">
          {calc.ok ? (
            <ResultCard ok sp={calc.sp} sprite={target?.id}>{t('en Velocidad')} → {t('tu velocidad')} <strong className="text-white">{calc.mySpeed}</strong> {t('supera')} {calc.tgtSpeed}.</ResultCard>
          ) : (
            <ResultCard ok={false} sprite={target?.id}>{t('No lo superas ni con 32 SP')} ({t('tú')} {calc.mySpeed} vs {calc.tgtSpeed}).</ResultCard>
          )}
        </div>
      )}
    </div>
  );
}

// ── 🛡️ Defensa (sobrevivir) ──────────────────────────────────────────────────
function DefenseTool({ data, mon, t, lang }: { data: ChampionsData; mon: TeamPokemon; t: (s: string) => string; lang: 'es' | 'en' }) {
  const [atkId, setAtkId] = usePersistedState<string>('optimizer-def-atk', '');
  const atk = atkId ? getSpecies(atkId) ?? null : null;
  const [moveId, setMoveId] = usePersistedState<string>('optimizer-def-move', '');
  const [atkItem, setAtkItem] = usePersistedState<string>('optimizer-def-item', '');
  const [atkInvest, setAtkInvest] = useState<'max' | 'none' | 'meta'>('max');
  const [atkNatureFav, setAtkNatureFav] = useState(true);
  const [hits, setHits] = useState<1 | 2>(1);
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);
  // Suelos opcionales por stat (p. ej. 14 HP ya decidido). La defensa no relevante
  // se mantiene en su mínimo (cuenta como inversión fija, no ayuda a sobrevivir).
  const [hpMin, setHpMin] = useState(0);
  const [defMin, setDefMin] = useState(0);
  const [spdMin, setSpdMin] = useState(0);
  const [atkAbility, setAtkAbility] = usePersistedState<string>('optimizer-def-ability', '');
  // Objetivo del ataque: único (sin reducción) o área/doble (×0.75 para movimientos de área).
  const [singleTarget, setSingleTarget] = usePersistedState<boolean>('optimizer-def-single', true);
  // Habilidad efectiva del atacante (la elegida si es válida; si no, la primera).
  const atkAbilityEff = atk && atk.abilities.includes(atkAbility) ? atkAbility : (atk?.abilities[0] ?? '');

  const learn = atk ? getLearnset(atk.id, data) : [];
  const move = moveId ? data.moveData?.[moveId] : undefined;
  const defStat: 'def' | 'spd' = move?.category === 'Physical' ? 'def' : 'spd';
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
    const field: FieldState = { ...FIELD, singleTarget };
    const base = teamToCalc(mon);
    // La defensa que NO interviene en este ataque se fija a su mínimo.
    const otherStat = defStat === 'def' ? 'spd' : 'def';
    const otherMin = defStat === 'def' ? spdMin : defMin;
    const relMin = defStat === 'def' ? defMin : spdMin;
    const evsFor = (hp: number, dv: number) => ({ ...base.evs, hp, [defStat]: dv, [otherStat]: otherMin });
    // Sobrevivir N golpes: el daño máximo acumulado no llega al 100%.
    const survives = (hp: number, dv: number) => {
      const r = calcMove(attacker, { ...base, evs: evsFor(hp, dv) }, moveId, field, SIDE, SIDE);
      return r ? r.pctMax * hits < 100 : false;
    };
    // Mínimo total HP + defensa relevante (busca por presupuesto creciente), respetando suelos.
    for (let total = hpMin + relMin; total <= 64; total++) {
      for (let hp = hpMin; hp <= Math.min(32, total - relMin); hp++) {
        const dv = total - hp;
        if (dv > 32 || dv < relMin) continue;
        if (survives(hp, dv)) {
          const r = calcMove(attacker, { ...base, evs: evsFor(hp, dv) }, moveId, field, SIDE, SIDE);
          return { ok: true, hp, dv, total, pct: (r?.pctMax ?? 0) * hits };
        }
      }
    }
    const worst = calcMove(attacker, { ...base, evs: evsFor(32, 32) }, moveId, field, SIDE, SIDE);
    return { ok: false, pct: (worst?.pctMax ?? 0) * hits };
  }, [atk, moveId, move, defStat, hits, hpMin, defMin, spdMin, atkItemEff, atkInvest, atkNatureFav, atkAbilityEff, singleTarget, metaBuild, mon]);

  const defLabel = defStat === 'def' ? 'Def' : 'SpD';

  return (
    <div className="panel p-4 grid gap-4 sm:grid-cols-2 animate-fade-in-up">
      <div>
        <div className="text-xs text-gray-400 uppercase mb-1">{t('Atacante')}</div>
        <SpeciesSearch data={data} value={atk?.name ?? ''} onPick={(sp) => { setAtkId(sp.id); setMoveId(''); }} placeholder={t('Buscar atacante…')} />
        <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Movimiento')}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MoveSearch moves={learn} value={moveId} names={data.moveNames ?? {}} onPick={setMoveId} placeholder={t('Buscar movimiento…')} lang={lang} />
          </div>
          <ToggleChip active={!singleTarget} onClick={() => setSingleTarget((v) => !v)} title={t('Objetivo del ataque')}>
            {singleTarget ? t('Único') : t('Área')}
          </ToggleChip>
        </div>
        <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Objeto del atacante')}</div>
        <ItemSearch items={OFFENSIVE_ITEMS.filter((i) => data.items.includes(i))} value={atkItemEff} onPick={setAtkItem} placeholder={t('Sin objeto')} lang={lang} disabled={atkInvest === 'meta'} clearable />
        {atk && (
          <>
            <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Habilidad del rival')}</div>
            <Dropdown value={atkAbilityEff} options={atk.abilities} render={(a) => localizeName('abilities', a, lang)} onChange={setAtkAbility} />
          </>
        )}
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase mb-1">{t('Aguantar')}</div>
        <Dropdown value={String(hits)} options={['1', '2']} render={(h) => (h === '1' ? t('1 golpe') : t('2 golpes'))} onChange={(h) => setHits(Number(h) as 1 | 2)} />
        <div className="text-xs text-gray-400 uppercase mb-1 mt-3">{t('Ataque del rival')}</div>
        <div className="flex items-center gap-2">
          <Dropdown
            className="flex-1 min-w-0"
            value={atkInvest}
            options={['max', 'none', ...(hasMeta ? ['meta'] : [])]}
            render={(v) => v === 'meta' ? `${t('Spread del meta')} (${metaSpreadEvs(metaBuild)})` : t(v === 'max' ? 'Máx inversión' : 'Sin invertir')}
            onChange={(v) => setAtkInvest(v as typeof atkInvest)}
          />
          <ToggleChip active={atkNatureFav && atkInvest !== 'meta'} disabled={atkInvest === 'meta'} onClick={() => setAtkNatureFav((v) => !v)}>{t('Nat. favorable')}</ToggleChip>
        </div>
        <div className="text-xs text-gray-400 uppercase mb-1 mt-3">{t('Mínimos')}</div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[11px] text-gray-400 text-center">HP<NumStepper value={hpMin} onChange={setHpMin} /></label>
          <label className="text-[11px] text-gray-400 text-center">Def<NumStepper value={defMin} onChange={setDefMin} /></label>
          <label className="text-[11px] text-gray-400 text-center">SpD<NumStepper value={spdMin} onChange={setSpdMin} /></label>
        </div>
      </div>
      {calc && (
        <div className="sm:col-span-2">
          {calc.ok
            ? <ResultCard ok sp={calc.total} sprite={atk?.id}><strong className="text-white">HP {calc.hp} / {defLabel} {calc.dv}</strong> {t('para sobrevivir')} · {Math.round(calc.pct)}% {t('máx')}</ResultCard>
            : <ResultCard ok={false} sprite={atk?.id}>{t('No sobrevive ni con inversión máxima')} · {Math.round(calc.pct)}% {t('máx')}</ResultCard>}
        </div>
      )}
    </div>
  );
}

// ── ⚔️ Ataque (OHKO/2HKO) ─────────────────────────────────────────────────────
function OffenseTool({ data, mon, t, lang }: { data: ChampionsData; mon: TeamPokemon; t: (s: string) => string; lang: 'es' | 'en' }) {
  const [moveId, setMoveId] = usePersistedState<string>('optimizer-off-move', '');
  const [targetId, setTargetId] = usePersistedState<string>('optimizer-off-target', '');
  const target = targetId ? getSpecies(targetId) ?? null : null;
  const [bulk, setBulk] = useState<'none' | 'hp' | 'def' | 'spd' | 'hpdef' | 'hpspd' | 'meta'>('none');
  const [defNatureFav, setDefNatureFav] = useState(false);
  const [defItem, setDefItem] = usePersistedState<string>('optimizer-off-item', '');
  const [goal, setGoal] = useState<'ohko' | '2hko'>('ohko');
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);
  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);

  const myMoves = mon.moves.filter((m) => m && data.moveData?.[m]?.category !== 'Status');
  const move = moveId ? data.moveData?.[moveId] : undefined;
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
    if (!target || !moveId || !move || move.category === 'Status') return null;
    const atkStat = move.category === 'Physical' ? 'atk' : 'spa';
    let dEvs: EvSpread = { ...ZERO_EVS };
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
    const def = makeTarget(target, dEvs, dNature, offItem);
    const base = teamToCalc(mon);
    const need = goal === 'ohko' ? 100 : 50; // pctMin garantizado
    for (let sp = 0; sp <= 32; sp++) {
      const me = { ...base, evs: { ...base.evs, [atkStat]: sp } };
      const r = calcMove(me, def, moveId, FIELD, SIDE, SIDE);
      if (r && r.pctMin >= need) return { ok: true, sp, pctMin: r.pctMin, pctMax: r.pctMax };
    }
    const best = calcMove({ ...base, evs: { ...base.evs, [atkStat]: 32 } }, def, moveId, FIELD, SIDE, SIDE);
    return { ok: false, pctMin: best?.pctMin ?? 0, pctMax: best?.pctMax ?? 0 };
  }, [target, moveId, move, bulk, goal, defNatureFav, offItem, metaBuild, mon]);

  return (
    <div className="panel p-4 grid gap-4 sm:grid-cols-2 animate-fade-in-up">
      <div>
        <div className="text-xs text-gray-400 uppercase mb-1">{t('Tu movimiento')}</div>
        <Dropdown value={moveId} options={['', ...myMoves]} onChange={setMoveId} render={(id) => (id ? localizeName('moves', data.moveNames?.[id] ?? id, lang) : t('— Movimiento —'))} placeholder={t('— Movimiento —')} />
        <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Objetivo')}</div>
        <SpeciesSearch data={data} value={target?.name ?? ''} onPick={(sp) => setTargetId(sp.id)} placeholder={t('Buscar objetivo…')} />
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase mb-1">{t('Defensa del objetivo')}</div>
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
            onChange={(b) => setBulk(b as typeof bulk)}
          />
          <ToggleChip active={defNatureFav && bulk !== 'meta'} disabled={bulk === 'meta'} onClick={() => setDefNatureFav((v) => !v)}>
            {t('Nat. favorable')}
          </ToggleChip>
        </div>
        <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Objeto del objetivo')}</div>
        <ItemSearch items={DEFENSIVE_ITEMS.filter((i) => data.items.includes(i))} value={offItem} onPick={setDefItem} placeholder={t('Sin objeto')} lang={lang} disabled={bulk === 'meta'} clearable />
        <div className="text-xs text-gray-400 uppercase mb-1 mt-2">{t('Meta')}</div>
        <Dropdown value={goal} options={['ohko', '2hko']} render={(g) => (g === 'ohko' ? 'OHKO' : '2HKO')} onChange={(g) => setGoal(g as typeof goal)} />
      </div>
      {calc && (
        <div className="sm:col-span-2">
          {calc.ok ? <ResultCard ok sp={calc.sp} sprite={target?.id}><strong className="text-white">{goal.toUpperCase()}</strong> · {calc.pctMin}–{calc.pctMax}%</ResultCard>
            : <ResultCard ok={false} sprite={target?.id}>{t('No se logra ni con 32 SP')} · {calc.pctMin}–{calc.pctMax}%</ResultCard>}
        </div>
      )}
    </div>
  );
}
