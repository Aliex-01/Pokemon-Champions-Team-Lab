import { useState, useEffect, useRef } from 'react';
import type { ChampionsData, SpeciesData, TeamPokemon } from '../types/pokemon';
import { createEmptyPokemon } from '../types/pokemon';
import { searchSpecies, getLearnset, getSpecies, getMegaStoneNames, getMegaStonesForSpecies, localizeName, localizeMoveDesc } from '../lib/championsData';
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
import { useLang } from '../lib/i18n';
import { TYPE_NAMES } from '../lib/typeChart';

interface PokemonEditorProps {
  data: ChampionsData;
  pokemon: TeamPokemon;
  slotIndex: number;
  onUpdate: (updates: Partial<TeamPokemon>) => void;
  isActive: boolean;
  isSelected?: boolean;
  onSelect: () => void;
}

export function PokemonEditor({ data, pokemon, onUpdate, isActive, isSelected, onSelect }: PokemonEditorProps) {
  const { t, lang } = useLang();
  const species = pokemon.speciesId ? getSpecies(pokemon.speciesId) : null;
  const learnset = pokemon.speciesId ? getLearnset(pokemon.speciesId, data) : [];
  const evMode = pokemon.evMode ?? 'champions';
  const level = CHAMPIONS_LEVEL;
  const isMega = species?.isMega ?? false;
  const stats = species
    ? calcAllStats(species.baseStats, pokemon.evs, pokemon.ivs, pokemon.nature, level, evMode)
    : null;

  // Lista de objetos sin megapiedras, salvo las de la propia especie (si tiene mega).
  const ownStones = new Set(pokemon.speciesId ? getMegaStonesForSpecies(pokemon.speciesId) : []);
  const allStones = getMegaStoneNames();
  const itemOptions = data.items.filter((i) => !allStones.has(i) || ownStones.has(i));

  const invested = totalInvestment(pokemon.evs, evMode);
  const maxTotal = maxInvestment(evMode);
  const maxSingle = maxSingleStat(evMode);
  const investmentLabel = evMode === 'champions' ? 'Stat Points' : 'EVs';
  const step = evMode === 'champions' ? 1 : 4;

  const switchEvMode = (target: 'champions' | 'traditional') => {
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
        className={`panel p-3 text-left w-full h-full transition-all active:scale-[0.98] hover:-translate-y-0.5 ${
          isSelected
            ? 'border-poke-gold ring-2 ring-poke-gold/60 shadow-lg shadow-poke-gold/20'
            : 'hover:border-poke-gold/50'
        } ${pokemon.speciesId ? '' : isSelected ? 'border-dashed' : 'border-dashed opacity-60'}`}
      >
        {pokemon.speciesId ? (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <PokemonSprite speciesId={pokemon.speciesId} className="w-12 h-12 object-contain" />
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
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <SpeciesSearch
            data={data}
            value={pokemon.speciesName}
            gridMode={!species}
            onSelect={(s) => handleSpeciesSelect(s, onUpdate)}
          />
        </div>
        {species && (
          <button
            type="button"
            className="shrink-0 px-3 py-2 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors"
            title={t('Eliminar Pokémon')}
            onClick={() => onUpdate(createEmptyPokemon(pokemon.slotId))}
          >
            {t('🗑 Eliminar')}
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
                  <Field label={t('Habilidad (Mega)')}>
                    <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed">
                      {localizeName('abilities', pokemon.ability, lang)}
                    </div>
                  </Field>
                  <Field label={t('Habilidad (forma base)')}>
                    <Dropdown
                      value={pokemon.preMegaAbility ?? species.baseAbilities?.[0] ?? ''}
                      options={species.baseAbilities ?? []}
                      render={(a) => localizeName('abilities', a, lang)}
                      onChange={(preMegaAbility) => onUpdate({ preMegaAbility })}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={t('Habilidad')}>
                    <Dropdown
                      value={pokemon.ability}
                      options={species.abilities}
                      render={(a) => localizeName('abilities', a, lang)}
                      onChange={(ability) => onUpdate({ ability })}
                    />
                  </Field>
                  {/* Hueco para alinear Objeto/Naturaleza en la fila inferior, igual que en megas */}
                  <div className="hidden sm:block" aria-hidden />
                </>
              )}
              <Field label={t('Objeto')}>
                {isMega ? (
                  <div className="select-field bg-poke-dark/60 text-gray-300 cursor-not-allowed flex items-center gap-2">
                    <ItemSprite item={pokemon.item || species.megaStone || ''} className="w-6 h-6" />
                    <span>{localizeName('items', pokemon.item || species.megaStone || '', lang)}</span>
                  </div>
                ) : (
                  <ItemSearch
                    items={itemOptions}
                    value={pokemon.item}
                    onChange={(item) => onUpdate({ item })}
                  />
                )}
              </Field>
              <Field label={t('Naturaleza')}>
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
              <h3 className="font-semibold">
                {t(investmentLabel)} ({invested}/{maxTotal})
              </h3>
              <div className="flex gap-2 items-center">
                <div className="flex rounded-lg overflow-hidden border border-poke-accent text-xs">
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${evMode === 'champions' ? 'bg-poke-gold text-white' : 'bg-poke-dark hover:bg-poke-accent/40'}`}
                    onClick={() => switchEvMode('champions')}
                  >
                    {t('Stat Points')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 ${evMode === 'traditional' ? 'bg-poke-gold text-white' : 'bg-poke-dark hover:bg-poke-accent/40'}`}
                    onClick={() => switchEvMode('traditional')}
                  >
                    {t('EVs clásicos')}
                  </button>
                </div>
                <button
                  type="button"
                  className="text-xs text-poke-gold"
                  onClick={() => onUpdate({
                    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
                  })}
                >
                  {t('Reset')}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => {
                const setEv = (val: number) => {
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
              {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => (
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
            onChange={(moves) => onUpdate({ moves })}
          />

          <div className="flex gap-1">
            {species.types.map((t) => (
              <span key={t} className={`type-${t.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function handleSpeciesSelect(
  s: SpeciesData,
  onUpdate: (updates: Partial<TeamPokemon>) => void
) {
  const updates: Partial<TeamPokemon> = {
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
  value,
  gridMode = false,
  onSelect,
}: {
  data: ChampionsData;
  value: string;
  gridMode?: boolean;
  onSelect: (s: SpeciesData) => void;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  // En modo grid mostramos todos los resultados; en el desplegable basta con 30.
  const results = searchSpecies(query, data, gridMode ? Infinity : 9999)
    .filter((s) => !typeFilter || s.types.includes(typeFilter))
    .slice(0, gridMode ? Infinity : 30);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

const CATEGORY_STYLE: Record<string, string> = {
  Physical: 'bg-red-600 text-white',
  Special: 'bg-blue-600 text-white',
  Status: 'bg-gray-500 text-white',
};
const CATEGORY_LABEL: Record<string, string> = {
  Physical: 'Físico', Special: 'Especial', Status: 'Estado',
};

/** Color de la barra de stat al estilo Showdown según el valor final (nivel 50). */
function statBarColor(value: number): string {
  if (value >= 150) return 'bg-green-500';
  if (value >= 110) return 'bg-lime-500';
  if (value >= 80) return 'bg-yellow-500';
  if (value >= 55) return 'bg-orange-500';
  return 'bg-red-500';
}

function TypeBadge({ type, size = 'text-xs' }: { type: string; size?: string }) {
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
  onChange,
}: {
  data: ChampionsData;
  learnset: string[];
  moves: TeamPokemon['moves'];
  onChange: (moves: TeamPokemon['moves']) => void;
}) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const setMove = (index: number, id: string) => {
    const next = [...moves] as TeamPokemon['moves'];
    next[index] = id;
    onChange(next);
    setEditing(null);
    setQuery('');
  };

  // Tipos presentes en el learnset (para el desplegable de filtro).
  const learnsetTypes = [...new Set(learnset.map((id) => data.moveData?.[id]?.type).filter(Boolean))].sort() as string[];

  const q = query.toLowerCase().trim();
  const available = learnset.filter((id) => {
    // Evita repetir un movimiento ya elegido en otra ranura.
    if (moves.includes(id) && moves[editing ?? -1] !== id) return false;
    const md = data.moveData?.[id];
    if (typeFilter && md?.type !== typeFilter) return false;
    if (catFilter && md?.category !== catFilter) return false;
    const name = (data.moveNames?.[id] ?? id).toLowerCase();
    const type = md?.type.toLowerCase() ?? '';
    return !q || name.includes(q) || type.includes(q);
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
                  isEditing ? 'ring-2 ring-poke-gold border-poke-gold' : ''
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
                  className={`px-3 flex items-center transition-colors ${catFilter === c ? 'bg-poke-gold text-white' : 'bg-poke-dark hover:bg-poke-accent/40 text-gray-300'}`}
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
              <button type="button" className="text-poke-gold hover:underline" onClick={() => { setQuery(''); setTypeFilter(''); setCatFilter(''); }}>
                {t('Limpiar filtros')}
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-lg border border-poke-accent/30">
            <table className="w-full text-sm border-collapse">
              <thead className="text-gray-400 uppercase text-[11px] text-left sticky top-0 bg-poke-panel z-10">
                <tr>
                  <th className="px-2 py-2 font-semibold">{t('Nombre')}</th>
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
                  <tr><td colSpan={7} className="px-2 py-6 text-center text-gray-500">{t('Sin movimientos')}</td></tr>
                ) : (
                  available.map((id, i) => {
                    const md = data.moveData?.[id];
                    return (
                      <tr
                        key={id}
                        className={`border-t border-poke-accent/20 hover:bg-poke-gold/15 cursor-pointer transition-colors ${i % 2 ? 'bg-white/[0.02]' : ''}`}
                        onClick={() => setMove(editing, id)}
                      >
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{localizeName('moves', data.moveNames?.[id] ?? id, lang)}</td>
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
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (item: string) => void;
}) {
  const { t, lang } = useLang();
  const loc = (i: string) => localizeName('items', i, lang);
  const [query, setQuery] = useState(loc(value));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value ? localizeName('items', value, lang) : ''); }, [value, lang]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value ? localizeName('items', value, lang) : ''); // restaura el objeto seleccionado
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, lang]);

  const q = query.toLowerCase().trim();
  const results = items.filter((i) => !q || i.toLowerCase().includes(q) || loc(i).toLowerCase().includes(q)).slice(0, 50);

  const pick = (item: string) => {
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
          {results.map((i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 flex items-center gap-2"
                onClick={() => pick(i)}
              >
                <ItemSprite item={i} className="w-6 h-6 shrink-0" />
                <span>{loc(i)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
