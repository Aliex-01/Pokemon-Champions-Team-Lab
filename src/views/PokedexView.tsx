import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getLearnset, localizeName } from '../lib/championsData';
import { PokemonSprite } from '../components/PokemonSprite';
import { MoveSearch } from '../components/MoveSearch';
import { Combobox } from '../components/Combobox';
import { Dropdown } from '../components/Dropdown';
import { SegmentedControl } from '../components/SegmentedControl';
import { Modal } from '../components/Modal';
import { useFlip } from '../lib/useFlip';
import { useLang } from '../lib/i18n';
import { TYPE_NAMES } from '../lib/typeChart';
import type { ChampionsData, SpeciesData } from '../types/pokemon';

interface PokedexViewProps {
  data: ChampionsData;
}

type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABEL: Record<StatKey, string> = {
  hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtaEsp', spd: 'DefEsp', spe: 'Vel',
};
type SortKey = 'num' | 'bst' | StatKey | 'name';
type StatFilterKey = StatKey | 'bst';
const STAT_FILTER_KEYS: StatFilterKey[] = [...STAT_KEYS, 'bst'];

const bst = (s: SpeciesData) => STAT_KEYS.reduce((a, k) => a + s.baseStats[k], 0);

// Tope visual de una estadística individual para la barra (200+ = llena).
const STAT_MAX = 200;
function statColor(v: number): string {
  if (v >= 130) return 'bg-emerald-400';
  if (v >= 100) return 'bg-green-400';
  if (v >= 80) return 'bg-lime-400';
  if (v >= 60) return 'bg-yellow-400';
  if (v >= 40) return 'bg-orange-400';
  return 'bg-red-400';
}

/** Barra de estadística con etiqueta, valor y relleno coloreado por valor. */
function StatBar({ label, value, displayValue, animate, delay }: { label: string; value: number; displayValue?: number; animate?: boolean; delay?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[10px] font-medium text-gray-400">{label}</span>
      <span className="w-7 shrink-0 text-[10px] text-right tabular-nums text-gray-200">{displayValue ?? value}</span>
      <span className="flex-1 h-1.5 rounded-full bg-poke-dark/60 overflow-hidden">
        <span
          className={`block h-full rounded-full ${statColor(value)} ${animate ? 'grow-x' : ''}`}
          style={{ width: `${Math.min(100, (value / STAT_MAX) * 100)}%`, ...(animate && delay ? { animationDelay: `${delay}ms` } : {}) }}
        />
      </span>
    </div>
  );
}

/** Cuenta un número de 0 a `target` cuando se activa (respeta reduce-motion). */
function useCountUp(target: number, active: boolean, duration = 650): number {
  const [val, setVal] = useState(() => (active ? 0 : target));
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVal(target); return; }
    setVal(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return val;
}

/** Barra de estadística cuyo número cuenta de 0 a su valor al aparecer. */
function CountUpStatBar({ label, value, delay }: { label: string; value: number; delay?: number }) {
  const shown = useCountUp(value, true);
  return <StatBar label={label} value={value} displayValue={shown} animate delay={delay} />;
}

/** Número suelto que cuenta de 0 a su valor al aparecer. */
function CountUp({ value }: { value: number }) {
  return <>{useCountUp(value, true)}</>;
}

