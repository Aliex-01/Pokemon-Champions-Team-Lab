import { useMemo, useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useTeam } from '../store/teamStore';
import { getSpecies, getLearnset, localizeName } from '../lib/championsData';
import { Dropdown } from '../components/Dropdown';
import { PokemonSprite, ItemSprite } from '../components/PokemonSprite';
import { formatNatureLabel, clampInvestment, calcAllStats, getStatNatureClass } from '../lib/stats';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { useLang } from '../lib/i18n';
import { calcMove, emptySide, type CalcMon, type FieldState, type SideState, type DamageResult, type Status, type Weather, type Terrain, type Boosts } from '../lib/damageCalc';
import { DEFAULT_IVS } from '../types/pokemon';
import type { ChampionsData, TeamPokemon, SpeciesData, EvSpread, MetaBuildsData } from '../types/pokemon';

/** useState que se guarda en localStorage bajo `key` (persiste entre vistas/recargas). */
function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [key, state]);
  return [state, setState];
}

interface DamageCalcViewProps {
  data: ChampionsData;
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const BOOST_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
const BOOST_OPTIONS = ['+6', '+5', '+4', '+3', '+2', '+1', '0', '-1', '-2', '-3', '-4', '-5', '-6'];
const STATUS_LIST: { v: Status; l: string }[] = [
  { v: '', l: 'Sano' }, { v: 'brn', l: 'Quemado' }, { v: 'par', l: 'Paralizado' },
  { v: 'psn', l: 'Envenenado' }, { v: 'tox', l: 'Toxicado' }, { v: 'slp', l: 'Dormido' }, { v: 'frz', l: 'Congelado' },
];
const WEATHERS: Weather[] = ['', 'Sun', 'Rain', 'Sand', 'Snow'];
const WEATHER_LABEL: Record<Weather, string> = { '': 'Sin clima', Sun: '☀ Sol', Rain: '🌧 Lluvia', Sand: '☷ Arena', Snow: '❄ Nieve' };
const TERRAINS: Terrain[] = ['', 'Electric', 'Grassy', 'Psychic', 'Misty'];
const TERRAIN_LABEL: Record<Terrain, string> = { '': 'Sin terreno', Electric: 'Eléctrico', Grassy: 'Hierba', Psychic: 'Psíquico', Misty: 'Niebla' };

function teamMonToCalc(p: TeamPokemon): CalcMon {
  return {
    speciesId: p.speciesId, speciesName: p.speciesName, level: p.level || 50,
    ability: p.ability, item: p.item, nature: p.nature, evMode: p.evMode, evs: p.evs, ivs: p.ivs,
    moves: [...p.moves], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

function createRival(): CalcMon {
  return {
    speciesId: '', speciesName: '', level: 50, ability: '', item: '', nature: 'Docile',
    evMode: 'champions', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { ...DEFAULT_IVS },
    moves: ['', '', '', ''], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

// Los spreads del meta de Champions ya vienen en stat points (0–32, total 66),
// así que se parsean directamente y el rival se mantiene en modo champions.
function parseSpread(evs: string): EvSpread {
  const [hp, atk, def, spa, spd, spe] = evs.split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
}

const STAT_FULL = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

function TypeBadge({ type }: { type: string }) {
  return <span className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>{type}</span>;
}

// Multiplicador de una estadística según su nivel de subida/bajada (+6..-6).
function boostMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// Multiplicador de Velocidad por habilidad, si se cumple su condición.
function speedAbilityMult(mon: CalcMon, field: FieldState): number {
  const a = mon.ability;
  const weatherAbility: Record<string, Weather> = {
    Chlorophyll: 'Sun', 'Swift Swim': 'Rain', 'Sand Rush': 'Sand', 'Slush Rush': 'Snow',
  };
  if (weatherAbility[a] && field.weather === weatherAbility[a]) return 2;
  if (a === 'Surge Surfer' && field.terrain === 'Electric') return 2;
  if (a === 'Unburden' && !mon.item) return 2;
  if (a === 'Quick Feet' && mon.status) return 1.5;
  return 1;
}

function StatsRow({ mon, field }: { mon: CalcMon; field: FieldState }) {
  const sp = getSpecies(mon.speciesId);
  if (!sp) return null;
  const stats = calcAllStats(sp.baseStats, mon.evs, mon.ivs, mon.nature, mon.level || 50, mon.evMode);
  const abilityMult = speedAbilityMult(mon, field);
  return (
    <div className="grid grid-cols-6 gap-1 text-center mt-2">
      {STAT_FULL.map((k) => {
        const stage = k === 'hp' ? 0 : mon.boosts[k as keyof Boosts];
        let value = stage ? Math.floor(stats[k] * boostMultiplier(stage)) : stats[k];
        // Velocidad: habilidad (clima/Unburden/etc.) y luego Choice Scarf.
        let spdBoost = false;
        if (k === 'spe') {
          if (abilityMult > 1) { value = Math.floor(value * abilityMult); spdBoost = true; }
          if (mon.item === 'Choice Scarf') { value = Math.floor(value * 1.5); spdBoost = true; }
        }
        const scarf = spdBoost;
        return (
          <div key={k} className={`rounded py-1 transition-colors duration-300 ${getStatNatureClass(mon.nature, k) || 'bg-poke-dark/40'}`}>
            <div className="text-[9px] text-gray-400 uppercase">{STAT_LABEL[k]}</div>
            <div key={value} className={`font-mono text-sm font-bold animate-fade-in-up ${stage > 0 || scarf ? 'text-green-400' : stage < 0 ? 'text-red-400' : ''}`}>{value}</div>
          </div>
        );
      })}
    </div>
  );
}

function pctClass(pct: number): string {
  if (pct >= 100) return 'text-blue-400';    // OHKO
  if (pct >= 50) return 'text-green-400';     // 2HKO
  if (pct >= 33.4) return 'text-yellow-400';  // 3HKO
  if (pct >= 25) return 'text-orange-400';    // 4HKO
  return 'text-red-400';                       // 5HKO+
}

export function DamageCalcView({ data }: DamageCalcViewProps) {
  const { activeTeam } = useTeam();
  const { t } = useLang();
  // Estado persistido en localStorage: así al volver a la calculadora desde otra
  // página se conserva el rival y toda su configuración, campo, boosts, etc.
  const [attackerSlot, setAttackerSlot] = usePersistedState<number | null>('dmgcalc-attackerSlot', null);
  const [yourBoosts, setYourBoosts] = usePersistedState<Boosts>('dmgcalc-yourBoosts', { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  const [yourStatus, setYourStatus] = usePersistedState<Status>('dmgcalc-yourStatus', '');
  const [yourFainted, setYourFainted] = usePersistedState<number>('dmgcalc-yourFainted', 0);
  const [rivalFainted, setRivalFainted] = usePersistedState<number>('dmgcalc-rivalFainted', 0);
  const [rival, setRival] = usePersistedState<CalcMon>('dmgcalc-rival', createRival());
  const [field, setField] = usePersistedState<FieldState>('dmgcalc-field', { weather: '', terrain: '', crit: false, gravity: false, magicRoom: false, wonderRoom: false });
  const [yourSide, setYourSide] = usePersistedState<SideState>('dmgcalc-yourSide', emptySide());
  const [rivalSide, setRivalSide] = usePersistedState<SideState>('dmgcalc-rivalSide', emptySide());
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);

  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);

  const moveIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, name] of Object.entries(data.moveNames ?? {})) m.set(name.toLowerCase().replace(/[^a-z0-9]/g, ''), id);
    return m;
  }, [data]);

  // Set más usado del rival desde Builds Meta (por id; si es mega, por su base).
  const rivalBuild = (() => {
    if (!builds || !rival.speciesId) return null;
    if (builds.pokemon[rival.speciesId]) return builds.pokemon[rival.speciesId];
    const base = getSpecies(rival.speciesId)?.baseSpeciesId;
    return base ? builds.pokemon[base] ?? null : null;
  })();

  const applyMetaToRival = () => {
    if (!rivalBuild) return;
    const sp = getSpecies(rival.speciesId);
    const moves = rivalBuild.moves.slice(0, 4).map((mv) => {
      const norm = mv.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return moveIdByName.get(norm) ?? norm;
    });
    while (moves.length < 4) moves.push('');
    const topItem = rivalBuild.items[0]?.name;
    setRival({
      ...rival,
      ability: sp?.isMega ? rival.ability : (rivalBuild.abilities[0]?.name ?? rival.ability),
      item: sp?.isMega ? rival.item : (topItem && topItem !== 'Sin objeto' ? topItem : ''),
      nature: rivalBuild.natures[0]?.name ?? rival.nature,
      evMode: 'champions',
      evs: rivalBuild.spreads[0] ? parseSpread(rivalBuild.spreads[0].evs) : rival.evs,
      moves: moves.slice(0, 4) as CalcMon['moves'],
    });
  };

  const yourMon = attackerSlot != null && activeTeam ? activeTeam.pokemon[attackerSlot] : null;
  const yourCalc = yourMon?.speciesId ? { ...teamMonToCalc(yourMon), boosts: yourBoosts, status: yourStatus, alliesFainted: yourFainted } : null;

  const isDamaging = (mid: string) => !!mid && data.moveData?.[mid]?.category !== 'Status';

  const yourAttacks = useMemo<DamageResult[]>(() => {
    if (!yourCalc || !rival.speciesId) return [];
    return yourCalc.moves.filter(isDamaging)
      .map((mid) => calcMove(yourCalc, rival, mid, field, yourSide, rivalSide))
      .filter((r): r is DamageResult => r !== null);
  }, [yourCalc, rival, field, yourSide, rivalSide, data]);

  const rivalAttacks = useMemo<DamageResult[]>(() => {
    if (!yourCalc || !rival.speciesId) return [];
    // Los aliados KO del atacante rival vienen de la opción de campo (lado rival).
    const rivalAttacker = { ...rival, alliesFainted: rivalFainted };
    return rival.moves.filter(isDamaging)
      .map((mid) => calcMove(rivalAttacker, yourCalc, mid, field, rivalSide, yourSide))
      .filter((r): r is DamageResult => r !== null);
  }, [yourCalc, rival, rivalFainted, field, yourSide, rivalSide, data]);

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Calculadora de Daño')}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] items-start">
        {/* Tu equipo */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3 text-poke-pink">{t('Tu Pokémon')}</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(activeTeam?.pokemon ?? []).map((p, i) => (
              <button
                key={p.slotId}
                type="button"
                disabled={!p.speciesId}
                onClick={() => { setAttackerSlot(i); setYourBoosts({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }); setYourStatus(''); }}
                className={`p-2 rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                  attackerSlot === i ? 'border-poke-pink bg-poke-pink/10' : 'border-poke-accent/30 hover:border-poke-accent'
                } ${!p.speciesId ? 'opacity-30 cursor-not-allowed' : ''}`}
              >
                {p.speciesId ? (
                  <>
                    <PokemonSprite speciesId={p.speciesId} className="w-16 h-16 object-contain" />
                    <span className="text-xs truncate w-full text-center">{p.speciesName}</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500 py-6">{t('Vacío')}</span>
                )}
              </button>
            ))}
          </div>
          {!yourMon?.speciesId && (
            <p className="text-xs text-gray-500">{t('Selecciona un Pokémon de tu equipo.')}</p>
          )}
          {yourMon?.speciesId && (
            <div className="border-t border-poke-accent/30 pt-2 mt-2 space-y-2">
              <BoostStatusEditor boosts={yourBoosts} status={yourStatus} onBoosts={setYourBoosts} onStatus={setYourStatus} />
            </div>
          )}
          {yourCalc && <StatsRow mon={yourCalc} field={field} />}
          {yourCalc && rival.speciesId && (
            <MoveResults results={yourAttacks} moveNames={data.moveNames} empty={t('Tu Pokémon no tiene movimientos.')} />
          )}
        </div>

        {/* Campo (en medio) */}
        <FieldColumn field={field} setField={setField} yourSide={yourSide} setYourSide={setYourSide} rivalSide={rivalSide} setRivalSide={setRivalSide} yourFainted={yourFainted} setYourFainted={setYourFainted} rivalFainted={rivalFainted} setRivalFainted={setRivalFainted} />

        {/* Rival */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3 text-sky-400">{t('Pokémon Rival')}</h3>
          <RivalEditor data={data} mon={rival} onChange={setRival} hasMeta={!!rivalBuild} onApplyMeta={applyMetaToRival} field={field} />
          {yourCalc && rival.speciesId && (
            <MoveResults results={rivalAttacks} moveNames={data.moveNames} empty={t('El rival no tiene movimientos.')} />
          )}
        </div>
      </div>
    </div>
  );
}

