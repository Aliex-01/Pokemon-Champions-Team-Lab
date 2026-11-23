import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createEmptyPokemon } from '../types/pokemon';
import { searchSpecies, getLearnset, getSpecies, getSpeciesByName, getMegaStoneNames, getMegaStonesForSpecies, localizeName, localizeMoveDesc, localizeAbilityDesc, localizeItemDesc } from '../lib/championsData';
import {
  calcAllStats,
  totalInvestment,
  maxInvestment,
  maxSingleStat,
  convertInvestment,
  formatNatureLabel,
  getStatNatureClass,
  CHAMPIONS_LEVEL,
} from '../lib/stats';
import { PokemonSprite, ItemSprite } from './PokemonSprite';
import { Dropdown } from './Dropdown';
import { InfoTooltip } from './InfoTooltip';
import { useLang } from '../lib/i18n';
import { TYPE_NAMES } from '../lib/typeChart';

function normKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getBuildForSpecies(speciesId, builds) {
  if (!speciesId || !builds?.pokemon) return null;
  if (builds.pokemon[speciesId]) return builds.pokemon[speciesId];
  const sp = getSpecies(speciesId);
  if (sp?.baseSpeciesId && builds.pokemon[sp.baseSpeciesId]) return builds.pokemon[sp.baseSpeciesId];
  return null;
}

function parseSpreadStr(evs) {
  const [hp, atk, def, spa, spd, spe] = String(evs ?? '').split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
}

const EV_PRESETS = [
  { id: 'atk-spe', label: 'Atk / Spe', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 }, ev: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } },
  { id: 'spa-spe', label: 'SpA / Spe', sp: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 }, ev: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } },
  { id: 'hp-atk', label: 'HP / Atk', sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 }, ev: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 } },
  { id: 'hp-spa', label: 'HP / SpA', sp: { hp: 32, atk: 0, def: 0, spa: 32, spd: 2, spe: 0 }, ev: { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 } },
  { id: 'hp-def', label: 'HP / Def', sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 }, ev: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } },
  { id: 'hp-spd', label: 'HP / SpD', sp: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 }, ev: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 } },
];

