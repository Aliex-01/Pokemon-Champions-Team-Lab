import { memo, useEffect, useMemo, useState } from 'react';
import { getLearnset, localizeName, localizeMoveDesc, localizeAbilityDesc } from '../lib/championsData';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { useTeam } from '../store/teamStore';
import { PokemonSprite, ItemSprite } from '../components/PokemonSprite';
import { MoveSearch } from '../components/MoveSearch';
import { Combobox } from '../components/Combobox';
import { Dropdown } from '../components/Dropdown';
import { SegmentedControl } from '../components/SegmentedControl';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { Toast } from '../components/Toast';
import { useFlip } from '../lib/useFlip';
import { useLang } from '../lib/i18n';
import { TYPE_NAMES, getTypeEffectiveness } from '../lib/typeChart';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABEL = {
  hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtaEsp', spd: 'DefEsp', spe: 'Vel',
};
const STAT_FILTER_KEYS = [...STAT_KEYS, 'bst'];

const bst = (s) => STAT_KEYS.reduce((a, k) => a + s.baseStats[k], 0);

// Tope visual de una estadística individual para la barra (200+ = llena).
const STAT_MAX = 200;
function statColor(v) {
  if (v >= 130) return 'bg-emerald-400';
  if (v >= 100) return 'bg-green-400';
  if (v >= 80) return 'bg-lime-400';
  if (v >= 60) return 'bg-yellow-400';
  if (v >= 40) return 'bg-orange-400';
  return 'bg-red-400';
}

