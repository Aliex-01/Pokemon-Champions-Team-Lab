import { useEffect, useMemo, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpeciesByName } from '../lib/championsData';
import { parseShowdownTeam } from '../lib/showdownImport';
import { PokemonSprite } from '../components/PokemonSprite';
import type { ChampionsData } from '../types/pokemon';

interface Props { data: ChampionsData }

interface TournamentTeam {
  id: string; reg: string; player: string; owner: string; event: string;
  rank: string; date: string; source: string; paste: string; mons: string[];
}

const PAGE = 24;
const spriteId = (name: string) => getSpeciesByName(name)?.id ?? name.toLowerCase().replace(/[^a-z0-9]/g, '');

export function TournamentTeamsView({ data }: Props) {
  const { createTeam, setActiveTeamPokemon } = useTeam();
  const { t } = useLang();
  const [teams, setTeams] = useState<TournamentTeam[] | null>(null);
  const [reg, setReg] = useState<'all' | 'M-A' | 'M-B'>('all');
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/tournament-teams.json').then((r) => r.json()).then((d) => setTeams(d.teams)).catch(() => setTeams([]));
  }, []);

  const regs = useMemo(() => [...new Set((teams ?? []).map((x) => x.reg))], [teams]);

  const filtered = useMemo(() => {
    if (!teams) return [];
    const s = q.toLowerCase().trim();
    return teams.filter((tm) => {
      if (reg !== 'all' && tm.reg !== reg) return false;
      if (!s) return true;
      return tm.player.toLowerCase().includes(s) || tm.event.toLowerCase().includes(s) ||
        tm.mons.some((m) => m.toLowerCase().includes(s));
    });
  }, [teams, reg, q]);

  useEffect(() => { setVisible(PAGE); }, [reg, q]);

  const importTeam = async (tm: TournamentTeam) => {
    setBusy(tm.id); setNote(null);
    try {
      const res = await fetch(`https://pokepast.es/${tm.paste}/raw`);
      if (!res.ok) throw new Error();
      const pokemon = parseShowdownTeam(await res.text(), data);
      if (pokemon.length === 0) throw new Error();
      const name = `${tm.player}${tm.event && tm.event !== '-' ? ' · ' + tm.event : ''}`.slice(0, 40);
      createTeam(name);
      setActiveTeamPokemon(pokemon);
      setNote(`${t('Importado como equipo activo:')} ${name}`);
    } catch {
      setNote(t('No se pudo importar este equipo.'));
    } finally { setBusy(null); }
  };

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Equipos de torneo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('Equipos de torneos de Champions. Impórtalos a tu equipo con un clic.')}</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex gap-1 p-1 rounded-xl bg-poke-dark/50 border border-poke-accent/40">
          {(['all', ...regs] as const).map((r) => (
            <button key={r} type="button" onClick={() => setReg(r as typeof reg)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${reg === r ? 'bg-poke-pink text-white' : 'text-gray-400 hover:bg-poke-accent/40'}`}>
              {r === 'all' ? t('Todas') : `Reg ${r}`}
            </button>
          ))}
        </div>
        <input className="input-field flex-1 min-w-[200px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar por jugador, evento o Pokémon…')} />
        <span className="text-xs text-gray-500">{filtered.length} {t('equipos')}</span>
      </div>

      {note && <p className="text-sm text-green-400 mb-3 animate-fade-in-up">{note}</p>}

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
          <div className="space-y-2">
            {filtered.slice(0, visible).map((tm, i) => (
              <div key={tm.id} className="panel p-3 flex flex-wrap items-center gap-3 animate-fade-in-up" style={{ animationDelay: `${(i % PAGE) * 25}ms` }}>
                <div className="flex gap-1">
                  {tm.mons.map((m, j) => <PokemonSprite key={j} speciesId={spriteId(m)} className="w-9 h-9 object-contain" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{tm.player}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {tm.event && tm.event !== '-' ? tm.event : t('Sin evento')}
                    {tm.rank && tm.rank !== '-' && <span className="text-poke-pink"> · {tm.rank}</span>}
                    <span className="text-gray-600"> · Reg {tm.reg}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={`https://pokepast.es/${tm.paste}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-poke-pink" title="Poképaste">↗</a>
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
    </div>
  );
}
