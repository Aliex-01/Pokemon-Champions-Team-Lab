import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { getSpecies, getSpeciesByName, localizeName } from '../lib/championsData';
import { formatNatureLabel } from '../lib/stats';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { PokemonSprite, ItemSprite } from '../components/PokemonSprite';
import { useLang } from '../lib/i18n';
import type { ChampionsData, MetaBuildsData, EvSpread, MetaBuildEntry } from '../types/pokemon';

interface BuildsViewProps {
  data: ChampionsData;
}

function parseSpread(evs: string): EvSpread {
  const [hp, atk, def, spa, spd, spe] = evs.split('/').map((n) => parseInt(n, 10) || 0);
  return { hp, atk, def, spa, spd, spe };
}


export function BuildsView({ data }: BuildsViewProps) {
  const { activeTeam, updatePokemon } = useTeam();
  const { t, lang } = useLang();
  const [builds, setBuilds] = useState<MetaBuildsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  // Cambia en cada "Aplicar" para relanzar el destello verde y el confeti.
  const [applyKey, setApplyKey] = useState(0);

  // Selección del usuario por apartado.
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const [selAbility, setSelAbility] = useState('');
  const [selItem, setSelItem] = useState('');
  const [selNature, setSelNature] = useState('');
  const [selEvs, setSelEvs] = useState('');
  const [selMoves, setSelMoves] = useState<string[]>([]);

  useEffect(() => {
    loadMetaBuilds().then((b) => { setBuilds(b); setLoading(false); });
  }, []);

  const moveIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, name] of Object.entries(data.moveNames ?? {})) {
      m.set(name.toLowerCase().replace(/[^a-z0-9]/g, ''), id);
    }
    return m;
  }, [data]);

  const moveTooltip = (name: string) => {
    const id = moveIdByName.get(name.toLowerCase().replace(/[^a-z0-9]/g, '')) ?? '';
    const md = data.moveData?.[id];
    if (!md) return null;
    const cat = md.category === 'Physical' ? 'Físico' : md.category === 'Special' ? 'Especial' : 'Estado';
    const catBg = md.category === 'Physical' ? 'bg-red-600' : md.category === 'Special' ? 'bg-blue-600' : 'bg-gray-500';
    return (
      <div className="w-56 p-2 rounded-lg bg-poke-panel border border-poke-accent shadow-xl text-xs">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`type-${md.type.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{md.type}</span>
          <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-medium ${catBg}`}>{cat}</span>
        </div>
        <div className="text-gray-400">
          Pot: {md.power > 0 ? md.power : '—'} · Prec: {md.accuracy != null ? `${md.accuracy}%` : '—'} · PP: {md.pp}
        </div>
        {md.desc && <div className="text-gray-300 mt-1">{md.desc}</div>}
      </div>
    );
  };

  // Rango de uso (#N) de cada Pokémon en el meta.
  const rankById = useMemo(() => {
    const m = new Map<string, number>();
    if (builds) {
      Object.entries(builds.pokemon)
        .sort((a, b) => b[1].usage - a[1].usage)
        .forEach(([id], i) => m.set(id, i + 1));
    }
    return m;
  }, [builds]);


  const buildIdFor = (speciesId: string): string | null => {
    if (!builds) return null;
    if (builds.pokemon[speciesId]) return speciesId;
    const sp = getSpecies(speciesId);
    if (sp?.baseSpeciesId && builds.pokemon[sp.baseSpeciesId]) return sp.baseSpeciesId;
    return null;
  };

  const slotMon = selectedSlot != null ? activeTeam?.pokemon[selectedSlot] : null;
  const buildId = slotMon?.speciesId ? buildIdFor(slotMon.speciesId) : null;
  const build = buildId && builds ? builds.pokemon[buildId] : null;

  // Al cambiar de Pokémon, inicializa la selección con lo más usado (durante el render).
  const key = selectedSlot != null && buildId ? `${selectedSlot}-${buildId}` : null;
  if (build && key !== prevKey) {
    setPrevKey(key);
    setSelAbility(build.abilities[0]?.name ?? '');
    setSelItem(build.items[0]?.name ?? '');
    setSelNature(build.spreads[0]?.nature ?? build.natures[0]?.name ?? '');
    setSelEvs(build.spreads[0]?.evs ?? '');
    setSelMoves(build.moves.slice(0, 4).map((mv) => mv.name));
  }

  const toggleMove = (name: string) =>
    setSelMoves((cur) =>
      cur.includes(name) ? cur.filter((n) => n !== name) : cur.length < 4 ? [...cur, name] : cur
    );

  const applySelection = (slot: number) => {
    const moves = selMoves.map((name) => {
      const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return moveIdByName.get(norm) ?? norm;
    });
    while (moves.length < 4) moves.push('');
    updatePokemon(slot, {
      ability: selAbility || slotMon?.ability || '',
      item: selItem && selItem !== 'Sin objeto' ? selItem : '',
      nature: selNature || slotMon?.nature || 'Docile',
      evMode: 'champions',
      evs: selEvs ? parseSpread(selEvs) : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moves: moves.slice(0, 4) as [string, string, string, string],
    });
    // Confirmación visual: destello verde en el panel + mini-confeti.
    setApplyKey((k) => k + 1);
  };

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Builds Meta')}</h2>
        {builds && !builds.format.includes('regmb') && (
          <p className="text-xs text-amber-400 mt-1">{t('Reg M-B aún no publicada en Smogon: mostrando Reg M-A.')}</p>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">{t('Cargando estadísticas…')}</p>
      ) : !builds ? (
        <div className="panel p-4 text-gray-400">
          {t('No hay datos de builds. Ejecuta')} <code className="text-poke-pink">npm run generate-data</code>.
        </div>
      ) : !activeTeam ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            {activeTeam.pokemon.map((p, i) =>
              p.speciesId ? (
                <button
                  key={p.slotId}
                  type="button"
                  onClick={() => setSelectedSlot(i)}
                  className={`panel p-2 flex flex-col items-center gap-1 transition-all active:scale-[0.98] hover:-translate-y-0.5 ${
                    selectedSlot === i
                      ? 'border-poke-pink ring-2 ring-poke-pink/60 shadow-lg shadow-poke-pink/20'
                      : 'hover:border-poke-pink/50'
                  }`}
                >
                  <PokemonSprite speciesId={p.speciesId} className="w-14 h-14 object-contain" />
                  <span className="text-xs font-medium text-center truncate w-full">{p.speciesName}</span>
                </button>
              ) : (
                <div
                  key={p.slotId}
                  className="panel p-2 flex flex-col items-center justify-center border-dashed opacity-50 text-gray-500 text-xs text-center min-h-[5.5rem]"
                >
                  {t('Vacío')}
                </div>
              )
            )}
          </div>

          {selectedSlot == null ? (
            <p className="text-gray-400 text-center py-12">{t('Selecciona un Pokémon de tu equipo para ver y elegir su build')}</p>
          ) : !slotMon?.speciesId ? (
            <p className="text-gray-400 text-center py-12">{t('Ese hueco está vacío')}</p>
          ) : !build ? (
            <div className="panel p-4 text-gray-400">{t('Sin datos de uso para')} {slotMon.speciesName} {t('en este formato.')}</div>
          ) : (
            <div className="panel p-4 relative">
              {applyKey > 0 && (
                <div key={`flash-${applyKey}`} className="green-flash pointer-events-none absolute inset-0 rounded-xl" />
              )}
              <div className="flex items-center gap-3 mb-3">
                <PokemonSprite speciesId={slotMon.speciesId} className="w-16 h-16 object-contain" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold truncate">{slotMon.speciesName}</h3>
                  <p className="text-poke-pink text-sm">
                    {buildId && rankById.has(buildId) && <span className="text-gray-400">#{rankById.get(buildId)} · </span>}
                    {build.usage}% {t('de uso')}
                  </p>
                </div>
                <button type="button" className="btn-primary text-sm" onClick={() => applySelection(selectedSlot)}>
                  {t('Aplicar selección')}
                </button>
              </div>
              <div key={selectedSlot} className="grid sm:grid-cols-2 gap-x-6 gap-y-4 rounded-lg">
                <PickSection title={t('Habilidad')} items={build.abilities} isSelected={(n) => n === selAbility} onPick={setSelAbility} label={(n) => localizeName('abilities', n, lang)} delay={0} />
                <PickSection
                  title={t('Objeto')}
                  items={build.items}
                  isSelected={(n) => n === selItem}
                  onPick={setSelItem}
                  icon={(n) => <ItemSprite item={n} size={18} />}
                  label={(n) => localizeName('items', n, lang)}
                  delay={60}
                />
                <PickSection title={t('Naturaleza')} items={build.natures} isSelected={(n) => n === selNature} onPick={setSelNature} label={(n) => formatNatureLabel(n, localizeName('natures', n, lang))} delay={120} />
                <PickSection
                  title={`${t('Movimientos')} (${selMoves.length}/4)`}
                  items={build.moves}
                  isSelected={(n) => selMoves.includes(n)}
                  onPick={toggleMove}
                  tooltip={moveTooltip}
                  label={(n) => localizeName('moves', n, lang)}
                  delay={180}
                />
                {build.spreads.length > 0 && (
                  <div className="rounded-lg border border-poke-accent/40 bg-poke-dark/20 p-3 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
                    <h4 className="font-semibold mb-2 text-gray-200 text-lg text-center">{t('Spread (EVs en stat points)')}</h4>
                    <ul className="space-y-1">
                      {build.spreads.map((s, i) => {
                        const sel = s.nature === selNature && s.evs === selEvs;
                        return (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => { setSelNature(s.nature); setSelEvs(s.evs); }}
                              className={`w-full flex justify-between items-center gap-2 px-2 py-1 rounded text-base ${
                                sel ? 'bg-poke-pink/20 ring-1 ring-poke-pink/40' : 'hover:bg-poke-accent/30'
                              }`}
                            >
                              <span className="truncate">{localizeName('natures', s.nature, lang)} · {s.evs}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-20 h-2 bg-poke-dark rounded-full overflow-hidden">
                                  <div className="h-full bg-poke-pink rounded-full grow-x" style={{ width: `${Math.min(100, s.pct)}%` }} />
                                </div>
                                <span className="text-poke-pink w-12 text-right font-mono text-sm">{s.pct}%</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <PickSection
                  title={t('Compañeros (info)')}
                  items={build.teammates}
                  isSelected={() => false}
                  onPick={() => {}}
                  delay={300}
                  icon={(n) => {
                    const sp = getSpeciesByName(n);
                    return sp ? <PokemonSprite speciesId={sp.id} className="w-6 h-6 object-contain" /> : null;
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PickSection({
  title,
  items,
  isSelected,
  onPick,
  icon,
  label,
  tooltip,
  delay = 0,
}: {
  title: string;
  items: MetaBuildEntry[];
  isSelected: (name: string) => boolean;
  onPick: (name: string) => void;
  icon?: (name: string) => React.ReactNode;
  label?: (name: string) => React.ReactNode;
  tooltip?: (name: string) => React.ReactNode;
  delay?: number;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-poke-accent/40 bg-poke-dark/20 p-3 animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <h4 className="font-semibold mb-2 text-gray-200 text-lg text-center">{title}</h4>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.name} className="relative group">
            {tooltip && (
              <div className="hidden group-hover:block absolute z-30 left-2 top-full mt-0.5 pointer-events-none">
                {tooltip(item.name)}
              </div>
            )}
            <button
              type="button"
              onClick={() => onPick(item.name)}
              className={`w-full flex justify-between items-center gap-2 px-2 py-1 rounded text-base transition-colors ${
                isSelected(item.name) ? 'bg-poke-pink/20 ring-1 ring-poke-pink/40' : 'hover:bg-poke-accent/30'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {icon?.(item.name)}
                {label ? label(item.name) : <span className="truncate">{item.name}</span>}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-20 h-2 bg-poke-dark rounded-full overflow-hidden">
                  <div className="h-full bg-poke-pink rounded-full grow-x" style={{ width: `${Math.min(100, item.pct)}%` }} />
                </div>
                <span className="text-poke-pink w-12 text-right font-mono text-sm">{item.pct}%</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