export function PokedexView({ data }: PokedexViewProps) {
  const { t, lang } = useLang();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selTypes, setSelTypes] = useState<string[]>([]);
  const [selMoves, setSelMoves] = useState<string[]>([]);
  const [movePick, setMovePick] = useState('');
  const [ability, setAbility] = useState('');
  const [megaFilter, setMegaFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [statMins, setStatMins] = useState<Partial<Record<StatFilterKey, number>>>({});
  const [sort, setSort] = useState<SortKey>('num');
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<SpeciesData | null>(null);

  // Debounce de la búsqueda: evita recalcular y re-medir el FLIP en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Ids de especie base que tienen al menos una megaevolución en el formato.
  const megaBaseIds = useMemo(() => {
    const toId = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const set = new Set<string>();
    for (const s of data.species) {
      if (!s.isMega && !/-Mega/.test(s.name)) continue;
      const base = s.baseSpeciesId ?? toId(s.name.replace(/-Mega.*$/, '').replace(/-[FM]$/, ''));
      if (base) set.add(base);
    }
    return set;
  }, [data]);

  // Dex de especies base (sin megas, que comparten learnset y duplicarían filas).
  const baseSpecies = useMemo(
    () => data.species.filter((s) => !s.isMega && !/-Mega/.test(s.name)).sort((a, b) => a.num - b.num),
    [data]
  );

  // Learnset por especie en un Set para comprobar pertenencia rápido.
  const learnsetSets = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of baseSpecies) m.set(s.id, new Set(getLearnset(s.id, data)));
    return m;
  }, [baseSpecies, data]);

  const results = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim().replace(/\s/g, '');
    const list = baseSpecies.filter((s) => {
      if (q && !s.name.toLowerCase().replace(/\s/g, '').includes(q) && !s.id.includes(q)) return false;
      if (selTypes.length && !selTypes.every((tp) => s.types.includes(tp))) return false;
      if (ability && !s.abilities.includes(ability)) return false;
      if (megaFilter !== 'any') {
        const has = megaBaseIds.has(s.id);
        if (megaFilter === 'yes' && !has) return false;
        if (megaFilter === 'no' && has) return false;
      }
      for (const k of STAT_FILTER_KEYS) {
        const min = statMins[k] ?? 0;
        if (min > 0 && (k === 'bst' ? bst(s) : s.baseStats[k]) < min) return false;
      }
      if (selMoves.length) {
        const ls = learnsetSets.get(s.id);
        if (!ls || !selMoves.every((mid) => ls.has(mid))) return false;
      }
      return true;
    });
    const cmp = (a: SpeciesData, b: SpeciesData) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'num') return a.num - b.num;
      const va = sort === 'bst' ? bst(a) : a.baseStats[sort];
      const vb = sort === 'bst' ? bst(b) : b.baseStats[sort];
      return va - vb;
    };
    list.sort((a, b) => (asc ? cmp(a, b) : -cmp(a, b)));
    return list;
  }, [baseSpecies, debouncedQuery, selTypes, ability, selMoves, learnsetSets, megaFilter, megaBaseIds, statMins, sort, asc]);

  const setStatMin = (k: StatFilterKey, v: number) =>
    setStatMins((m) => ({ ...m, [k]: Math.max(0, v) }));
  const anyStatMin = STAT_FILTER_KEYS.some((k) => (statMins[k] ?? 0) > 0);

  const toggleType = (tp: string) =>
    setSelTypes((cur) => (cur.includes(tp) ? cur.filter((x) => x !== tp) : cur.length >= 2 ? cur : [...cur, tp]));

  const addMove = (id: string) => {
    if (id && !selMoves.includes(id)) setSelMoves((m) => [...m, id]);
    setMovePick('');
  };
  const removeMove = (id: string) => setSelMoves((m) => m.filter((x) => x !== id));

  const clearAll = () => {
    setQuery(''); setSelTypes([]); setSelMoves([]); setAbility(''); setMegaFilter('any');
    setStatMins({});
  };
  const anyFilter = query || selTypes.length || selMoves.length || ability || megaFilter !== 'any' || anyStatMin;

  const moveLabel = (id: string) => localizeName('moves', data.moveNames[id] ?? id, lang);
  const abilityLabel = (a: string) => localizeName('abilities', a, lang);

  // Los Pokémon que permanecen tras filtrar se deslizan a su nueva posición.
  const gridRef = useFlip<HTMLDivElement>(results);

  // Megas y learnset del Pokémon abierto en el detalle.
  const detailMegas = useMemo(
    () => (selected ? data.species.filter((m) => m.isMega && m.baseSpeciesId === selected.id) : []),
    [selected, data]
  );

  return (
    <div className="page-enter">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">{t('Pokédex del formato')}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {t('Filtra los Pokémon de Champions por movimientos, tipos, habilidad o estadísticas.')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        {/* Panel de filtros */}
        <div className="panel p-4 flex flex-col gap-4 lg:sticky lg:top-20">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('Nombre')}</label>
            <input className="input-field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Buscar Pokémon...')} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Movimientos que aprende')}
            </label>
            <MoveSearch
              moves={data.moves}
              names={data.moveNames}
              value={movePick}
              onPick={addMove}
              lang={lang}
              placeholder={t('Añadir movimiento...')}
            />
            {selMoves.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selMoves.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => removeMove(id)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-poke-pink/20 border border-poke-pink/50 text-poke-pink hover:bg-poke-pink/30 transition-colors"
                  >
                    {moveLabel(id)} <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Tipos')}</label>
            <div className="flex flex-wrap gap-1">
              {TYPE_NAMES.map((tp) => {
                const on = selTypes.includes(tp);
                return (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => toggleType(tp)}
                    className={`type-${tp.toLowerCase()} px-2 py-0.5 rounded text-[11px] font-medium transition-all ${on ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-90'}`}
                  >
                    {t(tp)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('Habilidad')}</label>
            <Combobox
              items={data.abilities}
              value={ability}
              getLabel={abilityLabel}
              onPick={setAbility}
              placeholder={t('Cualquiera')}
              clearable
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Megaevolución')}</label>
            <SegmentedControl
              value={megaFilter}
              onChange={setMegaFilter}
              options={[
                { value: 'any', label: t('Cualquiera') },
                { value: 'yes', label: t('Con mega') },
                { value: 'no', label: t('Sin mega') },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Estadística mínima')}</label>
            <div className="flex flex-col gap-1.5">
              {STAT_FILTER_KEYS.map((k) => {
                const max = k === 'bst' ? 720 : STAT_MAX;
                const label = k === 'bst' ? 'BST' : t(STAT_LABEL[k]);
                const val = statMins[k] ?? 0;
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className={`w-12 shrink-0 text-[11px] ${val > 0 ? 'text-poke-pink font-semibold' : 'text-gray-300'}`}>{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={max}
                      step={5}
                      value={val}
                      onChange={(e) => setStatMin(k, Number(e.target.value))}
                      className="range-poke flex-1 min-w-0"
                      style={{ '--range-pct': `${(val / max) * 100}%` } as CSSProperties}
                    />
                    <input
                      type="number"
                      min={0}
                      max={max}
                      value={val || ''}
                      placeholder="0"
                      onChange={(e) => setStatMin(k, Math.min(max, Number(e.target.value) || 0))}
                      className="no-spinner w-14 shrink-0 px-2 py-1 bg-poke-dark border border-poke-accent rounded-lg text-white text-xs text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-poke-pink/50"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {anyFilter ? (
            <button type="button" onClick={clearAll} className="btn-secondary text-sm border border-transparent">
              {t('Limpiar filtros')}
            </button>
          ) : null}
        </div>

        {/* Resultados */}
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm text-gray-400">{results.length} {t('Pokémon')}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <label className="text-xs text-gray-400">{t('Ordenar por')}</label>
              <Dropdown
                value={sort}
                options={['num', 'name', ...STAT_KEYS, 'bst']}
                render={(v) => (v === 'num' ? t('Número') : v === 'bst' ? t('Total (BST)') : v === 'name' ? t('Nombre') : t(STAT_LABEL[v as StatKey]))}
                onChange={(v) => setSort(v as SortKey)}
                className="w-40"
                expand
              />
              <button
                type="button"
                onClick={() => setAsc((v) => !v)}
                className="shrink-0 p-2 rounded-lg border border-poke-accent text-poke-pink hover:bg-poke-accent/40 transition-colors"
                title={asc ? t('Ascendente') : t('Descendente')}
                aria-label={asc ? t('Ascendente') : t('Descendente')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {asc ? (
                    <>
                      <path d="M4 6h7" />
                      <path d="M4 12h7" />
                      <path d="M4 18h9" />
                      <path d="M15 9l3 -3l3 3" />
                      <path d="M18 6v12" />
                    </>
                  ) : (
                    <>
                      <path d="M4 6h9" />
                      <path d="M4 12h7" />
                      <path d="M4 18h7" />
                      <path d="M15 15l3 3l3 -3" />
                      <path d="M18 6v12" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="panel p-10 text-center text-gray-400">{t('Ningún Pokémon coincide con los filtros.')}</div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {results.map((s) => (
                <div
                  key={s.id}
                  data-flip-id={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s); } }}
                  className="panel p-3 flex items-center gap-3 group cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:border-poke-pink/50 hover:shadow-poke-pink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink/60"
                >
                  <PokemonSprite speciesId={s.id} skeleton className="w-14 h-14 object-contain shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3" alt={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white truncate">{s.name}</span>
                      <span className="text-[10px] text-gray-500">#{s.num}</span>
                      {megaBaseIds.has(s.id) && (
                        <span className="mega-badge ml-auto shrink-0 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-gradient-to-r from-poke-pink to-purple-500 text-white">
                          MEGA
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {s.types.map((tp) => (
                        <span key={tp} className={`type-${tp.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{t(tp)}</span>
                      ))}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {s.abilities.map(abilityLabel).join(' · ')}
                    </div>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {STAT_KEYS.map((k, i) => <StatBar key={k} label={t(STAT_LABEL[k])} value={s.baseStats[k]} animate delay={i * 40} />)}
                    </div>
                    <div className="text-[10px] mt-1 text-right">
                      <span className="text-gray-500">BST</span> <span className="text-poke-pink font-semibold">{bst(s)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle del Pokémon */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} widthClass="max-w-lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start gap-4 animate-fade-in-up">
              <PokemonSprite speciesId={selected.id} skeleton className="w-24 h-24 object-contain shrink-0" alt={selected.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">#{selected.num}</span>
                  {selected.types.map((tp) => (
                    <span key={tp} className={`type-${tp.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>{t(tp)}</span>
                  ))}
                  {megaBaseIds.has(selected.id) && (
                    <span className="mega-badge text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-gradient-to-r from-poke-pink to-purple-500 text-white">MEGA</span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('Habilidad')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.abilities.map((a) => (
                      <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-poke-accent/40 border border-poke-accent text-gray-100">{abilityLabel(a)}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-up" style={{ animationDelay: '70ms' }}>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Estadísticas')}</div>
              <div className="flex flex-col gap-1">
                {STAT_KEYS.map((k, i) => <CountUpStatBar key={k} label={t(STAT_LABEL[k])} value={selected.baseStats[k]} delay={i * 50} />)}
                <div className="flex items-center gap-2 mt-0.5 pt-1 border-t border-poke-accent/30">
                  <span className="w-10 shrink-0 text-[10px] font-semibold text-gray-300">BST</span>
                  <span className="w-7 shrink-0 text-[10px] text-right tabular-nums text-poke-pink font-semibold"><CountUp value={bst(selected)} /></span>
                </div>
              </div>
            </div>

            {detailMegas.length > 0 && (
              <div className="animate-fade-in-up" style={{ animationDelay: '140ms' }}>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Megaevolución')}</div>
                <div className="space-y-2">
                  {detailMegas.map((m) => (
                    <div key={m.id} className="rounded-lg border border-poke-accent/40 bg-poke-dark/20 p-3">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-white text-sm">{m.name}</span>
                        {m.types.map((tp) => (
                          <span key={tp} className={`type-${tp.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{t(tp)}</span>
                        ))}
                        <span className="ml-auto text-[10px] text-gray-400">
                          <span className="text-gray-500">BST</span> <span className="text-poke-pink font-semibold"><CountUp value={bst(m)} /></span>
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {STAT_KEYS.map((k, i) => <CountUpStatBar key={k} label={t(STAT_LABEL[k])} value={m.baseStats[k]} delay={i * 50} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
