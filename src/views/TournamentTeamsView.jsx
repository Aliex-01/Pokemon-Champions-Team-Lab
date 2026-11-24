import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpeciesByName, getSpecies, localizeName } from '../lib/championsData';
import { parseShowdownTeam } from '../lib/showdownImport';
import { createEmptyTeam, createEmptyPokemon } from '../types/pokemon';
import { PokemonSprite, ItemSprite } from '../components/PokemonSprite';
import { Dropdown } from '../components/Dropdown';
import { Modal } from '../components/Modal';
import { InfoTooltip } from '../components/InfoTooltip';
import { Icon } from '../components/Icons';
import { useFlip } from '../lib/useFlip';

// Fecha "12 Jun 2026" → número ordenable (0 si no se reconoce).
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const dateVal = (s) => {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  const mo = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && mo !== undefined ? Date.UTC(Number(m[3]), mo, Number(m[1])) : 0;
};

// Puesto de torneo ("1st", "2nd", "Top 4", "Top 8", "Day 2"…) → número ordenable (menor = mejor).
const rankVal = (s) => {
  if (!s || s === '-') return 9999;
  const low = s.toLowerCase().trim();
  if (low.includes('winner') || low.includes('champion')) return 1;
  if (low.includes('finalist')) return 2;
  const top = low.match(/top\s*(\d+)/);
  if (top) return Number(top[1]);
  const ord = low.match(/(\d+)\s*(st|nd|rd|th)?/);
  if (ord) return Number(ord[1]);
  if (low.includes('day 2') || low.includes('day2')) return 500;
  return 9998;
};

// Normaliza para buscar sin distinguir tildes (é = e) ni mayúsculas.
const noAccents = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const EV_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const EV_LABEL = { hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtaEsp', spd: 'DefEsp', spe: 'Vel' };

// Botón que muestra el código de alquiler y lo copia al portapapeles.
function CodeButton({ code, t }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t('Código de alquiler')}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="btn-secondary text-sm py-1.5 px-3 font-mono"
    >
      {copied ? t('¡Copiado!') : code}
    </button>
  );
}

const PAGE = 24;
// Resuelve el id de especie probando el nombre y, si no casa (formas cosméticas
// tipo «Maushold-Four», «Vivillon-Fancy»…), recortando el sufijo de forma.
const spriteId = (name) => {
  let n = name;
  for (;;) {
    const sp = getSpeciesByName(n);
    if (sp) return sp.id;
    const cut = n.lastIndexOf('-');
    if (cut < 0) return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    n = n.slice(0, cut);
  }
};

function StarIcon({ filled, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
    </svg>
  );
}

const FAVS_KEY = 'champions-tournament-favs';
function loadFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch { /* ignore */ }
  return [];
}

