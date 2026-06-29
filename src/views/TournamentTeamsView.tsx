import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpeciesByName, getSpecies, localizeName } from '../lib/championsData';
import { parseShowdownTeam } from '../lib/showdownImport';
import { PokemonSprite } from '../components/PokemonSprite';
import { Dropdown } from '../components/Dropdown';
import { Modal } from '../components/Modal';
import { useFlip } from '../lib/useFlip';
import type { ChampionsData, TeamPokemon } from '../types/pokemon';

// Fecha "12 Jun 2026" → número ordenable (0 si no se reconoce).
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const dateVal = (s: string): number => {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
  const mo = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && mo !== undefined ? Date.UTC(Number(m[3]), mo, Number(m[1])) : 0;
};

// Normaliza para buscar sin distinguir tildes (é = e) ni mayúsculas.
const noAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const EV_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const EV_LABEL: Record<(typeof EV_KEYS)[number], string> = { hp: 'PS', atk: 'Ata', def: 'Def', spa: 'AtaEsp', spd: 'DefEsp', spe: 'Vel' };

interface Props { data: ChampionsData }

interface TournamentTeam {
  id: string; reg: string; player: string; owner: string; event: string;
  rank: string; date: string; source: string; code: string; paste: string; mons: string[];
}

// Botón que muestra el código de alquiler y lo copia al portapapeles.
function CodeButton({ code, t }: { code: string; t: (s: string) => string }) {
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
const spriteId = (name: string) => {
  let n = name;
  for (;;) {
    const sp = getSpeciesByName(n);
    if (sp) return sp.id;
    const cut = n.lastIndexOf('-');
    if (cut < 0) return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    n = n.slice(0, cut);
  }
};

export function TournamentTeamsView({ data }: Props) {
  const { activeTeam, setActiveTeamPokemon } = useTeam();
  const { t, lang } = useLang();
  const [teams, setTeams] = useState<TournamentTeam[] | null>(null);
  const [reg, setReg] = useState<'all' | 'M-A' | 'M-B'>('all');
  const [qPlayer, setQPlayer] = useState('');
  const [qEvent, setQEvent] = useState('');
  const [qMon, setQMon] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteErr, setNoteErr] = useState(false);
  const [selected, setSelected] = useState<TournamentTeam | null>(null);
  // Equipo completo del paste (tipos, movimientos, naturaleza, EVs) para el modal.
  const [detail, setDetail] = useState<TeamPokemon[] | null>(null);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    fetch(`https://pokepast.es/${selected.paste}/raw`)
      .then((r) => r.text())
      .then((txt) => { if (!cancelled) setDetail(parseShowdownTeam(txt, data)); })
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
    const qm = qMon.toLowerCase().trim();
    return teams
      .filter((tm) => {
        if (reg !== 'all' && tm.reg !== reg) return false;
        if (qp && !noAccents(tm.player).includes(qp)) return false;
        if (qe && !noAccents(tm.event).includes(qe)) return false;
        if (qm && !tm.mons.some((m) => m.toLowerCase().includes(qm))) return false;
        return true;
      })
      // Más recientes primero; empates por fecha → orden del sheet (sort estable).
      .sort((a, b) => dateVal(b.date) - dateVal(a.date));
  }, [teams, reg, qPlayer, qEvent, qMon]);

  useEffect(() => { setVisible(PAGE); }, [reg, qPlayer, qEvent, qMon]);

  // Memoizado: su referencia solo cambia al filtrar/paginar, no al abrir el modal.
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  // Las filas se deslizan a su nueva posición al filtrar (si no son demasiadas).
  const listRef = useFlip<HTMLDivElement>(shown, shown.length <= 60);

  const importTeam = async (tm: TournamentTeam) => {
    // Solo se importa si el equipo activo está vacío; si no, se avisa y no se toca.
    if (!activeTeam || activeTeam.pokemon.some((p) => p.speciesId)) {
      setNoteErr(true);
      setNote(t('Tu equipo activo no está vacío. Selecciona o crea un equipo vacío.'));
      return;
    }
    setBusy(tm.id); setNote(null);
    try {
      const res = await fetch(`https://pokepast.es/${tm.paste}/raw`);
      if (!res.ok) throw new Error();
      const pokemon = parseShowdownTeam(await res.text(), data);
      if (pokemon.length === 0) throw new Error();
      setActiveTeamPokemon(pokemon);
      const name = `${tm.player}${tm.event && tm.event !== '-' ? ' · ' + tm.event : ''}`.slice(0, 40);
      setNoteErr(false);
      setNote(`${t('Importado en tu equipo:')} ${name}`);
    } catch {
      setNoteErr(true);
      setNote(t('No se pudo importar este equipo.'));
    } finally { setBusy(null); }
  };

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Equipos de torneo')}</h2>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Dropdown
          className="w-32 shrink-0"
          value={reg}
          options={['all', ...regs]}
          render={(r) => (r === 'all' ? t('Todas') : `Reg ${r}`)}
          onChange={(r) => setReg(r as typeof reg)}
        />
        <input className="input-field flex-1 min-w-[130px]" value={qPlayer} onChange={(e) => setQPlayer(e.target.value)} placeholder={t('Jugador')} />
        <input className="input-field flex-1 min-w-[130px]" value={qEvent} onChange={(e) => setQEvent(e.target.value)} placeholder={t('Evento')} />
        <input className="input-field flex-1 min-w-[130px]" value={qMon} onChange={(e) => setQMon(e.target.value)} placeholder={t('Pokémon')} />
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

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.player ?? ''} widthClass="max-w-lg">
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
                      <div className="w-full flex flex-col gap-0.5 mt-0.5">
                        {moves.map((mid, k) => (
                          <span key={k} className="text-[10px] text-gray-300 text-center truncate">{localizeName('moves', data.moveNames[mid] ?? mid, lang)}</span>
                        ))}
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
              {selected.code && <CodeButton code={selected.code} t={t} />}
              <a href={`https://pokepast.es/${selected.paste}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3">Poképaste</a>
              {selected.source && selected.source !== '-' && (
                <a href={selected.source} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3">{t('Fuente')}</a>
              )}
              <button
                type="button"
                onClick={() => { const tm = selected; setSelected(null); importTeam(tm); }}
                className="btn-primary text-sm py-1.5 px-3 ml-auto"
              >
                {t('Importar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