function MoveResults({ results, moveNames, empty }: { results: DamageResult[]; moveNames: Record<string, string>; empty: string }) {
  const { t, lang } = useLang();
  return (
    <div className="mt-3 border-t border-poke-accent/30 pt-3 space-y-1">
      <h4 className="text-xs uppercase text-gray-400 mb-1">{t('Daño por movimiento')}</h4>
      {results.length === 0 ? (
        <p className="text-xs text-gray-500">{empty}</p>
      ) : (
        results.map((r) => {
          const remainMin = Math.max(0, 100 - r.pctMax); // HP restante en el peor caso
          const remainMax = Math.max(0, 100 - r.pctMin); // HP restante en el mejor caso
          return (
            <div key={r.moveId} className="bg-poke-dark/30 rounded px-2 py-1 animate-fade-in-up transition-colors hover:bg-poke-dark/50" title={r.desc}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium truncate">{localizeName('moves', moveNames[r.moveId] ?? r.moveId, lang)}</span>
                <span className="flex items-center gap-3 shrink-0 font-mono text-xs">
                  <span className="text-gray-400">{r.min}–{r.max}</span>
                  <span className={`font-bold transition-colors duration-300 ${pctClass(r.pctMax)}`}>{r.pctMin}–{r.pctMax}%</span>
                  <span className="text-gray-300 w-20 text-right">{t(r.koChance)}</span>
                </span>
              </div>
              {/* Barra de HP: verde = HP garantizado, amarillo = rango de daño, rojo = daño garantizado */}
              <div className="flex h-1.5 rounded overflow-hidden bg-black/40 mt-1">
                <div className="bg-green-600 transition-[width] duration-500 ease-out" style={{ width: `${remainMin}%` }} />
                <div className="bg-yellow-500/70 transition-[width] duration-500 ease-out" style={{ width: `${remainMax - remainMin}%` }} />
                <div className="bg-red-600/70 transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, r.pctMin)}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function FieldColumn({ field, setField, yourSide, setYourSide, rivalSide, setRivalSide, yourFainted, setYourFainted, rivalFainted, setRivalFainted }: {
  field: FieldState; setField: (f: FieldState) => void;
  yourSide: SideState; setYourSide: (s: SideState) => void;
  rivalSide: SideState; setRivalSide: (s: SideState) => void;
  yourFainted: number; setYourFainted: (n: number) => void;
  rivalFainted: number; setRivalFainted: (n: number) => void;
}) {
  const { t } = useLang();
  return (
    <div className="panel p-3 space-y-3 text-sm">
      <h3 className="font-semibold text-center text-gray-300 text-sm">{t('Campo')}</h3>
      <div>
        <div className="text-xs text-gray-400 mb-1">{t('Clima')}</div>
        <Dropdown
          value={field.weather}
          options={WEATHERS}
          render={(w) => t(WEATHER_LABEL[w as Weather])}
          placeholder={t('Sin clima')}
          expand
          onChange={(w) => setField({ ...field, weather: w as Weather })}
        />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1">{t('Terreno')}</div>
        <Dropdown
          value={field.terrain}
          options={TERRAINS}
          render={(tr) => t(TERRAIN_LABEL[tr as Terrain])}
          placeholder={t('Sin terreno')}
          expand
          onChange={(tr) => setField({ ...field, terrain: tr as Terrain })}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 border-t border-poke-accent/30">
        <SideChips label={t('Tu lado')} side={yourSide} onChange={setYourSide} />
        <SideChips label={t('Lado rival')} side={rivalSide} onChange={setRivalSide} fromRight />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-poke-accent/30 [&_button]:w-full">
        <div className="col-span-2">
          <FieldButton label={t('Gravedad')} active={field.gravity} onClick={() => setField({ ...field, gravity: !field.gravity })} />
        </div>
        <FieldButton label={t('Zona Mágica')} active={field.magicRoom} onClick={() => setField({ ...field, magicRoom: !field.magicRoom })} />
        <FieldButton label={t('Zona Extraña')} active={field.wonderRoom} onClick={() => setField({ ...field, wonderRoom: !field.wonderRoom })} />
        <div className="col-span-2">
          <FieldButton label={t('Golpe crítico')} active={field.crit} onClick={() => setField({ ...field, crit: !field.crit })} />
        </div>
      </div>
      <div className="pt-2 border-t border-poke-accent/30">
        <div className="text-xs text-gray-400 mb-1 uppercase">{t('Aliados KO')}</div>
        <div className="grid grid-cols-2 gap-3">
          <FaintedSelect label={t('Tu lado')} value={yourFainted} onChange={setYourFainted} />
          <FaintedSelect label={t('Lado rival')} value={rivalFainted} onChange={setRivalFainted} />
        </div>
      </div>
    </div>
  );
}

const SIDE_OPTIONS: { key: keyof SideState; label: string }[] = [
  { key: 'reflect', label: 'Reflejo' },
  { key: 'lightScreen', label: 'P. Luz' },
  { key: 'auroraVeil', label: 'Velo Aurora' },
  { key: 'helpingHand', label: 'Refuerzo' },
  { key: 'friendGuard', label: 'Compiescolta' },
  { key: 'protected', label: 'Protección' },
];

function SideChips({ label, side, onChange, fromRight = false }: { label: string; side: SideState; onChange: (s: SideState) => void; fromRight?: boolean }) {
  const { t } = useLang();
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1 font-semibold">{label}</div>
      <div className="flex flex-col gap-1">
        {SIDE_OPTIONS.map(({ key, label: l }) => (
          <Chip key={key} label={t(l)} active={side[key]} fromRight={fromRight} onClick={() => onChange({ ...side, [key]: !side[key] })} className="w-full" />
        ))}
      </div>
    </div>
  );
}

function FieldButton({ label, active, onClick, className = '' }: { label: string; active: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden px-4 py-2 rounded-md text-xs border transition-all active:scale-95 whitespace-nowrap ${className} ${
        active ? 'border-poke-pink text-white' : 'bg-poke-dark border-poke-accent text-gray-300 hover:bg-poke-accent/40'
      }`}
    >
      <span className={`absolute inset-0 bg-poke-pink origin-left transition-transform duration-300 ease-out ${active ? 'scale-x-100' : 'scale-x-0'}`} />
      <span className="relative">{label}</span>
    </button>
  );
}

function Chip({ label, active, onClick, className = '', fromRight = false }: { label: string; active: boolean; onClick: () => void; className?: string; fromRight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden px-2.5 py-2 rounded-md text-xs border transition-all active:scale-95 ${className} ${
        active ? 'border-poke-pink text-white' : 'bg-poke-dark border-poke-accent text-gray-300 hover:bg-poke-accent/40'
      }`}
    >
      <span className={`absolute inset-0 bg-poke-pink transition-transform duration-300 ease-out ${fromRight ? 'origin-right' : 'origin-left'} ${active ? 'scale-x-100' : 'scale-x-0'}`} />
      <span className="relative">{label}</span>
    </button>
  );
}

function RivalEditor({ data, mon, onChange, hasMeta, onApplyMeta, field }: { data: ChampionsData; mon: CalcMon; onChange: (m: CalcMon) => void; hasMeta: boolean; onApplyMeta: () => void; field: FieldState }) {
  const { t, lang } = useLang();
  const species = mon.speciesId ? getSpecies(mon.speciesId) : null;
  const learnset = mon.speciesId ? getLearnset(mon.speciesId, data) : [];
  const set = (patch: Partial<CalcMon>) => onChange({ ...mon, ...patch });

  const zero: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const applyPreset = (preset: 'hp' | 'hpdef' | 'hpspd' | 'off' | 'reset') => {
    let evs: EvSpread;
    if (preset === 'reset') evs = { ...zero };
    else if (preset === 'hp') evs = { ...zero, hp: 32 };
    else if (preset === 'hpdef') evs = { ...zero, hp: 32, def: 32 };
    else if (preset === 'hpspd') evs = { ...zero, hp: 32, spd: 32 };
    else {
      const physical = (species?.baseStats.atk ?? 0) >= (species?.baseStats.spa ?? 0);
      evs = { ...zero, spe: 32, [physical ? 'atk' : 'spa']: 32 };
    }
    set({ evMode: 'champions', evs: clampInvestment(evs, 'champions') });
  };
  const PRESETS: { id: 'hp' | 'hpdef' | 'hpspd' | 'off' | 'reset'; label: string }[] = [
    { id: 'hp', label: 'Máx HP' }, { id: 'hpdef', label: 'HP/Def' }, { id: 'hpspd', label: 'HP/SpD' },
    { id: 'off', label: 'Ofensivo' }, { id: 'reset', label: 'Reset' },
  ];

  const pickSpecies = (sp: SpeciesData) => {
    onChange({
      ...mon,
      speciesId: sp.id, speciesName: sp.name,
      ability: sp.abilities[0] ?? '',
      item: sp.isMega ? (sp.megaStone ?? '') : '',
      moves: ['', '', '', ''],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {species && <PokemonSprite speciesId={mon.speciesId} className="w-12 h-12 object-contain shrink-0" />}
        <div className="flex-1 min-w-0">
          <SearchSelect
            placeholder={t('Buscar Pokémon del formato…')}
            options={data.species.map((s) => ({ id: s.id, label: s.name }))}
            value={mon.speciesName}
            onPick={(id) => { const sp = data.species.find((s) => s.id === id); if (sp) pickSpecies(sp); }}
            icon={(id) => <PokemonSprite speciesId={id} className="w-6 h-6 object-contain" />}
          />
          {species && species.types.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {species.types.map((t) => <TypeBadge key={t} type={t} />)}
            </div>
          )}
        </div>
      </div>

      {species && hasMeta && (
        <button
          type="button"
          onClick={onApplyMeta}
          className="w-full px-3 py-2 rounded-lg bg-poke-pink/15 border border-poke-pink/40 text-poke-pink text-sm font-medium hover:bg-poke-pink/25 transition-colors"
        >
          {t('⬇ Cargar set más usado (meta)')}
        </button>
      )}

      {species && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Habilidad')}>
              {species.isMega ? (
                <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed truncate">{localizeName('abilities', mon.ability, lang)}</div>
              ) : (
                <Dropdown value={mon.ability} options={species.abilities} render={(a) => localizeName('abilities', a, lang)} onChange={(ability) => set({ ability })} />
              )}
            </Field>
            <Field label={t('Naturaleza')}>
              <Dropdown value={mon.nature} options={data.natures} onChange={(nature) => set({ nature })} render={(n) => formatNatureLabel(n, localizeName('natures', n, lang))} expand />
            </Field>
            <Field label={t('Objeto')}>
              {species.isMega ? (
                <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed flex items-center gap-2">
                  <ItemSprite item={mon.item || species.megaStone || ''} className="w-6 h-6" />
                  <span className="truncate">{localizeName('items', mon.item || species.megaStone || '', lang)}</span>
                </div>
              ) : (
                <SearchSelect
                  placeholder={t('Objeto…')}
                  options={data.items.map((i) => ({ id: i, label: localizeName('items', i, lang) }))}
                  value={localizeName('items', mon.item, lang)}
                  onPick={(item) => set({ item })}
                  icon={(i) => <ItemSprite item={i} className="w-6 h-6" />}
                  valueIcon={mon.item ? () => <ItemSprite item={mon.item} className="w-6 h-6" /> : undefined}
                />
              )}
            </Field>
            <Field label={t('Estado')}>
              <Dropdown
                value={STATUS_LIST.find((s) => s.v === mon.status)?.l ?? 'Sano'}
                options={STATUS_LIST.map((s) => s.l)}
                render={(l) => t(l)}
                onChange={(l) => set({ status: STATUS_LIST.find((s) => s.l === l)?.v ?? '' })}
              />
            </Field>
          </div>

          <div>
            <span className="text-xs text-gray-400 uppercase">{t('EVs (stat points)')}</span>
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="px-2 py-1 rounded text-[11px] bg-poke-accent/40 hover:bg-poke-accent text-gray-200 transition-colors"
                >
                  {t(p.label)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {STAT_KEYS.map((k) => {
                const setEv = (val: number) => {
                  // Cap por presupuesto restante (66): no quita puntos a otras stats.
                  const e = mon.evs;
                  const others = (e.hp + e.atk + e.def + e.spa + e.spd + e.spe) - e[k];
                  const cap = Math.min(32, 66 - others);
                  set({ evs: { ...e, [k]: Math.min(cap, Math.max(0, val)) } });
                };
                return (
                  <div key={k} className="text-center">
                    <div className="text-[10px] text-gray-400">{STAT_LABEL[k]}</div>
                    <div className="flex items-stretch rounded-md border border-poke-accent overflow-hidden">
                      <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(mon.evs[k] - 1)}>−</button>
                      <input
                        type="number" min={0} max={32}
                        className="no-spinner w-full min-w-0 bg-poke-dark text-center text-sm text-white outline-none py-1 border-x border-poke-accent"
                        value={mon.evs[k]}
                        onChange={(e) => setEv(parseInt(e.target.value, 10) || 0)}
                      />
                      <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(mon.evs[k] + 1)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400 uppercase">{t('Subidas/Bajadas')}</span>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {BOOST_STATS.map((k) => (
                <div key={k} className="text-center">
                  <div className="text-[10px] text-gray-400">{STAT_LABEL[k]}</div>
                  <Dropdown
                    value={(mon.boosts[k] > 0 ? '+' : '') + mon.boosts[k]}
                    options={BOOST_OPTIONS}
                    onChange={(v) => set({ boosts: { ...mon.boosts, [k]: parseInt(v, 10) } })}
                  />
                </div>
              ))}
            </div>
          </div>

          <StatsRow mon={mon} field={field} />

          <div>
            <span className="text-xs text-gray-400 uppercase">{t('Movimientos')}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
              {[0, 1, 2, 3].map((i) => (
                <Dropdown
                  key={i}
                  value={mon.moves[i] ?? ''}
                  options={['', ...learnset]}
                  onChange={(v) => { const moves = [...mon.moves] as CalcMon['moves']; moves[i] = v; set({ moves }); }}
                  render={(id) => (id ? localizeName('moves', data.moveNames?.[id] ?? id, lang) : t('— Movimiento —'))}
                  placeholder={`${t('Movimiento')} ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BoostStatusEditor({ boosts, status, onBoosts, onStatus }: {
  boosts: Boosts; status: Status; onBoosts: (b: Boosts) => void; onStatus: (s: Status) => void;
}) {
  const { t } = useLang();
  return (
    <>
      <Field label={t('Estado')}>
        <Dropdown
          value={STATUS_LIST.find((s) => s.v === status)?.l ?? 'Sano'}
          options={STATUS_LIST.map((s) => s.l)}
          render={(l) => t(l)}
          onChange={(l) => onStatus(STATUS_LIST.find((s) => s.l === l)?.v ?? '')}
        />
      </Field>
      <div>
        <span className="text-xs text-gray-400 uppercase">{t('Subidas/Bajadas')}</span>
        <div className="grid grid-cols-5 gap-1 mt-1">
          {BOOST_STATS.map((k) => (
            <div key={k} className="text-center">
              <div className="text-[10px] text-gray-400">{STAT_LABEL[k]}</div>
              <Dropdown
                value={(boosts[k] > 0 ? '+' : '') + boosts[k]}
                options={BOOST_OPTIONS}
                onChange={(v) => onBoosts({ ...boosts, [k]: parseInt(v, 10) })}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Aliados debilitados (0–3 en dobles): escala Supreme Overlord (General Supremo) y Last Respects (Última Baza).
function FaintedSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <Dropdown
        value={String(value)}
        options={['0', '1', '2', '3']}
        onChange={(v) => onChange(parseInt(v, 10) || 0)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 uppercase">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function SearchSelect({ placeholder, options, value, onPick, icon, valueIcon }: {
  placeholder: string;
  options: { id: string; label: string }[];
  value: string;
  onPick: (id: string) => void;
  icon?: (id: string) => React.ReactNode;
  valueIcon?: () => React.ReactNode;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(value); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [value]);

  const q = query.toLowerCase().trim();
  const results = options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30);

  const showIcon = !!value && !!valueIcon;

  return (
    <div ref={ref} className="relative">
      {showIcon && (
        <div className="absolute left-3 inset-y-0 flex items-center pointer-events-none">{valueIcon!()}</div>
      )}
      <input
        className="input-field"
        style={showIcon ? { paddingLeft: '2.75rem' } : undefined}
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <ul className="absolute z-20 w-full mt-1 max-h-60 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {results.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 flex items-center gap-2"
                onClick={() => { onPick(o.id); setQuery(o.label); setOpen(false); }}
              >
                {icon?.(o.id)}
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