export function TournamentTeamsView({ data }) {
  const { activeTeam, setActiveTeamPokemon, importTeam: importSavedTeam } = useTeam();
  const { t, lang } = useLang();
  const [teams, setTeams] = useState(null);
  const [reg, setReg] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'rank'
  const [onlyCode, setOnlyCode] = useState(false);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [favs, setFavs] = useState(loadFavs);
  const [qPlayer, setQPlayer] = useState('');
  const [qEvent, setQEvent] = useState('');
  const [qMon, setQMon] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [noteErr, setNoteErr] = useState(false);
  const [selected, setSelected] = useState(null);
  // Equipo completo del paste (tipos, movimientos, naturaleza, EVs) y texto raw para copiar Showdown.
  const [detail, setDetail] = useState(null);
  const [rawPaste, setRawPaste] = useState('');
  const [copiedShowdown, setCopiedShowdown] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch { /* ignore */ }
  }, [favs]);

  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFav = (id) => setFavs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  useEffect(() => {
    if (!selected) { setDetail(null); setRawPaste(''); setCopiedShowdown(false); return; }
    let cancelled = false;
    setDetail(null);
    setRawPaste('');
    setCopiedShowdown(false);
    fetch(`https://pokepast.es/${selected.paste}/raw`)
      .then((r) => r.text())
      .then((txt) => {
        if (!cancelled) {
          setRawPaste(txt);
          setDetail(parseShowdownTeam(txt, data));
        }
      })
      .catch(() => { if (!cancelled) setDetail([]); });
    return () => { cancelled = true; };
  }, [selected, data]);

  useEffect(() => {
    fetch('/data/tournament-teams.json').then((r) => r.json()).then((d) => setTeams(d.teams)).catch(() => setTeams([]));
  }, []);

  const regs = useMemo(() => [...new Set((teams ?? []).map((x) => x.reg))], [teams]);

  const filtered = useMemo(() => {
    if (!teams) return [];
    const qp = noAccents(qPlayer).trim();
    const qe = noAccents(qEvent).trim();
    // Soporta varios Pokémon separados por coma para buscar cores (ej. "incineroar, rillaboom").
    const monQueries = qMon.split(',').map((s) => s.toLowerCase().trim()).filter(Boolean);
    return teams
      .filter((tm) => {
        if (reg !== 'all' && tm.reg !== reg) return false;
        if (onlyCode && !tm.code) return false;
        if (onlyFavs && !favSet.has(tm.id)) return false;
        if (qp && !noAccents(tm.player).includes(qp)) return false;
        if (qe && !noAccents(tm.event).includes(qe)) return false;
        if (monQueries.length > 0 && !monQueries.every((qm) => tm.mons.some((m) => m.toLowerCase().includes(qm)))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rank') {
          const diff = rankVal(a.rank) - rankVal(b.rank);
          if (diff !== 0) return diff;
        }
        return dateVal(b.date) - dateVal(a.date);
      });
  }, [teams, reg, sortBy, onlyCode, onlyFavs, favSet, qPlayer, qEvent, qMon]);

  useEffect(() => { setVisible(PAGE); }, [reg, sortBy, onlyCode, onlyFavs, qPlayer, qEvent, qMon]);

  // Memoizado: su referencia solo cambia al filtrar/paginar, no al abrir el modal.
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  // Las filas se deslizan a su nueva posición al filtrar (si no son demasiadas).
  const listRef = useFlip(shown, shown.length <= 60);

  const importTeam = async (tm) => {
    setBusy(tm.id); setNote(null);
    try {
      const res = await fetch(`https://pokepast.es/${tm.paste}/raw`);
      if (!res.ok) throw new Error();
      const pokemon = parseShowdownTeam(await res.text(), data);
      if (pokemon.length === 0) throw new Error();
      const name = `${tm.player}${tm.event && tm.event !== '-' ? ' · ' + tm.event : ''}`.slice(0, 40);
      const activeIsEmpty = activeTeam && !activeTeam.pokemon.some((p) => p.speciesId);
      if (activeIsEmpty) {
        setActiveTeamPokemon(pokemon);
        setNoteErr(false);
        setNote(`${t('Importado en tu equipo:')} ${name}`);
      } else {
        const created = createEmptyTeam(name);
        const filled = pokemon.slice(0, 6).map((p, i) => ({ ...p, slotId: `slot-${i}` }));
        while (filled.length < 6) filled.push(createEmptyPokemon(`slot-${filled.length}`));
        created.pokemon = filled;
        if (tm.reg) created.tags = [`Reg ${tm.reg}`];
        importSavedTeam(created);
        setNoteErr(false);
        setNote(`${t('Importado como equipo nuevo:')} ${name}`);
      }
    } catch {
      setNoteErr(true);
      setNote(t('No se pudo importar este equipo.'));
    } finally { setBusy(null); }
  };

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-2xl font-bold">
          {t('Equipos de torneo')}
          <InfoTooltip side="bottom" label={t('Más información')}>
            {lang === 'en'
              ? 'Real teams used by players in official VGC tournaments (data from VGCPastes). Filter by player, event, Pokémon or regulation, and open a team to see its moves, EVs, rental code and source — or import it into your active team.'
              : 'Equipos reales usados por jugadores en torneos oficiales de VGC (datos de VGCPastes). Filtra por jugador, evento, Pokémon o regulación, y abre un equipo para ver sus movimientos, EVs, código de alquiler y fuente — o impórtalo a tu equipo activo.'}
          </InfoTooltip>
        </h2>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Dropdown
          className="w-32 shrink-0"
          value={reg}
          options={['all', ...regs]}
          render={(r) => (r === 'all' ? t('Todas') : `Reg ${r}`)}
          onChange={(r) => setReg(r)}
        />
        <Dropdown
          className="w-40 shrink-0"
          value={sortBy}
          options={['date', 'rank']}
          render={(s) => (s === 'date' ? t('Más recientes') : t('Mejor resultado'))}
          onChange={(s) => setSortBy(s)}
        />
        <input className="input-field flex-1 min-w-[120px]" value={qPlayer} onChange={(e) => setQPlayer(e.target.value)} placeholder={t('Jugador')} />
        <input className="input-field flex-1 min-w-[120px]" value={qEvent} onChange={(e) => setQEvent(e.target.value)} placeholder={t('Evento')} />
        <input className="input-field flex-1 min-w-[160px]" value={qMon} onChange={(e) => setQMon(e.target.value)} placeholder={t('Pokémon (ej. incineroar, rillaboom)')} />
        <button
          type="button"
          onClick={() => setOnlyCode((v) => !v)}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0 ${
            onlyCode
              ? 'border-poke-pink bg-poke-pink/15 text-poke-pink'
              : 'border-poke-accent bg-poke-dark text-gray-300 hover:bg-poke-accent/40'
          }`}
        >
          {t('Con código')}
        </button>
        <button
          type="button"
          onClick={() => setOnlyFavs((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors shrink-0 ${
            onlyFavs
              ? 'border-amber-400 bg-amber-400/15 text-amber-300'
              : 'border-poke-accent bg-poke-dark text-gray-300 hover:bg-poke-accent/40'
          }`}
        >
          <StarIcon filled={onlyFavs} className="w-4 h-4" />
          <span>{t('Favoritos')}{favs.length > 0 ? ` (${favs.length})` : ''}</span>
        </button>
        <span className="text-xs text-gray-500">{filtered.length} {t('equipos')}</span>
      </div>

      {note && <p className={`text-sm mb-3 animate-fade-in-up ${noteErr ? 'text-amber-400' : 'text-green-400'}`}>{note}</p>}

      {teams === null ? (
        <div className="space-y-2">
          {/* Skeleton: filas de equipo (6 sprites + jugador/evento + botón) */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="panel p-3 flex flex-wrap items-center gap-3">
              <div className="flex gap-1">
                {Array.from({ length: 6 }).map((_, j) => <div key={j} className="skeleton w-9 h-9 rounded" />)}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32" />
                <div className="skeleton h-3 w-48" />
              </div>
              <div className="skeleton h-8 w-20 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div ref={listRef} className="space-y-2">
            {shown.map((tm) => (
              <div
                key={tm.id}
                data-flip-id={tm.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(tm)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(tm); } }}
                className="panel group p-3 flex flex-wrap items-center gap-3 cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:border-poke-pink/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink/60"
              >
                <div className="flex gap-1 bg-poke-dark/30 rounded-lg p-1">
                  {tm.mons.map((m, j) => <PokemonSprite key={j} speciesId={spriteId(m)} skeleton className="w-9 h-9 object-contain transition-transform duration-200 group-hover:scale-110" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{tm.player}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {tm.event && tm.event !== '-' ? tm.event : t('Sin evento')}
                    {tm.rank && tm.rank !== '-' && <span className="text-poke-pink"> · {tm.rank}</span>}
                    <span className="text-gray-600"> · Reg {tm.reg}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {tm.code && <CodeButton code={tm.code} t={t} />}
                  <a href={`https://pokepast.es/${tm.paste}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3" title="Poképaste">Poképaste</a>
                  <button type="button" onClick={() => importTeam(tm)} disabled={busy === tm.id} className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50">
                    {busy === tm.id ? t('Importando…') : t('Importar')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('Favoritos')}
                    title={favSet.has(tm.id) ? t('Quitar de favoritos') : t('Añadir a favoritos')}
                    onClick={() => toggleFav(tm.id)}
                    className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                      favSet.has(tm.id)
                        ? 'text-amber-400 hover:bg-amber-400/10'
                        : 'text-gray-500 hover:text-amber-300 hover:bg-white/5'
                    }`}
                  >
                    <StarIcon filled={favSet.has(tm.id)} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {visible < filtered.length && (
            <div className="text-center mt-4">
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="btn-secondary px-5 py-2">{t('Mostrar más')}</button>
            </div>
          )}
          {filtered.length === 0 && <div className="panel p-8 text-center text-gray-400">{t('Sin resultados')}</div>}
        </>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.player ?? ''} widthClass="max-w-4xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-poke-accent/40 border border-poke-accent text-gray-200">Reg {selected.reg}</span>
              {selected.event && selected.event !== '-' && (
                <span className="px-2 py-0.5 rounded-full bg-poke-accent/40 border border-poke-accent text-gray-200">{selected.event}</span>
              )}
              {selected.rank && selected.rank !== '-' && (
                <span className="px-2 py-0.5 rounded-full bg-poke-pink/20 border border-poke-pink/40 text-poke-pink">{selected.rank}</span>
              )}
              {selected.date && (
                <span className="px-2 py-0.5 rounded-full bg-poke-dark/50 border border-poke-accent/40 text-gray-400">{selected.date}</span>
              )}
            </div>

            {detail === null ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: selected.mons.length || 6 }).map((_, j) => (
                  <div key={j} className="rounded-lg border border-poke-accent/40 bg-poke-dark/20 p-2 flex flex-col items-center gap-2">
                    <div className="skeleton w-20 h-20 rounded-lg" />
                    <div className="skeleton h-3 w-16" />
                    <div className="skeleton h-2.5 w-full" />
                  </div>
                ))}
              </div>
            ) : detail.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {detail.map((p, j) => {
                  const types = getSpecies(p.speciesId)?.types ?? [];
                  const moves = p.moves.filter(Boolean);
                  const evLine = EV_KEYS.filter((k) => p.evs[k] > 0).map((k) => `${p.evs[k]} ${t(EV_LABEL[k])}`).join(' / ');
                  return (
                    <div key={j} className="rounded-lg border border-poke-accent/40 bg-poke-dark/20 p-2 flex flex-col items-center gap-1.5">
                      <PokemonSprite speciesId={p.speciesId} skeleton className="w-20 h-20 object-contain" />
                      <span className="text-xs font-medium text-white text-center truncate w-full">{p.speciesName}</span>
                      <div className="flex gap-1">
                        {types.map((tp) => (
                          <span key={tp} className={`type-${tp.toLowerCase()} px-1.5 py-0.5 rounded text-[10px] font-medium`}>{t(tp)}</span>
                        ))}
                      </div>
                      {(p.item || p.ability) && (
                        <div className="w-full flex flex-col items-center gap-0.5 text-[10px] text-gray-300">
                          {p.item && (
                            <span className="inline-flex items-center gap-1 max-w-full">
                              <ItemSprite item={p.item} className="w-4 h-4 shrink-0" />
                              <span className="truncate">{localizeName('items', p.item, lang)}</span>
                            </span>
                          )}
                          {p.ability && (
                            <span className="text-gray-400 truncate max-w-full">{localizeName('abilities', p.ability, lang)}</span>
                          )}
                        </div>
                      )}
                      <div className="w-full grid grid-cols-2 gap-1 mt-0.5 pt-1.5 border-t border-poke-accent/25">
                        {moves.map((mid, k) => {
                          const label = localizeName('moves', data.moveNames[mid] ?? mid, lang);
                          const mType = data.moveData?.[mid]?.type;
                          return (
                            <span
                              key={k}
                              title={label}
                              className="flex items-center gap-1 min-w-0 px-1.5 py-0.5 rounded bg-poke-dark/45 border border-poke-accent/25 text-[10px] text-gray-200"
                            >
                              {mType && <span className={`type-${mType.toLowerCase()} w-1.5 h-1.5 rounded-full shrink-0`} />}
                              <span className="truncate">{label}</span>
                            </span>
                          );
                        })}
                      </div>
                      {evLine && (
                        <div className="text-[10px] text-gray-400 text-center mt-0.5 leading-tight">
                          <span className="text-gray-300">{p.nature}</span> · {evLine}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {selected.mons.map((m, j) => (
                  <div key={j} className="flex flex-col items-center gap-1">
                    <PokemonSprite speciesId={spriteId(m)} skeleton className="w-14 h-14 object-contain" />
                    <span className="text-[10px] text-center text-gray-300 truncate w-full">{m}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {selected.code && (
                <span className="inline-flex items-center gap-1">
                  <CodeButton code={selected.code} t={t} />
                  <InfoTooltip label={t('Más información')}>
                    {lang === 'en'
                      ? 'Rental code: enter it in the game to instantly download this exact team for casual battles. Click to copy it to the clipboard.'
                      : 'Código de alquiler: introdúcelo en el juego para descargar al instante este equipo exacto en combates amistosos. Haz clic para copiarlo al portapapeles.'}
                  </InfoTooltip>
                </span>
              )}
              <a href={`https://pokepast.es/${selected.paste}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3">Poképaste</a>
              {rawPaste && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rawPaste);
                    setCopiedShowdown(true);
                    setTimeout(() => setCopiedShowdown(false), 1500);
                  }}
                  className="btn-secondary text-sm py-1.5 px-3 inline-flex items-center gap-1.5"
                >
                  <Icon name="copy" className="w-3.5 h-3.5" />
                  {copiedShowdown ? t('¡Copiado!') : t('Copiar Showdown')}
                </button>
              )}
              {selected.source && selected.source !== '-' && (
                <a href={selected.source} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3">{t('Fuente')}</a>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { const tm = selected; setSelected(null); importTeam(tm); }}
                  className="btn-primary text-sm py-1.5 px-3"
                >
                  {t('Importar')}
                </button>
                <button
                  type="button"
                  aria-label={t('Favoritos')}
                  title={favSet.has(selected.id) ? t('Quitar de favoritos') : t('Añadir a favoritos')}
                  onClick={() => toggleFav(selected.id)}
                  className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                    favSet.has(selected.id)
                      ? 'text-amber-400 hover:bg-amber-400/10'
                      : 'text-gray-500 hover:text-amber-300 hover:bg-white/5'
                  }`}
                >
                  <StarIcon filled={favSet.has(selected.id)} className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