export function PokemonEditor({ data, builds = null, teamPokemon = [], pokemon, slotIndex = 0, slotStatus = null, onUpdate, onDelete, isActive, isSelected, onSelect }) {
  const { t, lang } = useLang();
  const [appliedMeta, setAppliedMeta] = useState(false);
  const species = pokemon.speciesId ? getSpecies(pokemon.speciesId) : null;
  const learnset = pokemon.speciesId ? getLearnset(pokemon.speciesId, data) : [];
  const evMode = pokemon.evMode ?? 'champions';
  const level = CHAMPIONS_LEVEL;
  const isMega = species?.isMega ?? false;
  const stats = species
    ? calcAllStats(species.baseStats, pokemon.evs, pokemon.ivs, pokemon.nature, level, evMode)
    : null;

  const metaBuild = useMemo(() => getBuildForSpecies(pokemon.speciesId, builds), [pokemon.speciesId, builds]);

  const moveIdByName = useMemo(() => {
    const m = new Map();
    for (const [id, name] of Object.entries(data.moveNames ?? {})) {
      m.set(normKey(name), id);
    }
    return m;
  }, [data]);

  const abilityPct = useMemo(() => {
    const m = new Map();
    for (const a of metaBuild?.abilities ?? []) m.set(normKey(a.name), a.pct);
    return m;
  }, [metaBuild]);

  const itemPct = useMemo(() => {
    const m = new Map();
    for (const it of metaBuild?.items ?? []) {
      if (it.name && it.name !== 'Sin objeto') m.set(normKey(it.name), it.pct);
    }
    return m;
  }, [metaBuild]);

  const movePct = useMemo(() => {
    const m = new Map();
    for (const mv of metaBuild?.moves ?? []) {
      const id = moveIdByName.get(normKey(mv.name)) ?? normKey(mv.name);
      m.set(id, mv.pct);
    }
    return m;
  }, [metaBuild, moveIdByName]);

  // Lista de objetos sin megapiedras, salvo las de la propia especie (si tiene mega),
  // ordenada primero por % de uso en el meta.
  const itemOptions = useMemo(() => {
    const ownStones = new Set(pokemon.speciesId ? getMegaStonesForSpecies(pokemon.speciesId) : []);
    const allStones = getMegaStoneNames();
    const filtered = data.items.filter((i) => !allStones.has(i) || ownStones.has(i));
    if (itemPct.size === 0) return filtered;
    return [...filtered].sort((a, b) => (itemPct.get(normKey(b)) ?? -1) - (itemPct.get(normKey(a)) ?? -1));
  }, [data.items, pokemon.speciesId, itemPct]);

  const sortedAbilities = abilityPct.size === 0
    ? (species?.abilities ?? [])
    : [...(species?.abilities ?? [])].sort((a, b) => (abilityPct.get(normKey(b)) ?? -1) - (abilityPct.get(normKey(a)) ?? -1));

  const sortedBaseAbilities = abilityPct.size === 0
    ? (species?.baseAbilities ?? [])
    : [...(species?.baseAbilities ?? [])].sort((a, b) => (abilityPct.get(normKey(b)) ?? -1) - (abilityPct.get(normKey(a)) ?? -1));

  const renderAbilityOption = (a) => {
    const name = localizeName('abilities', a, lang);
    const pct = abilityPct.get(normKey(a));
    const desc = localizeAbilityDesc(a, lang);
    return (
      <span className="block w-full">
        <span className="flex items-center justify-between gap-2 w-full">
          <span className="truncate font-medium">{name}</span>
          {pct != null && pct >= 1 && (
            <span className="text-xs font-mono text-poke-pink shrink-0">{Math.round(pct)}%</span>
          )}
        </span>
        {desc && (
          <span className="block text-xs text-gray-400 leading-snug line-clamp-2 mt-0.5 font-normal">
            {desc}
          </span>
        )}
      </span>
    );
  };

  const applyMetaBuild = () => {
    if (!metaBuild || !species) return;
    const topMoves = metaBuild.moves.slice(0, 4).map((mv) => {
      const n = normKey(mv.name);
      return moveIdByName.get(n) ?? n;
    });
    while (topMoves.length < 4) topMoves.push('');

    const rawSpread = metaBuild.spreads?.[0]?.evs
      ? parseSpreadStr(metaBuild.spreads[0].evs)
      : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const evs = evMode === 'champions'
      ? rawSpread
      : convertInvestment(rawSpread, 'champions', 'traditional');

    const topItem = metaBuild.items?.[0]?.name;
    const updates = {
      nature: metaBuild.spreads?.[0]?.nature ?? metaBuild.natures?.[0]?.name ?? pokemon.nature,
      evs,
      moves: topMoves.slice(0, 4),
    };
    if (!isMega) {
      if (metaBuild.abilities?.[0]?.name) updates.ability = metaBuild.abilities[0].name;
      updates.item = topItem && topItem !== 'Sin objeto' ? topItem : '';
    } else if (metaBuild.abilities?.[0]?.name && species.baseAbilities?.includes(metaBuild.abilities[0].name)) {
      updates.preMegaAbility = metaBuild.abilities[0].name;
    }
    onUpdate(updates);
    setAppliedMeta(true);
    setTimeout(() => setAppliedMeta(false), 1500);
  };

  const invested = totalInvestment(pokemon.evs, evMode);
  const maxTotal = maxInvestment(evMode);
  const maxSingle = maxSingleStat(evMode);
  const investmentLabel = evMode === 'champions' ? 'Stat Points' : 'EVs';
  const step = evMode === 'champions' ? 1 : 4;

  const switchEvMode = (target) => {
    if (target === evMode) return;
    onUpdate({
      evMode: target,
      evs: convertInvestment(pokemon.evs, evMode, target),
    });
  };

  if (!isActive) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`relative panel p-3 text-left w-full h-full transition-all active:scale-[0.98] hover:-translate-y-0.5 ${
          isSelected
            ? 'border-poke-pink ring-2 ring-poke-pink/60 shadow-lg shadow-poke-pink/20'
            : 'hover:border-poke-pink/50'
        } ${pokemon.speciesId ? '' : isSelected ? 'border-dashed' : 'border-dashed opacity-60'}`}
      >
        {pokemon.speciesId && slotStatus && (
          <span
            title={slotStatus.tip}
            aria-label={slotStatus.tip}
            className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
              slotStatus.tone === 'error'
                ? 'bg-red-500 ring-2 ring-red-500/30'
                : 'bg-amber-400/80 ring-2 ring-amber-400/20'
            }`}
          />
        )}
        {pokemon.speciesId ? (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 flex items-center justify-center">
              {species?.types?.[0] && (
                <div className={`absolute inset-0.5 rounded-full blur-md pointer-events-none type-glow-${species.types[0].toLowerCase()}`} />
              )}
              <PokemonSprite speciesId={pokemon.speciesId} className="relative w-12 h-12 object-contain drop-shadow" />
              {(() => {
                const heldItem = pokemon.item || (isMega ? species?.megaStone : '') || '';
                return heldItem ? (
                  <ItemSprite
                    item={heldItem}
                    className="absolute -bottom-1 -right-1 drop-shadow w-6 h-6"
                  />
                ) : null;
              })()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{pokemon.speciesName}</div>
              {species && (
                <div className="flex gap-1 my-0.5">
                  {species.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-400 truncate">
                {isMega && pokemon.preMegaAbility
                  ? `${localizeName('abilities', pokemon.preMegaAbility, lang)} → ${localizeName('abilities', pokemon.ability, lang)}`
                  : localizeName('abilities', pokemon.ability, lang)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-center flex items-center justify-center h-full min-h-[4.5rem]">{t('+ Añadir Pokémon')}</div>
        )}
      </button>
    );
  }

  return (
    <div className="panel p-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-stretch">
        <div className="flex-1 min-w-[14rem]">
          <SpeciesSearch
            data={data}
            builds={builds}
            teamPokemon={teamPokemon}
            value={pokemon.speciesName}
            gridMode={!species}
            onSelect={(s) => handleSpeciesSelect(s, onUpdate)}
          />
        </div>
        {species && metaBuild && (
          <button
            type="button"
            className={`shrink-0 px-3 py-2 rounded-lg border font-medium transition-colors ${
              appliedMeta
                ? 'border-emerald-500/60 bg-emerald-900/30 text-emerald-300'
                : 'border-poke-pink/50 bg-poke-pink/15 text-poke-pink hover:bg-poke-pink/25'
            }`}
            title={t('Aplica habilidad, objeto, naturaleza, reparto y movimientos más usados en Smogon')}
            onClick={applyMetaBuild}
          >
            {appliedMeta ? `✓ ${t('Aplicado')}` : t('Cargar build meta')}
          </button>
        )}
        {species && (
          <button
            type="button"
            className="shrink-0 px-3 py-2 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors"
            title={t('Eliminar Pokémon')}
            onClick={() => (onDelete ? onDelete() : onUpdate(createEmptyPokemon(pokemon.slotId)))}
          >
            {t('Eliminar')}
          </button>
        )}
      </div>

      {species && (
        <>
          <div className="flex gap-4 items-center">
            <div className="shrink-0 w-[140px] h-[140px] bg-poke-dark/50 rounded-lg flex items-center justify-center">
              <PokemonSprite
                speciesId={pokemon.speciesId}
                alt={pokemon.speciesName}
                className="w-28 h-28 object-contain"
              />
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isMega ? (
                <>
                  <Field
                    label={t('Habilidad (Mega)')}
                    hint={localizeAbilityDesc(pokemon.ability, lang) ? (
                      <InfoTooltip label={t('Más información')}>
                        {localizeAbilityDesc(pokemon.ability, lang)}
                      </InfoTooltip>
                    ) : null}
                  >
                    <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed">
                      {localizeName('abilities', pokemon.ability, lang)}
                    </div>
                  </Field>
                  <Field
                    label={t('Habilidad (forma base)')}
                    hint={localizeAbilityDesc(pokemon.preMegaAbility ?? species.baseAbilities?.[0], lang) ? (
                      <InfoTooltip label={t('Más información')}>
                        {localizeAbilityDesc(pokemon.preMegaAbility ?? species.baseAbilities?.[0], lang)}
                      </InfoTooltip>
                    ) : null}
                  >
                    <Dropdown
                      value={pokemon.preMegaAbility ?? species.baseAbilities?.[0] ?? ''}
                      options={sortedBaseAbilities}
                      render={(a) => localizeName('abilities', a, lang)}
                      renderOption={renderAbilityOption}
                      onChange={(preMegaAbility) => onUpdate({ preMegaAbility })}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field
                    label={t('Habilidad')}
                    hint={localizeAbilityDesc(pokemon.ability, lang) ? (
                      <InfoTooltip label={t('Más información')}>
                        {localizeAbilityDesc(pokemon.ability, lang)}
                      </InfoTooltip>
                    ) : null}
                  >
                    <Dropdown
                      value={pokemon.ability}
                      options={sortedAbilities}
                      render={(a) => localizeName('abilities', a, lang)}
                      renderOption={renderAbilityOption}
                      onChange={(ability) => onUpdate({ ability })}
                    />
                  </Field>
                  {/* Hueco para alinear Objeto/Naturaleza en la fila inferior, igual que en megas */}
                  <div className="hidden sm:block" aria-hidden />
                </>
              )}
              <Field
                label={t('Objeto')}
                hint={localizeItemDesc(pokemon.item || (isMega ? species.megaStone : ''), lang) ? (
                  <InfoTooltip label={t('Más información')}>
                    {localizeItemDesc(pokemon.item || (isMega ? species.megaStone : ''), lang)}
                  </InfoTooltip>
                ) : null}
              >
                {isMega ? (
                  <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed flex items-center gap-2">
                    <ItemSprite item={pokemon.item || species.megaStone || ''} className="w-6 h-6" />
                    <span>{localizeName('items', pokemon.item || species.megaStone || '', lang)}</span>
                  </div>
                ) : (
                  <ItemSearch
                    items={itemOptions}
                    itemPct={itemPct}
                    value={pokemon.item}
                    onChange={(item) => onUpdate({ item })}
                  />
                )}
              </Field>
              <Field
                label={t('Naturaleza')}
                hint={
                  <InfoTooltip label={t('Más información')}>
                    {lang === 'en'
                      ? 'A Nature raises one stat by 10% and lowers another by 10% (shown in green/red on the stats). Neutral Natures change nothing.'
                      : 'La naturaleza sube una estadística un 10% y baja otra un 10% (marcadas en verde/rojo en las stats). Las naturalezas neutras no cambian nada.'}
                  </InfoTooltip>
                }
              >
                <Dropdown
                  value={pokemon.nature}
                  options={data.natures}
                  onChange={(nature) => onUpdate({ nature })}
                  render={(n) => formatNatureLabel(n, localizeName('natures', n, lang))}
                />
              </Field>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <h3 className="font-semibold flex items-center gap-1.5">
                {t(investmentLabel)} ({invested}/{maxTotal})
                <InfoTooltip label={t('Más información')}>
                  {lang === 'en'
                    ? 'Champions uses Stat Points (0–32 per stat). “Classic EVs” shows them on the Showdown scale (0–252). Switching modes only changes how they are displayed: the spread is converted automatically.'
                    : 'Champions usa Stat Points (0–32 por estadística). «EVs clásicos» los muestra en la escala de Showdown (0–252). Cambiar de modo solo cambia cómo se muestran: el reparto se convierte automáticamente.'}
                </InfoTooltip>
              </h3>
              <div className="flex gap-2 items-center">
                <div className="flex rounded-lg overflow-hidden border border-poke-accent text-xs">
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${evMode === 'champions' ? 'bg-poke-pink text-white' : 'bg-poke-dark hover:bg-poke-accent/40'}`}
                    onClick={() => switchEvMode('champions')}
                  >
                    {t('Stat Points')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${evMode === 'traditional' ? 'bg-poke-pink text-white' : 'bg-poke-dark hover:bg-poke-accent/40'}`}
                    onClick={() => switchEvMode('traditional')}
                  >
                    {t('EVs clásicos')}
                  </button>
                </div>
                <button
                  type="button"
                  className="text-xs text-poke-pink"
                  onClick={() => onUpdate({
                    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
                  })}
                >
                  {t('Reset')}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] uppercase text-gray-400 mr-1">{t('Presets rápidos')}:</span>
              {EV_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="px-2 py-0.5 rounded-md text-xs bg-poke-dark/80 border border-poke-accent/70 text-gray-300 hover:border-poke-pink/60 hover:text-white transition-colors"
                  onClick={() => onUpdate({ evs: { ...(evMode === 'champions' ? p.sp : p.ev) } })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(['hp', 'atk', 'def', 'spa', 'spd', 'spe']).map((stat) => {
                const setEv = (val) => {
                  // Cap por presupuesto restante: nunca quita puntos a otras stats.
                  const others = totalInvestment(pokemon.evs, evMode) - pokemon.evs[stat];
                  const cap = Math.min(maxSingle, maxTotal - others);
                  onUpdate({ evs: { ...pokemon.evs, [stat]: Math.min(cap, Math.max(0, val)) } });
                };
                return (
                  <div key={stat} className="text-center">
                    <div className="text-xs text-gray-400 uppercase">{stat}</div>
                    <div className="flex items-stretch rounded-lg border border-poke-accent overflow-hidden mt-0.5">
                      <button type="button" className="shrink-0 px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(pokemon.evs[stat] - step)}>−</button>
                      <input
                        type="number" min={0} max={maxSingle}
                        className="no-spinner w-full min-w-0 bg-poke-dark text-center text-white outline-none py-2 border-x border-poke-accent"
                        value={pokemon.evs[stat]}
                        onChange={(e) => setEv(parseInt(e.target.value, 10) || 0)}
                      />
                      <button type="button" className="shrink-0 px-2 flex items-center justify-center bg-poke-dark text-gray-400 hover:bg-poke-accent/40 transition-colors select-none" onClick={() => setEv(pokemon.evs[stat] + step)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-sm">
              {(['hp', 'atk', 'def', 'spa', 'spd', 'spe']).map((stat) => (
                <div
                  key={stat}
                  className={`rounded-lg py-2 px-2 ${getStatNatureClass(pokemon.nature, stat) || 'bg-poke-dark/50'}`}
                >
                  <div className="text-gray-400 text-xs uppercase">{stat}</div>
                  <div key={stats[stat]} className="font-bold text-lg animate-fade-in-up">{stats[stat]}</div>
                  <div className="h-1.5 mt-1 rounded-full bg-black/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ease-out ${statBarColor(stats[stat])}`}
                      style={{ width: `${Math.min(100, (stats[stat] / 200) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <MoveSelector
            data={data}
            learnset={learnset}
            moves={pokemon.moves}
            movePct={movePct}
            onChange={(moves) => onUpdate({ moves })}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-poke-accent/30">
            <div className="flex gap-1.5">
              {species.types.map((t) => (
                <span key={t} className={`type-${t.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/damage?slot=${slotIndex}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-accent/30 hover:bg-poke-pink/20 border border-poke-accent/80 hover:border-poke-pink/60 text-gray-200 hover:text-white transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5 text-poke-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
                  <path d="M13 19l6-6" />
                  <path d="M16 16l4 4" />
                  <path d="M19 21l2-2" />
                </svg>
                {t('Calculadora')}
              </Link>
              <Link
                to={`/optimizer?species=${pokemon.speciesId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-accent/30 hover:bg-poke-pink/20 border border-poke-accent/80 hover:border-poke-pink/60 text-gray-200 hover:text-white transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5 text-poke-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="2" y1="14" x2="6" y2="14" />
                  <line x1="10" y1="8" x2="14" y2="8" />
                  <line x1="18" y1="16" x2="22" y2="16" />
                </svg>
                {t('Optimizador')}
              </Link>
              <Link
                to={`/speed?mon=${pokemon.speciesId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-poke-accent/30 hover:bg-poke-pink/20 border border-poke-accent/80 hover:border-poke-pink/60 text-gray-200 hover:text-white transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5 text-poke-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {t('Speed Tier')}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function handleSpeciesSelect(
  s,
  onUpdate
) {
  const updates = {
    speciesId: s.id,
    speciesName: s.name,
    ability: s.abilities[0] ?? '',
    moves: ['', '', '', ''],
    level: 50,
  };

  if (s.isMega) {
    updates.item = s.megaStone ?? '';
    updates.preMegaAbility = s.baseAbilities?.[0] ?? '';
  } else {
    updates.item = '';
    updates.preMegaAbility = undefined;
  }

  onUpdate(updates);
}

function SpeciesSearch({
  data,
  builds,
  teamPokemon = [],
  value,
  gridMode = false,
  onSelect,
}) {
  const { t } = useLang();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const ref = useRef(null);
  // En modo grid mostramos todos los resultados; en el desplegable basta con 30.
  const results = searchSpecies(query, data, gridMode ? Infinity : 9999)
    .filter((s) => !typeFilter || s.types.includes(typeFilter))
    .slice(0, gridMode ? Infinity : 30);

  // Compañeros sugeridos desde Smogon combinando los Pokémon actuales del equipo.
  const suggestedTeammates = useMemo(() => {
    if (!gridMode || !builds?.pokemon) return [];
    const currentMons = teamPokemon.filter((m) => m.speciesId);
    if (currentMons.length === 0) return [];
    const existingNums = new Set(
      currentMons.map((m) => getSpecies(m.speciesId)?.num).filter(Boolean)
    );
    const scores = new Map();
    for (const m of currentMons) {
      const b = getBuildForSpecies(m.speciesId, builds);
      if (!b?.teammates) continue;
      for (const tm of b.teammates) {
        const sp = getSpeciesByName(tm.name);
        if (!sp || existingNums.has(sp.num)) continue;
        if (typeFilter && !sp.types.includes(typeFilter)) continue;
        const cur = scores.get(sp.id) ?? { species: sp, score: 0, count: 0 };
        cur.score += tm.pct;
        cur.count += 1;
        scores.set(sp.id, cur);
      }
    }
    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [gridMode, builds, teamPokemon, typeFilter]);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Estilo Pokémon Showdown: la barra de búsqueda se queda y debajo van todos los
  // Pokémon en una rejilla; al hacer clic se añade.
  if (gridMode) {
    return (
      <div>
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder={t('Buscar Pokémon de Champions...')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <Dropdown
            className="w-40 shrink-0"
            value={typeFilter}
            options={['', ...TYPE_NAMES]}
            placeholder={t('Todos los tipos')}
            render={(ty) => (ty ? ty : t('Todos los tipos'))}
            onChange={setTypeFilter}
          />
        </div>
        {!query.trim() && suggestedTeammates.length > 0 && (
          <div className="mt-2 rounded-lg border border-poke-pink/35 bg-poke-pink/5 p-2.5">
            <div className="text-xs font-semibold text-poke-pink mb-1.5">
              {t('Compañeros sugeridos (Smogon)')}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {suggestedTeammates.map(({ species: s, score, count }) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg bg-poke-dark/50 hover:bg-poke-accent/50 border border-poke-accent/40 transition-colors"
                  title={`${s.name} · ${s.types.join('/')}`}
                  onClick={() => onSelect(s)}
                >
                  <PokemonSprite speciesId={s.id} className="w-11 h-11 object-contain" />
                  <span className="text-xs text-center leading-tight truncate w-full">{s.name}</span>
                  <span className="text-[10px] text-gray-400">
                    {Math.round(score / count)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 rounded-lg border border-poke-accent/60 bg-poke-dark/30 p-2">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('Sin resultados')}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-poke-accent/50 transition-colors"
                  title={`${s.name} · ${s.types.join('/')}`}
                  onClick={() => onSelect(s)}
                >
                  <PokemonSprite speciesId={s.id} className="w-12 h-12 object-contain" />
                  <span className="text-xs text-center leading-tight truncate w-full">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="input-field"
        placeholder={t('Buscar Pokémon de Champions...')}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 max-h-60 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 flex items-center gap-2"
                onClick={() => {
                  onSelect(s);
                  setQuery(s.name);
                  setOpen(false);
                }}
              >
                <PokemonSprite speciesId={s.id} className="w-8 h-8" />
                <span>{s.name}</span>
                <span className="text-xs text-gray-400 ml-auto">{s.types.join('/')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORY_STYLE = {
  Physical: 'bg-red-600 text-white',
  Special: 'bg-blue-600 text-white',
  Status: 'bg-gray-500 text-white',
};
const CATEGORY_LABEL = {
  Physical: 'Físico', Special: 'Especial', Status: 'Estado',
};

/** Color de la barra de stat al estilo Showdown según el valor final (nivel 50). */
function statBarColor(value) {
  if (value >= 150) return 'bg-green-500';
  if (value >= 110) return 'bg-lime-500';
  if (value >= 80) return 'bg-yellow-500';
  if (value >= 55) return 'bg-orange-500';
  return 'bg-red-500';
}

function TypeBadge({ type, size = 'text-xs' }) {
  return (
    <span className={`type-${type.toLowerCase()} px-2 py-0.5 rounded ${size} font-medium`}>
      {type}
    </span>
  );
}

function MoveSelector({
  data,
  learnset,
  moves,
  movePct,
  onChange,
}) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const setMove = (index, id) => {
    const next = [...moves];
    next[index] = id;
    onChange(next);
    setEditing(null);
    setQuery('');
  };

  // Tipos presentes en el learnset (para el desplegable de filtro).
  const learnsetTypes = [...new Set(learnset.map((id) => data.moveData?.[id]?.type).filter(Boolean))].sort();
  const hasUsage = movePct && movePct.size > 0;

  const q = query.toLowerCase().trim();
  const available = learnset
    .filter((id) => {
      // Evita repetir un movimiento ya elegido en otra ranura.
      if (moves.includes(id) && moves[editing ?? -1] !== id) return false;
      const md = data.moveData?.[id];
      if (typeFilter && md?.type !== typeFilter) return false;
      if (catFilter && md?.category !== catFilter) return false;
      const name = (data.moveNames?.[id] ?? id).toLowerCase();
      const locName = localizeName('moves', data.moveNames?.[id] ?? id, lang).toLowerCase();
      const type = md?.type.toLowerCase() ?? '';
      return !q || name.includes(q) || locName.includes(q) || type.includes(q);
    })
    .sort((a, b) => {
      if (!hasUsage) return 0;
      return (movePct.get(b) ?? -1) - (movePct.get(a) ?? -1);
    });

  return (
    <div>
      <h3 className="font-semibold mb-2">{t('Movimientos')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {moves.map((move, i) => {
          const md = move ? data.moveData?.[move] : undefined;
          const isEditing = editing === i;
          return (
            <div key={i} className="flex items-center gap-1">
              <button
                type="button"
                className={`select-field flex items-center gap-2 text-left ${
                  isEditing ? 'ring-2 ring-poke-pink border-poke-pink' : ''
                } ${move ? '' : 'text-gray-400'}`}
                onClick={() => setEditing(isEditing ? null : i)}
              >
                {move ? (
                  <>
                    {md && <TypeBadge type={md.type} />}
                    <span className="truncate">{localizeName('moves', data.moveNames?.[move] ?? move, lang)}</span>
                  </>
                ) : (
                  <span>+ {t('Movimiento')} {i + 1}</span>
                )}
              </button>
              {move && (
                <button
                  type="button"
                  className="shrink-0 px-2 py-2 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors"
                  title={t('Quitar movimiento')}
                  onClick={() => setMove(i, '')}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <div className="mt-2 rounded-xl border border-poke-accent/60 bg-poke-dark/40 p-3 animate-fade-in-up">
          {/* Barra de herramientas: búsqueda + filtros */}
          <div className="flex flex-wrap items-stretch gap-2 mb-2">
            <input
              className="input-field flex-1 min-w-[12rem]"
              placeholder={t('Buscar movimiento...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <Dropdown
              className="w-40"
              value={typeFilter}
              options={['', ...learnsetTypes]}
              placeholder={t('Todos los tipos')}
              render={(ty) => (ty ? ty : t('Todos los tipos'))}
              onChange={setTypeFilter}
            />
            <div className="flex items-stretch rounded-lg overflow-hidden border border-poke-accent text-xs shrink-0">
              {['', 'Physical', 'Special', 'Status'].map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  className={`px-3 flex items-center transition-colors ${catFilter === c ? 'bg-poke-pink text-white' : 'bg-poke-dark hover:bg-poke-accent/40 text-gray-300'}`}
                  onClick={() => setCatFilter(c)}
                >
                  {c ? t(CATEGORY_LABEL[c]) : t('Todas')}
                </button>
              ))}
            </div>
          </div>

          {(typeFilter || catFilter || query) && (
            <div className="flex items-center justify-between mb-2 text-xs text-gray-400">
              <span>{available.length} {t('resultados')}</span>
              <button type="button" className="text-poke-pink hover:underline" onClick={() => { setQuery(''); setTypeFilter(''); setCatFilter(''); }}>
                {t('Limpiar filtros')}
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-lg border border-poke-accent/30">
            <table className="w-full text-sm border-collapse">
              <thead className="text-gray-400 uppercase text-[11px] text-left sticky top-0 bg-poke-panel z-10">
                <tr>
                  <th className="px-2 py-2 font-semibold">{t('Nombre')}</th>
                  {hasUsage && <th className="px-2 py-2 text-right font-semibold">{t('Uso')}</th>}
                  <th className="px-2 py-2 font-semibold">{t('Tipo')}</th>
                  <th className="px-2 py-2 font-semibold">{t('Cat.')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t('Pot.')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t('Prec.')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t('PP')}</th>
                  <th className="px-2 py-2 font-semibold">{t('Efecto')}</th>
                </tr>
              </thead>
              <tbody>
                {available.length === 0 ? (
                  <tr><td colSpan={hasUsage ? 8 : 7} className="px-2 py-6 text-center text-gray-500">{t('Sin movimientos')}</td></tr>
                ) : (
                  available.map((id, i) => {
                    const md = data.moveData?.[id];
                    const pct = hasUsage ? movePct.get(id) : undefined;
                    return (
                      <tr
                        key={id}
                        className={`border-t border-poke-accent/20 hover:bg-poke-pink/15 cursor-pointer transition-colors ${i % 2 ? 'bg-white/[0.02]' : ''}`}
                        onClick={() => setMove(editing, id)}
                      >
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{localizeName('moves', data.moveNames?.[id] ?? id, lang)}</td>
                        {hasUsage && (
                          <td className="px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap">
                            {pct != null && pct >= 1 ? (
                              <span className="text-poke-pink font-semibold">{Math.round(pct)}%</span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-2 py-1.5">{md && <TypeBadge type={md.type} size="text-sm" />}</td>
                        <td className="px-2 py-1.5">
                          {md && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_STYLE[md.category] ?? ''}`}>
                              {t(CATEGORY_LABEL[md.category] ?? md.category)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{md && md.power > 0 ? md.power : '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{md && md.accuracy != null ? `${md.accuracy}%` : '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{md?.pp ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-400 text-xs min-w-[12rem]">{localizeMoveDesc(id, md?.desc, lang)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemSearch({
  items,
  itemPct,
  value,
  onChange,
}) {
  const { t, lang } = useLang();
  const loc = (i) => localizeName('items', i, lang);
  const [query, setQuery] = useState(loc(value));
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setQuery(value ? localizeName('items', value, lang) : ''); }, [value, lang]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery(value ? localizeName('items', value, lang) : ''); // restaura el objeto seleccionado
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, lang]);

  const q = query.toLowerCase().trim();
  const results = items.filter((i) => !q || i.toLowerCase().includes(q) || loc(i).toLowerCase().includes(q)).slice(0, 50);

  const pick = (item) => {
    onChange(item);
    setQuery(loc(item));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {value && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex">
          <ItemSprite item={value} className="w-6 h-6" />
        </div>
      )}
      <input
        className="input-field"
        style={value ? { paddingLeft: '2.75rem' } : undefined}
        placeholder={t('Buscar objeto...')}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <ul className="absolute z-20 w-full mt-1 max-h-60 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          <li>
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-gray-400 italic"
              onClick={() => pick('')}
            >
              {t('(ninguno)')}
            </button>
          </li>
          {results.map((i) => {
            const pct = itemPct?.get(normKey(i));
            const desc = localizeItemDesc(i, lang);
            return (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-poke-accent/50"
                  onClick={() => pick(i)}
                >
                  <div className="flex items-center gap-2">
                    <ItemSprite item={i} className="w-6 h-6 shrink-0" />
                    <span className="truncate font-medium">{loc(i)}</span>
                    {pct != null && pct >= 1 && (
                      <span className="ml-auto text-xs font-mono text-poke-pink shrink-0">{Math.round(pct)}%</span>
                    )}
                  </div>
                  {desc && (
                    <div className="text-xs text-gray-400 leading-snug line-clamp-2 mt-0.5 pl-8">
                      {desc}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 uppercase inline-flex items-center gap-1">
        {label}
        {hint}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
