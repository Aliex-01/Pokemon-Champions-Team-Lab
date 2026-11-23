import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeam } from '../store/teamStore';
import { getSpecies, getLearnset, localizeName } from '../lib/championsData';
import { Dropdown } from '../components/Dropdown';
import { MoveSearch } from '../components/MoveSearch';
import { InfoTooltip } from '../components/InfoTooltip';
import { Icon } from '../components/Icons';
import { Toast } from '../components/Toast';
import { PokemonSprite, ItemSprite } from '../components/PokemonSprite';
import { formatNatureLabel, clampInvestment, calcAllStats, getStatNatureClass, convertInvestment, totalInvestment, MAX_STAT_POINTS, MAX_TOTAL_STAT_POINTS } from '../lib/stats';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { useLang } from '../lib/i18n';
import { calcMove, emptySide } from '../lib/damageCalc';
import { formatCalcSheetText, exportCalcSheetPng, printCalcSheetPdf } from '../lib/calcSheetExport';
import { DEFAULT_IVS } from '../types/pokemon';

/** useState que se guarda en localStorage bajo `key` (persiste entre vistas/recargas). */
function usePersistedState(key, initial, override) {
  const [state, setState] = useState(() => {
    if (override !== undefined) return override;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [key, state]);
  return [state, setState];
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const BOOST_STATS = ['atk', 'def', 'spa', 'spd', 'spe'];
const BOOST_OPTIONS = ['+6', '+5', '+4', '+3', '+2', '+1', '0', '-1', '-2', '-3', '-4', '-5', '-6'];
const STATUS_LIST = [
  { v: '', l: 'Sano' }, { v: 'brn', l: 'Quemado' }, { v: 'par', l: 'Paralizado' },
  { v: 'psn', l: 'Envenenado' }, { v: 'tox', l: 'Toxicado' }, { v: 'slp', l: 'Dormido' }, { v: 'frz', l: 'Congelado' },
];
const WEATHERS = ['', 'Sun', 'Rain', 'Sand', 'Snow'];
const WEATHER_LABEL = { '': 'Sin clima', Sun: 'Sol', Rain: 'Lluvia', Sand: 'Arena', Snow: 'Nieve' };
const TERRAINS = ['', 'Electric', 'Grassy', 'Psychic', 'Misty'];
const TERRAIN_LABEL = { '': 'Sin terreno', Electric: 'Eléctrico', Grassy: 'Hierba', Psychic: 'Psíquico', Misty: 'Niebla' };

function teamMonToCalc(p) {
  return {
    speciesId: p.speciesId, speciesName: p.speciesName, level: p.level || 50,
    ability: p.ability, item: p.item, nature: p.nature, evMode: p.evMode, evs: p.evs, ivs: p.ivs,
    moves: [...p.moves], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

function createRival() {
  return {
    speciesId: '', speciesName: '', level: 50, ability: '', item: '', nature: 'Docile',
    evMode: 'champions', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { ...DEFAULT_IVS },
    moves: ['', '', '', ''], boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, status: '', alliesFainted: 0,
  };
}

// Los spreads del meta de Champions ya vienen en stat points (0–32, total 66),
// así que se parsean directamente y el rival se mantiene en modo champions.
function parseSpread(evs) {
  const [hp, atk, def, spa, spd, spe] = evs.split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
}

const STAT_FULL = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function TypeBadge({ type }) {
  return <span className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>{type}</span>;
}

// Multiplicador de una estadística según su nivel de subida/bajada (+6..-6).
function boostMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// Multiplicador de Velocidad por habilidad, si se cumple su condición.
function speedAbilityMult(mon, field) {
  const a = mon.ability;
  const weatherAbility = {
    Chlorophyll: 'Sun', 'Swift Swim': 'Rain', 'Sand Rush': 'Sand', 'Slush Rush': 'Snow',
  };
  if (weatherAbility[a] && field.weather === weatherAbility[a]) return 2;
  if (a === 'Surge Surfer' && field.terrain === 'Electric') return 2;
  if (a === 'Unburden' && !mon.item) return 2;
  if (a === 'Quick Feet' && mon.status) return 1.5;
  return 1;
}

function StatsRow({ mon, field }) {
  const sp = getSpecies(mon.speciesId);
  if (!sp) return null;
  const stats = calcAllStats(sp.baseStats, mon.evs, mon.ivs, mon.nature, mon.level || 50, mon.evMode);
  const abilityMult = speedAbilityMult(mon, field);
  return (
    <div className="grid grid-cols-6 gap-1 text-center mt-2">
      {STAT_FULL.map((k) => {
        const stage = k === 'hp' ? 0 : mon.boosts[k];
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

function pctClass(pct) {
  if (pct >= 100) return 'text-blue-400';    // OHKO
  if (pct >= 50) return 'text-green-400';     // 2HKO
  if (pct >= 33.4) return 'text-yellow-400';  // 3HKO
  if (pct >= 25) return 'text-orange-400';    // 4HKO
  return 'text-red-400';                       // 5HKO+
}

export function DamageCalcView({ data }) {
  const { activeTeam, updatePokemon } = useTeam();
  const { t, lang } = useLang();
  const [searchParams] = useSearchParams();
  const slotParam = searchParams.get('slot');
  const initialSlot = slotParam != null && /^\d+$/.test(slotParam) ? parseInt(slotParam, 10) : undefined;
  // Estado persistido en localStorage: así al volver a la calculadora desde otra
  // página se conserva el rival y toda su configuración, campo, boosts, etc.
  const [attackerSlot, setAttackerSlot] = usePersistedState('dmgcalc-attackerSlot', null, initialSlot);
  const [yourBoosts, setYourBoosts] = usePersistedState('dmgcalc-yourBoosts', { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  const [yourStatus, setYourStatus] = usePersistedState('dmgcalc-yourStatus', '');
  const [yourHpPct, setYourHpPct] = usePersistedState('dmgcalc-yourHpPct', 100);
  const [rivalHpPct, setRivalHpPct] = usePersistedState('dmgcalc-rivalHpPct', 100);
  const [yourHits, setYourHits] = useState({});
  const [rivalHits, setRivalHits] = useState({});
  const [yourFainted, setYourFainted] = usePersistedState('dmgcalc-yourFainted', 0);
  const [rivalFainted, setRivalFainted] = usePersistedState('dmgcalc-rivalFainted', 0);
  const [rival, setRival] = usePersistedState('dmgcalc-rival', createRival());
  const [field, setField] = usePersistedState('dmgcalc-field', { weather: '', terrain: '', crit: false, gravity: false, magicRoom: false, wonderRoom: false, singleTarget: false });
  const [yourSide, setYourSide] = usePersistedState('dmgcalc-yourSide', emptySide());
  const [rivalSide, setRivalSide] = usePersistedState('dmgcalc-rivalSide', emptySide());
  const [savedSheets, setSavedSheets] = usePersistedState('dmgcalc-saved-sheets', {});
  const [builds, setBuilds] = useState(null);
  const [tempSp, setTempSp] = useState(null);
  const [tempNature, setTempNature] = useState(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => { loadMetaBuilds().then(setBuilds); }, []);

  const moveIdByName = useMemo(() => {
    const m = new Map();
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
      moves: moves.slice(0, 4),
    });
  };

  const yourMon = attackerSlot != null && activeTeam ? activeTeam.pokemon[attackerSlot] : null;
  const savedYourSp = useMemo(() => {
    if (!yourMon?.speciesId) return null;
    return (yourMon.evMode ?? 'champions') === 'champions'
      ? { ...yourMon.evs }
      : convertInvestment(yourMon.evs, 'traditional', 'champions');
  }, [yourMon]);

  const effectiveYourSp = tempSp ?? savedYourSp;
  const effectiveYourNature = tempNature ?? yourMon?.nature ?? 'Docile';

  const hasTempChanges = Boolean(
    yourMon && (
      (tempSp && savedYourSp && STAT_KEYS.some((k) => tempSp[k] !== savedYourSp[k])) ||
      (tempNature && tempNature !== yourMon.nature)
    )
  );

  const resetTempYour = () => {
    setTempSp(null);
    setTempNature(null);
  };

  const yourCalc = yourMon?.speciesId
    ? {
        ...teamMonToCalc(yourMon),
        evMode: 'champions',
        evs: effectiveYourSp,
        nature: effectiveYourNature,
        boosts: yourBoosts,
        status: yourStatus,
        curHPPercent: yourHpPct,
        alliesFainted: yourFainted,
      }
    : null;

  const rivalCalc = rival.speciesId ? { ...rival, curHPPercent: rivalHpPct } : rival;

  const saveTempToTeamBuilder = () => {
    if (!yourMon || !effectiveYourSp || attackerSlot == null) return;
    const targetMode = yourMon.evMode ?? 'champions';
    const nextEvs = targetMode === 'champions'
      ? { ...effectiveYourSp }
      : convertInvestment(effectiveYourSp, 'champions', 'traditional');
    updatePokemon(attackerSlot, { evs: nextEvs, nature: effectiveYourNature });
    resetTempYour();
    setToastMsg(`${t('Importado al Team Builder')}: ${yourMon.speciesName}`);
  };

  const isDamaging = (mid) => !!mid && data.moveData?.[mid]?.category !== 'Status';

  const yourAttacks = useMemo(() => {
    if (!yourCalc || !rivalCalc.speciesId) return [];
    return yourCalc.moves.filter(isDamaging)
      .map((mid) => calcMove(yourCalc, rivalCalc, mid, field, yourSide, rivalSide, yourHits[mid]))
      .filter((r) => r !== null);
  }, [yourCalc, rivalCalc, field, yourSide, rivalSide, yourHits, data]);

  const rivalAttacks = useMemo(() => {
    if (!yourCalc || !rivalCalc.speciesId) return [];
    // Los aliados KO del atacante rival vienen de la opción de campo (lado rival).
    const rivalAttacker = { ...rivalCalc, alliesFainted: rivalFainted };
    return rivalCalc.moves.filter(isDamaging)
      .map((mid) => calcMove(rivalAttacker, yourCalc, mid, field, rivalSide, yourSide, rivalHits[mid]))
      .filter((r) => r !== null);
  }, [yourCalc, rivalCalc, rivalFainted, field, yourSide, rivalSide, rivalHits, data]);

  const teamId = activeTeam?.id ?? 'default';
  const teamCalcs = savedSheets[teamId] ?? [];

  const saveCurrentCalc = () => {
    if (!yourCalc || !rival.speciesId) return;
    const bestOf = (list) => {
      if (!list.length) return null;
      const top = [...list].sort((a, b) => b.pctMax - a.pctMax)[0];
      return { moveId: top.moveId, pctMin: top.pctMin, pctMax: top.pctMax, koChance: top.koChance };
    };
    const entry = {
      id: crypto.randomUUID(),
      attackerSlot,
      yourSpeciesId: yourCalc.speciesId,
      yourSpeciesName: yourCalc.speciesName,
      rivalSpeciesId: rival.speciesId,
      rivalSpeciesName: rival.speciesName,
      yourBest: bestOf(yourAttacks),
      rivalBest: bestOf(rivalAttacks),
      snapshot: {
        attackerSlot,
        tempSp: hasTempChanges ? { ...effectiveYourSp } : null,
        tempNature: hasTempChanges ? effectiveYourNature : null,
        yourBoosts: { ...yourBoosts },
        yourStatus,
        yourHpPct,
        rivalHpPct,
        yourFainted,
        rivalFainted,
        rival: { ...rival, evs: { ...rival.evs }, ivs: { ...rival.ivs }, moves: [...rival.moves], boosts: { ...rival.boosts } },
        field: { ...field },
        yourSide: { ...yourSide },
        rivalSide: { ...rivalSide },
      },
    };
    setSavedSheets((prev) => ({
      ...prev,
      [teamId]: [entry, ...(prev[teamId] ?? [])].slice(0, 20),
    }));
    setToastMsg(t('Cálculo guardado en el equipo'));
  };

  const loadSavedCalc = (entry) => {
    const s = entry.snapshot;
    if (!s) return;
    setAttackerSlot(s.attackerSlot);
    setTempSp(s.tempSp ?? (s.tempEvs ? (s.tempEvMode === 'traditional' ? convertInvestment(s.tempEvs, 'traditional', 'champions') : s.tempEvs) : null));
    setTempNature(s.tempNature ?? null);
    setYourBoosts(s.yourBoosts);
    setYourStatus(s.yourStatus);
    setYourHpPct(s.yourHpPct ?? 100);
    setRivalHpPct(s.rivalHpPct ?? 100);
    setYourFainted(s.yourFainted ?? 0);
    setRivalFainted(s.rivalFainted ?? 0);
    setRival(s.rival);
    setField(s.field);
    setYourSide(s.yourSide);
    setRivalSide(s.rivalSide);
  };

  const deleteSavedCalc = (id) => {
    setSavedSheets((prev) => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).filter((c) => c.id !== id),
    }));
  };

  const copyCalcSheet = async () => {
    const txt = formatCalcSheetText({ teamName: activeTeam?.name, calcs: teamCalcs, data, lang });
    try {
      await navigator.clipboard.writeText(txt);
      setToastMsg(t('Cálculos copiados al portapapeles'));
    } catch { /* ignore */ }
  };

  const downloadCalcSheetPng = async () => {
    setExportingPng(true);
    try {
      await exportCalcSheetPng({ teamName: activeTeam?.name, calcs: teamCalcs, data, lang });
    } finally {
      setExportingPng(false);
    }
  };

  const openCalcSheetPdf = () => {
    printCalcSheetPdf({ teamName: activeTeam?.name, calcs: teamCalcs, data, lang });
  };

  return (
    <div className="page-enter">
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {t('Calculadora de Daño')}
          <InfoTooltip side="bottom" label={t('Más información')}>
            {lang === 'en'
              ? 'Estimate how much damage a move deals between two Pokémon. Pick an attacker from your team and set up the rival (species, spread, item, ability, boosts and status), then tune the field (weather, terrain, screens, allies fainted…) to see the damage range and KO chance for each move.'
              : 'Estima cuánto daño hace un movimiento entre dos Pokémon. Elige un atacante de tu equipo y configura al rival (especie, reparto, objeto, habilidad, subidas y estado); luego ajusta el campo (clima, terreno, pantallas, aliados debilitados…) para ver el rango de daño y la probabilidad de KO de cada movimiento.'}
          </InfoTooltip>
        </h2>
        {yourCalc && rival.speciesId && (
          <button
            type="button"
            onClick={saveCurrentCalc}
            className="btn-secondary text-xs px-3 py-1.5 border border-poke-pink/40 text-poke-pink hover:bg-poke-pink/15 inline-flex items-center gap-1.5"
          >
            <Icon name="bookmark" className="w-3.5 h-3.5" />
            {t('Guardar cálculo')}
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] items-start">
        {/* Tu equipo */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3 text-poke-pink flex items-center gap-1.5">
            {t('Tu Pokémon')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'The attacker. Pick one of the Pokémon from your active team; its spread, item, ability, boosts and status are used to calculate the damage it deals.'
                : 'El atacante. Elige uno de los Pokémon de tu equipo activo; su reparto, objeto, habilidad, subidas y estado se usan para calcular el daño que hace.'}
            </InfoTooltip>
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(activeTeam?.pokemon ?? []).map((p, i) => (
              <button
                key={p.slotId}
                type="button"
                disabled={!p.speciesId}
                onClick={() => { setAttackerSlot(i); resetTempYour(); setYourBoosts({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }); setYourStatus(''); setYourHpPct(100); }}
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
          {yourMon?.speciesId && effectiveYourSp && (
            <div className="border-t border-poke-accent/30 pt-2 mt-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('Estado')}>
                  <Dropdown
                    value={STATUS_LIST.find((s) => s.v === yourStatus)?.l ?? 'Sano'}
                    options={STATUS_LIST.map((s) => s.l)}
                    render={(l) => t(l)}
                    onChange={(l) => setYourStatus(STATUS_LIST.find((s) => s.l === l)?.v ?? '')}
                  />
                </Field>
                <Field label={t('Naturaleza')}>
                  <Dropdown
                    value={effectiveYourNature}
                    options={data.natures}
                    onChange={setTempNature}
                    render={(n) => formatNatureLabel(n, localizeName('natures', n, lang))}
                  />
                </Field>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-gray-400 uppercase inline-flex items-center gap-1.5">
                    Stat Points ({totalInvestment(effectiveYourSp, 'champions')}/{MAX_TOTAL_STAT_POINTS})
                    {hasTempChanges && <span className="w-2 h-2 rounded-full bg-poke-pink" />}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!hasTempChanges}
                      onClick={saveTempToTeamBuilder}
                      className="px-2 py-0.5 rounded bg-poke-pink hover:bg-poke-pink/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors"
                    >
                      {t('Importar al Team Builder')}
                    </button>
                    <button
                      type="button"
                      disabled={!hasTempChanges}
                      onClick={resetTempYour}
                      className="text-[11px] text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('Reset')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {STAT_KEYS.map((k) => {
                    const setEv = (val) => {
                      const e = effectiveYourSp;
                      const others = totalInvestment(e, 'champions') - e[k];
                      const cap = Math.min(MAX_STAT_POINTS, MAX_TOTAL_STAT_POINTS - others);
                      setTempSp({ ...e, [k]: Math.min(cap, Math.max(0, val)) });
                    };
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[10px] text-gray-400">{STAT_LABEL[k]}</div>
                        <div className="flex items-stretch rounded-md border border-poke-accent overflow-hidden">
                          <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(effectiveYourSp[k] - 1)}>−</button>
                          <input
                            type="number" min={0} max={MAX_STAT_POINTS}
                            className="no-spinner w-full min-w-0 bg-poke-dark text-center text-sm text-white outline-none py-1 border-x border-poke-accent"
                            value={effectiveYourSp[k]}
                            onChange={(e) => setEv(parseInt(e.target.value, 10) || 0)}
                          />
                          <button type="button" className="px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(effectiveYourSp[k] + 1)}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <HpPercentBar
                value={yourHpPct}
                maxHp={(() => {
                  const sp = getSpecies(yourCalc.speciesId);
                  return sp ? calcAllStats(sp.baseStats, yourCalc.evs, yourCalc.ivs, yourCalc.nature, yourCalc.level || 50, yourCalc.evMode).hp : null;
                })()}
                onChange={setYourHpPct}
              />

              <BoostsEditor boosts={yourBoosts} onBoosts={setYourBoosts} />
            </div>
          )}
          {yourCalc && <StatsRow mon={yourCalc} field={field} />}
          {yourCalc && rival.speciesId && (
            <MoveResults
              results={yourAttacks}
              moveNames={data.moveNames}
              empty={t('Tu Pokémon no tiene movimientos.')}
              hitsMap={yourHits}
              onHitsChange={(mid, h) => setYourHits((m) => ({ ...m, [mid]: h }))}
            />
          )}
        </div>

        {/* Campo (en medio) */}
        <FieldColumn
          field={field}
          setField={setField}
          yourSide={yourSide}
          setYourSide={setYourSide}
          rivalSide={rivalSide}
          setRivalSide={setRivalSide}
          yourFainted={yourFainted}
          setYourFainted={setYourFainted}
          rivalFainted={rivalFainted}
          setRivalFainted={setRivalFainted}
          onReset={() => {
            setField({ weather: '', terrain: '', crit: false, gravity: false, magicRoom: false, wonderRoom: false, singleTarget: false });
            setYourSide(emptySide());
            setRivalSide(emptySide());
            setYourFainted(0);
            setRivalFainted(0);
          }}
        />

        {/* Rival */}
        <div className="panel p-4">
          <h3 className="font-semibold mb-3 text-sky-400 flex items-center gap-1.5">
            {t('Pokémon Rival')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'The defender. Set up the opposing Pokémon by hand (species, spread, item, ability, boosts and status) or load a meta build to see how much your moves do to it.'
                : 'El defensor. Configura a mano al Pokémon rival (especie, reparto, objeto, habilidad, subidas y estado) o carga un build del meta para ver cuánto le hacen tus movimientos.'}
            </InfoTooltip>
          </h3>
          <RivalEditor
            data={data}
            mon={rival}
            onChange={setRival}
            hasMeta={!!rivalBuild}
            onApplyMeta={applyMetaToRival}
            field={field}
            hpPct={rivalHpPct}
            onHpPct={setRivalHpPct}
          />
          {yourCalc && rival.speciesId && (
            <MoveResults
              results={rivalAttacks}
              moveNames={data.moveNames}
              empty={t('El rival no tiene movimientos.')}
              hitsMap={rivalHits}
              onHitsChange={(mid, h) => setRivalHits((m) => ({ ...m, [mid]: h }))}
            />
          )}
        </div>
      </div>

      {/* Cálculos guardados del equipo (Calc Sheet) */}
      {teamCalcs.length > 0 && (
        <div className="panel p-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Icon name="bookmark" className="w-4 h-4 text-poke-pink" />
              {t('Cálculos guardados')} ({teamCalcs.length})
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={copyCalcSheet}
                className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <Icon name="copy" className="w-3.5 h-3.5" />
                {t('Copiar texto')}
              </button>
              <button
                type="button"
                disabled={exportingPng}
                onClick={downloadCalcSheetPng}
                className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <Icon name="download" className="w-3.5 h-3.5" />
                {exportingPng ? t('Generando…') : t('Descargar PNG')}
              </button>
              <button
                type="button"
                onClick={openCalcSheetPdf}
                className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <Icon name="printer" className="w-3.5 h-3.5" />
                {t('PDF / Imprimir')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {teamCalcs.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2.5 bg-poke-dark/40 hover:bg-poke-dark/70 border border-poke-accent/40 hover:border-poke-pink/50 rounded-lg p-2.5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => loadSavedCalc(c)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center shrink-0">
                    <PokemonSprite speciesId={c.yourSpeciesId} className="w-9 h-9 object-contain" />
                    <span className="text-[10px] text-gray-500 mx-0.5">vs</span>
                    <PokemonSprite speciesId={c.rivalSpeciesId} className="w-9 h-9 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1 text-xs space-y-0.5">
                    <div className="font-semibold truncate text-white">
                      {c.yourSpeciesName} <span className="text-gray-500 font-normal">vs</span> {c.rivalSpeciesName}
                    </div>
                    {c.yourBest && (
                      <div className="truncate text-gray-300">
                        <span className="text-poke-pink">→</span> {localizeName('moves', data.moveNames?.[c.yourBest.moveId] ?? c.yourBest.moveId, lang)}{' '}
                        <span className={`font-mono font-semibold ${pctClass(c.yourBest.pctMax)}`}>{c.yourBest.pctMin}–{c.yourBest.pctMax}%</span>
                      </div>
                    )}
                    {c.rivalBest && (
                      <div className="truncate text-gray-400">
                        <span className="text-sky-400">←</span> {localizeName('moves', data.moveNames?.[c.rivalBest.moveId] ?? c.rivalBest.moveId, lang)}{' '}
                        <span className={`font-mono font-semibold ${pctClass(c.rivalBest.pctMax)}`}>{c.rivalBest.pctMin}–{c.rivalBest.pctMax}%</span>
                      </div>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={t('Eliminar')}
                  onClick={() => deleteSavedCalc(c.id)}
                  className="shrink-0 px-1.5 py-0.5 text-gray-500 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
    </div>
  );
}

function HpPercentBar({ value, maxHp = null, onChange }) {
  const { t } = useLang();
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const v = Math.max(1, Math.min(100, value ?? 100));
  const fillColor = v > 50 ? 'bg-green-600' : v > 20 ? 'bg-yellow-500/70' : 'bg-red-600/70';
  const curHp = maxHp ? Math.max(1, Math.round((maxHp * v) / 100)) : null;

  const updateFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    onChange(Math.max(1, Math.min(100, pct)));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400 uppercase">{t('HP actual')}</span>
        <span className="font-mono text-gray-300 tabular-nums">
          {curHp != null ? `${curHp}/${maxHp} HP · ` : ''}{v}%
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={t('HP actual')}
        aria-valuemin={1}
        aria-valuemax={100}
        aria-valuenow={v}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, v - step)); }
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(100, v + step)); }
        }}
        className="relative h-5 rounded-full bg-poke-dark border border-poke-accent overflow-hidden cursor-ew-resize select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink/60"
      >
        <div
          className={`h-full rounded-full transition-[background-color] duration-150 ${fillColor}`}
          style={{ width: `${v}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[11px] font-mono font-bold text-white drop-shadow pointer-events-none">
          <span>HP</span>
          <span>{v}%</span>
        </div>
      </div>
    </div>
  );
}

function MoveResults({ results, moveNames, empty, hitsMap = {}, onHitsChange }) {
  const { t, lang } = useLang();
  return (
    <div className="mt-3 border-t border-poke-accent/30 pt-3 space-y-1">
      <h4 className="text-xs uppercase text-gray-400 mb-1">{t('Daño por movimiento')}</h4>
      {results.length === 0 ? (
        <p className="text-xs text-gray-500">{empty}</p>
      ) : (
        results.map((r) => {
          const startPct = r.defenderHpPct ?? 100;
          const remainMin = Math.max(0, startPct - r.pctMax); // HP restante en el peor caso
          const remainMax = Math.max(0, startPct - r.pctMin); // HP restante en el mejor caso
          const redWidth = Math.max(0, Math.min(startPct, r.pctMin));
          const yellowWidth = Math.max(0, remainMax - remainMin);
          const curHits = hitsMap[r.moveId] ?? r.hits;
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
              {r.multiHitOptions && onHitsChange && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-gray-400 mr-0.5">{t('Golpes')}:</span>
                  {r.multiHitOptions.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onHitsChange(r.moveId, h)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                        curHits === h
                          ? 'bg-poke-pink border-poke-pink text-white font-bold'
                          : 'bg-poke-dark border-poke-accent text-gray-300 hover:border-poke-pink/50'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
              {/* Barra de HP: verde = HP garantizado, amarillo = rango de daño, rojo = daño garantizado */}
              <div className="flex h-1.5 rounded overflow-hidden bg-black/40 mt-1">
                <div className="bg-green-600 transition-[width] duration-500 ease-out" style={{ width: `${remainMin}%` }} />
                <div className="bg-yellow-500/70 transition-[width] duration-500 ease-out" style={{ width: `${yellowWidth}%` }} />
                <div className="bg-red-600/70 transition-[width] duration-500 ease-out" style={{ width: `${redWidth}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function FieldColumn({ field, setField, yourSide, setYourSide, rivalSide, setRivalSide, yourFainted, setYourFainted, rivalFainted, setRivalFainted, onReset }) {
  const { t, lang } = useLang();
  const isDirty = Boolean(
    field.weather || field.terrain || field.crit || field.gravity || field.magicRoom || field.wonderRoom || field.singleTarget ||
    yourFainted > 0 || rivalFainted > 0 ||
    Object.values(yourSide).some(Boolean) || Object.values(rivalSide).some(Boolean)
  );
  return (
    <div className="panel p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="w-10" aria-hidden />
        <h3 className="font-semibold text-center text-gray-300 text-sm flex items-center justify-center gap-1.5">
          {t('Campo')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Battle conditions shared by both Pokémon: weather, terrain, screens, gravity, rooms, critical hit, spread target and fainted allies. They modify the final damage of every move.'
              : 'Las condiciones de combate comunes a ambos Pokémon: clima, terreno, pantallas, gravedad, zonas, golpe crítico, tipo de objetivo y aliados debilitados. Modifican el daño final de cada movimiento.'}
          </InfoTooltip>
        </h3>
        <button
          type="button"
          disabled={!isDirty}
          onClick={onReset}
          className="w-10 text-right text-xs text-poke-pink hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-poke-pink disabled:cursor-not-allowed"
        >
          {t('Reset')}
        </button>
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
          {t('Clima')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Weather boosts or weakens some types (Sun ×1.5 Fire / ×0.5 Water, Rain the reverse) and powers abilities/moves. Sand and Snow also grant SpD (Rock) and Def (Ice) boosts.'
              : 'El clima potencia o debilita algunos tipos (Sol ×1.5 Fuego / ×0.5 Agua, Lluvia al revés) y activa habilidades/movimientos. La Tormenta de arena y la Nieve suben además la Def. Esp. (Roca) y la Def. (Hielo).'}
          </InfoTooltip>
        </div>
        <Dropdown
          value={field.weather}
          options={WEATHERS}
          render={(w) => t(WEATHER_LABEL[w])}
          placeholder={t('Sin clima')}
          expand
          onChange={(w) => setField({ ...field, weather: w })}
        />
      </div>
      <div>
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
          {t('Terreno')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'The terrain only affects Pokémon on the ground (not Flying/Levitate). It boosts its type ×1.3, and Psychic Terrain also blocks priority moves against grounded targets.'
              : 'El terreno solo afecta a los Pokémon en tierra (no Voladores/Levitación). Potencia su tipo ×1.3, y el Campo Psíquico bloquea además los movimientos con prioridad contra objetivos en tierra.'}
          </InfoTooltip>
        </div>
        <Dropdown
          value={field.terrain}
          options={TERRAINS}
          render={(tr) => t(TERRAIN_LABEL[tr])}
          placeholder={t('Sin terreno')}
          expand
          onChange={(tr) => setField({ ...field, terrain: tr })}
        />
      </div>
      <div className="pt-1 border-t border-poke-accent/30">
        <div className="text-xs text-gray-400 mb-1">{t('Objetivo')}</div>
        <div className="grid grid-cols-2 gap-2 [&_button]:w-full">
          <FieldButton label={t('Único')} active={field.singleTarget} onClick={() => setField({ ...field, singleTarget: true })} />
          <FieldButton label={t('Doble')} active={!field.singleTarget} onClick={() => setField({ ...field, singleTarget: false })} />
        </div>
      </div>
      <div className="pt-1 border-t border-poke-accent/30">
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
          {t('Pantallas')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Screens halve the damage the affected side takes (Reflect physical, Light Screen special, Aurora Veil both). In doubles the reduction is ×0.667 instead of ×0.5. They protect the defender, so set them on the side that receives the hit.'
              : 'Las pantallas reducen a la mitad el daño que recibe ese lado (Reflejo el físico, Pantalla Luz el especial, Velo Aurora ambos). En dobles la reducción es ×0,667 en vez de ×0,5. Protegen al defensor, así que actívalas en el lado que recibe el golpe.'}
          </InfoTooltip>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <SideChips label={t('Tu lado')} side={yourSide} onChange={setYourSide} />
          <SideChips label={t('Lado rival')} side={rivalSide} onChange={setRivalSide} fromRight />
        </div>
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
        <div className="text-xs text-gray-400 mb-1 uppercase flex items-center gap-1.5">
          {t('Aliados KO')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Number of fainted allies on each side (0–3 in doubles). It powers Supreme Overlord (+10% damage per fallen ally) and Last Respects (+50 base power per fallen ally).'
              : 'Número de aliados debilitados en cada lado (0–3 en dobles). Escala General Supremo (+10 % de daño por aliado caído) y Última Baza (+50 de potencia por aliado caído).'}
          </InfoTooltip>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FaintedSelect label={t('Tu lado')} value={yourFainted} onChange={setYourFainted} />
          <FaintedSelect label={t('Lado rival')} value={rivalFainted} onChange={setRivalFainted} />
        </div>
      </div>
    </div>
  );
}

const SIDE_OPTIONS = [
  { key: 'reflect', label: 'Reflejo' },
  { key: 'lightScreen', label: 'P. Luz' },
  { key: 'auroraVeil', label: 'Velo Aurora' },
  { key: 'helpingHand', label: 'Refuerzo' },
  { key: 'friendGuard', label: 'Compiescolta' },
  { key: 'protected', label: 'Protección' },
];

function SideChips({ label, side, onChange, fromRight = false }) {
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

function FieldButton({ label, active, onClick, className = '' }) {
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

function Chip({ label, active, onClick, className = '', fromRight = false }) {
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

function RivalEditor({ data, mon, onChange, hasMeta, onApplyMeta, field, hpPct = 100, onHpPct }) {
  const { t, lang } = useLang();
  const species = mon.speciesId ? getSpecies(mon.speciesId) : null;
  const learnset = mon.speciesId ? getLearnset(mon.speciesId, data) : [];
  const set = (patch) => onChange({ ...mon, ...patch });

  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const applyPreset = (preset) => {
    let evs;
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
  const PRESETS = [
    { id: 'hp', label: 'Máx HP' }, { id: 'hpdef', label: 'HP/Def' }, { id: 'hpspd', label: 'HP/SpD' },
    { id: 'off', label: 'Ofensivo' }, { id: 'reset', label: 'Reset' },
  ];

  const pickSpecies = (sp) => {
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
                const setEv = (val) => {
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

          {onHpPct && (
            <HpPercentBar
              value={hpPct}
              maxHp={species ? calcAllStats(species.baseStats, mon.evs, mon.ivs, mon.nature, mon.level || 50, mon.evMode).hp : null}
              onChange={onHpPct}
            />
          )}

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
                <MoveSearch
                  key={i}
                  moves={learnset}
                  value={mon.moves[i] ?? ''}
                  names={data.moveNames ?? {}}
                  onPick={(v) => { const moves = [...mon.moves]; moves[i] = v; set({ moves }); }}
                  placeholder={`${t('Movimiento')} ${i + 1}`}
                  lang={lang}
                  clearable
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BoostsEditor({ boosts, onBoosts }) {
  const { t } = useLang();
  return (
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
  );
}

// Aliados debilitados (0–3 en dobles): escala Supreme Overlord (General Supremo) y Last Respects (Última Baza).
function FaintedSelect({ label, value, onChange }) {
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 uppercase">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function SearchSelect({ placeholder, options, value, onPick, icon, valueIcon }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(value); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [value]);

  const q = query.toLowerCase().trim();
  const results = options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30);

  const showIcon = !!value && !!valueIcon;

  return (
    <div ref={ref} className="relative">
      {showIcon && (
        <div className="absolute left-3 inset-y-0 flex items-center pointer-events-none">{valueIcon()}</div>
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