/** Barra de estadística con etiqueta, valor y relleno coloreado por valor. */
function StatBar({ label, value, displayValue, animate, delay }) {
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
function useCountUp(target, active, duration = 650) {
  const [val, setVal] = useState(() => (active ? 0 : target));
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
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
function CountUpStatBar({ label, value, delay }) {
  const shown = useCountUp(value, true);
  return <StatBar label={label} value={value} displayValue={shown} animate delay={delay} />;
}

/** Número suelto que cuenta de 0 a su valor al aparecer. */
function CountUp({ value }) {
  return <>{useCountUp(value, true)}</>;
}

const CATEGORY_STYLE = {
  Physical: 'bg-red-600 text-white',
  Special: 'bg-blue-600 text-white',
  Status: 'bg-gray-500 text-white',
};
const CATEGORY_LABEL = {
  Physical: 'Físico', Special: 'Especial', Status: 'Estado',
};

/** Debilidades, resistencias e inmunidades defensivas de un conjunto de tipos. */
function TypeMatchups({ types, typeChart }) {
  const { t } = useLang();
  const groups = useMemo(() => {
    const x4 = [], x2 = [], xHalf = [], xQuarter = [], x0 = [];
    for (const atk of TYPE_NAMES) {
      const m = getTypeEffectiveness(atk, types, typeChart);
      if (m === 4) x4.push(atk);
      else if (m === 2) x2.push(atk);
      else if (m === 0.5) xHalf.push(atk);
      else if (m === 0.25) xQuarter.push(atk);
      else if (m === 0) x0.push(atk);
    }
    return [
      { label: '×4', cls: 'text-red-400', list: x4 },
      { label: '×2', cls: 'text-orange-400', list: x2 },
      { label: '×½', cls: 'text-green-400', list: xHalf },
      { label: '×¼', cls: 'text-emerald-400', list: xQuarter },
      { label: '×0', cls: 'text-sky-400', list: x0 },
    ].filter((g) => g.list.length > 0);
  }, [types, typeChart]);

  if (groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.label} className="flex items-start gap-2">
          <span className={`w-7 shrink-0 text-xs font-mono font-bold pt-0.5 ${g.cls}`}>{g.label}</span>
          <div className="flex flex-wrap gap-1">
            {g.list.map((tp) => (
              <span key={tp} className={`type-${tp.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>
                {t(tp)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card del grid, memoizada: no se re-renderiza al teclear en el buscador.
 *  `cv-card` salta su render cuando está fuera de pantalla. */
const PokedexCard = memo(function PokedexCard({ s, isMega, usage, onSelect }) {
  const { t, lang } = useLang();
  const abilityLabel = (a) => localizeName('abilities', a, lang);
  return (
    <div
      data-flip-id={s.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(s)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s); } }}
      className="cv-card panel p-3 flex items-center gap-3 group cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:border-poke-pink/50 hover:shadow-poke-pink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink/60"
    >
      <PokemonSprite speciesId={s.id} skeleton className="w-14 h-14 object-contain shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3" alt={s.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white truncate">{s.name}</span>
          <span className="text-[10px] text-gray-500">#{s.num}</span>
          {isMega && (
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
        <div className="text-[10px] mt-1 flex items-center justify-between">
          {usage > 0 ? (
            <span className="text-gray-400 font-mono">
              {t('Uso')} <span className="text-poke-pink font-semibold">{usage.toFixed(1)}%</span>
            </span>
          ) : <span />}
          <span>
            <span className="text-gray-500">BST</span> <span className="text-poke-pink font-semibold">{bst(s)}</span>
          </span>
        </div>
      </div>
    </div>
  );
});

export function PokedexView({ data }) {
  const { t, lang } = useLang();
  const { activeTeam, updatePokemon } = useTeam();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selTypes, setSelTypes] = useState([]);
  const [selMoves, setSelMoves] = useState([]);
  const [movePick, setMovePick] = useState('');
  const [ability, setAbility] = useState('');
  const [megaFilter, setMegaFilter] = useState('any');
  const [statMins, setStatMins] = useState({});
  const [sort, setSort] = useState('num');
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState(null);
  const [builds, setBuilds] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastTone, setToastTone] = useState('success');

  useEffect(() => {
    loadMetaBuilds().then((b) => { if (b) setBuilds(b); });
  }, []);

  // Debounce de la búsqueda: evita recalcular y re-medir el FLIP en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  // % de uso en Smogon por especie base (máximo entre forma base y sus megas).
  const usageByBaseId = useMemo(() => {
    const m = new Map();
    if (!builds?.pokemon) return m;
    for (const s of data.species) {
      const u = builds.pokemon[s.id]?.usage ?? 0;
      if (u <= 0) continue;
      const key = s.isMega && s.baseSpeciesId ? s.baseSpeciesId : s.id;
      m.set(key, Math.max(m.get(key) ?? 0, u));
    }
    return m;
  }, [builds, data.species]);

  const addSpeciesToTeam = (sp) => {
    if (!activeTeam) return;
    const emptyIdx = activeTeam.pokemon.findIndex((p) => !p.speciesId);
    if (emptyIdx < 0) {
      setToastTone('error');
      setToastMsg(t('Tu equipo activo está lleno (6/6).'));
      return;
    }
    const updates = {
      speciesId: sp.id,
      speciesName: sp.name,
      ability: sp.abilities?.[0] ?? '',
      item: sp.isMega ? (sp.megaStone ?? '') : '',
      preMegaAbility: sp.isMega ? (sp.baseAbilities?.[0] ?? '') : undefined,
      moves: ['', '', '', ''],
      level: 50,
    };
    updatePokemon(emptyIdx, updates);
    setToastTone('success');
    setToastMsg(`${sp.name} → Slot ${emptyIdx + 1}`);
  };

  // Ids de especie base que tienen al menos una megaevolución en el formato.
  const megaBaseIds = useMemo(() => {
    const toId = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const set = new Set();
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

  // Learnset por especie en un Set. Solo se construye cuando hay filtro de
  // movimientos activo (evita crear ~240 Sets al montar sin necesidad).
  const filteringMoves = selMoves.length > 0;
  const learnsetSets = useMemo(() => {
    if (!filteringMoves) return null;
    const m = new Map();
    for (const s of baseSpecies) m.set(s.id, new Set(getLearnset(s.id, data)));
    return m;
  }, [baseSpecies, data, filteringMoves]);

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
        const ls = learnsetSets?.get(s.id);
        if (!ls || !selMoves.every((mid) => ls.has(mid))) return false;
      }
      return true;
    });
    const cmp = (a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'num') return a.num - b.num;
      if (sort === 'usage') return (usageByBaseId.get(a.id) ?? 0) - (usageByBaseId.get(b.id) ?? 0);
      const va = sort === 'bst' ? bst(a) : a.baseStats[sort];
      const vb = sort === 'bst' ? bst(b) : b.baseStats[sort];
      return va - vb;
    };
    list.sort((a, b) => (asc ? cmp(a, b) : -cmp(a, b)));
    return list;
  }, [baseSpecies, debouncedQuery, selTypes, ability, selMoves, learnsetSets, megaFilter, megaBaseIds, statMins, sort, asc, usageByBaseId]);

  const setStatMin = (k, v) =>
    setStatMins((m) => ({ ...m, [k]: Math.max(0, v) }));
  const anyStatMin = STAT_FILTER_KEYS.some((k) => (statMins[k] ?? 0) > 0);

  const toggleType = (tp) =>
    setSelTypes((cur) => (cur.includes(tp) ? cur.filter((x) => x !== tp) : cur.length >= 2 ? cur : [...cur, tp]));

  const addMove = (id) => {
    if (id && !selMoves.includes(id)) setSelMoves((m) => [...m, id]);
    setMovePick('');
  };
  const removeMove = (id) => setSelMoves((m) => m.filter((x) => x !== id));

  const clearAll = () => {
    setQuery(''); setSelTypes([]); setSelMoves([]); setAbility(''); setMegaFilter('any');
    setStatMins({});
  };
  const anyFilter = query || selTypes.length || selMoves.length || ability || megaFilter !== 'any' || anyStatMin;

  const moveLabel = (id) => localizeName('moves', data.moveNames[id] ?? id, lang);
  const abilityLabel = (a) => localizeName('abilities', a, lang);

  // Los Pokémon que permanecen tras filtrar se deslizan a su nueva posición.
  // Solo con listas pequeñas: medir cientos de cards en cada cambio sería caro.
  const gridRef = useFlip(results, results.length <= 60);

  // Megas y learnset del Pokémon abierto en el detalle.
  const detailMegas = useMemo(
    () => (selected ? data.species.filter((m) => m.isMega && m.baseSpeciesId === selected.id) : []),
    [selected, data]
  );

  const detailMoves = useMemo(
    () => (selected ? getLearnset(selected.id, data) : []),
    [selected, data]
  );

  const openDetail = (sp) => setSelected(sp);

  return (
    <div className="page-enter">
      <div className="mb-5">
        <h1 className="flex items-center gap-1.5 text-2xl font-bold text-white">
          {t('Pokédex del formato')}
          <InfoTooltip side="bottom" label={t('Más información')}>
            {lang === 'en'
              ? 'Browse every Pokémon legal in the format. Filter by name, type, ability, moves and minimum base stats, then click a card to see its full details (stats, abilities and mega evolutions).'
              : 'Explora todos los Pokémon legales del formato. Filtra por nombre, tipo, habilidad, movimientos y estadísticas base mínimas, y haz clic en una card para ver su detalle completo (stats, habilidades y megaevoluciones).'}
          </InfoTooltip>
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        {/* Panel de filtros */}
        <div className="panel p-4 flex flex-col gap-4 lg:sticky lg:top-20">
          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {t('Nombre')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Search by name (English or Spanish). Matches any part of the name, so partial text works too.'
                  : 'Busca por nombre (en inglés o español). Coincide con cualquier parte del nombre, así que también vale texto parcial.'}
              </InfoTooltip>
            </label>
            <input className="input-field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Buscar Pokémon...')} />
          </div>

          <div>
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Movimientos que aprende')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Show only Pokémon that can learn all the selected moves. Add several to narrow the roster to those that learn every one.'
                  : 'Muestra solo los Pokémon que pueden aprender todos los movimientos seleccionados. Añade varios para acotar el roster a los que los aprenden todos.'}
              </InfoTooltip>
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
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Tipos')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Filter by type. Select one or more; a Pokémon matches if it has any of the selected types.'
                  : 'Filtra por tipo. Selecciona uno o varios; un Pokémon coincide si tiene alguno de los tipos seleccionados.'}
              </InfoTooltip>
            </label>
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
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              {t('Habilidad')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Show only Pokémon that can have the chosen ability (including hidden abilities).'
                  : 'Muestra solo los Pokémon que pueden tener la habilidad elegida (incluidas las habilidades ocultas).'}
              </InfoTooltip>
            </label>
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
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Megaevolución')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Filter by mega evolution: only Pokémon that have a mega in the format, only those without one, or any.'
                  : 'Filtra por megaevolución: solo Pokémon que tienen mega en el formato, solo los que no la tienen, o cualquiera.'}
              </InfoTooltip>
            </label>
            <SegmentedControl
              fluid
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
            <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('Estadística mínima')}
              <InfoTooltip label={t('Más información')}>
                {lang === 'en'
                  ? 'Filters the roster by base stat: only Pokémon whose base value for each stat is at least the set minimum are shown (BST is the sum of all base stats).'
                  : 'Filtra el roster por estadística base: solo se muestran los Pokémon cuyo valor base de cada estadística alcanza el mínimo indicado (BST es la suma de todas las estadísticas base).'}
              </InfoTooltip>
            </label>
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
                      style={{ '--range-pct': `${(val / max) * 100}%` }}
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
                options={['num', 'usage', 'name', ...STAT_KEYS, 'bst']}
                render={(v) => (v === 'num' ? t('Número') : v === 'usage' ? t('Uso (Smogon)') : v === 'bst' ? t('Total (BST)') : v === 'name' ? t('Nombre') : t(STAT_LABEL[v]))}
                onChange={(v) => {
                  setSort(v);
                  if (v === 'usage' || v === 'bst' || STAT_KEYS.includes(v)) setAsc(false);
                  else setAsc(true);
                }}
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
                <PokedexCard
                  key={s.id}
                  s={s}
                  isMega={megaBaseIds.has(s.id)}
                  usage={usageByBaseId.get(s.id) ?? 0}
                  onSelect={openDetail}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle del Pokémon */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} widthClass="max-w-2xl">
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
                  {(builds?.pokemon?.[selected.id]?.usage ?? 0) > 0 && (
                    <span className="text-xs font-mono text-poke-pink">
                      {builds.pokemon[selected.id].usage.toFixed(1)}% {t('de uso')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => addSpeciesToTeam(selected)}
                    className="ml-auto btn-primary text-xs px-3 py-1.5"
                  >
                    + {t('Añadir al equipo')}
                  </button>
                </div>
                <div className="mt-2.5">
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('Habilidades')}</div>
                  <div className="space-y-1.5">
                    {selected.abilities.map((a) => {
                      const desc = localizeAbilityDesc(a, lang);
                      return (
                        <div key={a} className="text-xs">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-poke-accent/40 border border-poke-accent text-gray-100 font-medium mr-1.5">
                            {abilityLabel(a)}
                          </span>
                          {desc && <span className="text-gray-400">{desc}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '70ms' }}>
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Estadísticas')}</div>
                <div className="flex flex-col gap-1">
                  {STAT_KEYS.map((k, i) => <CountUpStatBar key={k} label={t(STAT_LABEL[k])} value={selected.baseStats[k]} delay={i * 50} />)}
                  <div className="flex items-center gap-2 mt-0.5 pt-1 border-t border-poke-accent/30">
                    <span className="w-10 shrink-0 text-[10px] font-semibold text-gray-300">BST</span>
                    <span className="w-7 shrink-0 text-[10px] text-right tabular-nums text-poke-pink font-semibold"><CountUp value={bst(selected)} /></span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Debilidades y resistencias')}</div>
                <TypeMatchups types={selected.types} typeChart={data.typeChart} />
              </div>
            </div>

            {detailMegas.length > 0 && (
              <div className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t('Megaevolución')}</div>
                <div className="space-y-2.5">
                  {detailMegas.map((m) => {
                    const megaUsage = builds?.pokemon?.[m.id]?.usage ?? 0;
                    const typesChanged = m.types.join('/') !== selected.types.join('/');
                    return (
                      <div key={m.id} className="rounded-lg border border-poke-accent/40 bg-poke-dark/25 p-3 space-y-2.5">
                        <div className="flex items-start gap-3">
                          <PokemonSprite speciesId={m.id} skeleton className="w-16 h-16 object-contain shrink-0" alt={m.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-white text-sm">{m.name}</span>
                              {m.types.map((tp) => (
                                <span key={tp} className={`type-${tp.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{t(tp)}</span>
                              ))}
                              {megaUsage > 0 && (
                                <span className="text-[11px] font-mono text-poke-pink">{megaUsage.toFixed(1)}%</span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                <span className="text-gray-500">BST</span> <span className="text-poke-pink font-semibold"><CountUp value={bst(m)} /></span>
                              </span>
                              <button
                                type="button"
                                onClick={() => addSpeciesToTeam(m)}
                                className="ml-auto btn-secondary text-xs px-2.5 py-1 border border-poke-pink/40 text-poke-pink hover:bg-poke-pink/15"
                              >
                                + {t('Añadir')}
                              </button>
                            </div>
                            {m.megaStone && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-300 mt-1">
                                <ItemSprite item={m.megaStone} size={18} />
                                <span>{localizeName('items', m.megaStone, lang)}</span>
                              </div>
                            )}
                            {m.abilities.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {m.abilities.map((a) => {
                                  const desc = localizeAbilityDesc(a, lang);
                                  return (
                                    <div key={a} className="text-xs">
                                      <span className="inline-block px-2 py-0.5 rounded-full bg-poke-pink/15 border border-poke-pink/40 text-poke-pink font-medium mr-1.5">
                                        {abilityLabel(a)}
                                      </span>
                                      {desc && <span className="text-gray-400">{desc}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={typesChanged ? 'grid sm:grid-cols-2 gap-3' : ''}>
                          <div className="flex flex-col gap-1">
                            {STAT_KEYS.map((k, i) => <CountUpStatBar key={k} label={t(STAT_LABEL[k])} value={m.baseStats[k]} delay={i * 50} />)}
                          </div>
                          {typesChanged && (
                            <div>
                              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('Debilidades y resistencias')}</div>
                              <TypeMatchups types={m.types} typeChart={data.typeChart} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Learnset */}
            <div className="animate-fade-in-up" style={{ animationDelay: '160ms' }}>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t('Movimientos')} ({detailMoves.length})
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-poke-accent/40">
                <table className="w-full text-xs border-collapse">
                  <thead className="text-gray-400 uppercase text-[10px] text-left sticky top-0 bg-poke-panel z-10">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">{t('Nombre')}</th>
                      <th className="px-2 py-1.5 font-semibold">{t('Tipo')}</th>
                      <th className="px-2 py-1.5 font-semibold">{t('Cat.')}</th>
                      <th className="px-2 py-1.5 text-right font-semibold">{t('Pot.')}</th>
                      <th className="px-2 py-1.5 text-right font-semibold">{t('Prec.')}</th>
                      <th className="px-2 py-1.5 font-semibold">{t('Efecto')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailMoves.length === 0 ? (
                      <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-500">{t('Sin movimientos')}</td></tr>
                    ) : (
                      detailMoves.map((id, i) => {
                        const md = data.moveData?.[id];
                        return (
                          <tr key={id} className={`border-t border-poke-accent/20 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                            <td className="px-2 py-1.5 font-medium whitespace-nowrap text-gray-100">{moveLabel(id)}</td>
                            <td className="px-2 py-1.5">
                              {md && <span className={`type-${md.type.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{t(md.type)}</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              {md && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_STYLE[md.category] ?? ''}`}>
                                  {t(CATEGORY_LABEL[md.category] ?? md.category)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{md && md.power > 0 ? md.power : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{md && md.accuracy != null ? `${md.accuracy}%` : '—'}</td>
                            <td className="px-2 py-1.5 text-gray-400 min-w-[10rem]">{localizeMoveDesc(id, md?.desc, lang)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Toast message={toastMsg} onClose={() => setToastMsg('')} tone={toastTone} />
    </div>
  );
}
