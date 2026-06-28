import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpecies, localizeName } from '../lib/championsData';
import { PokemonSprite } from '../components/PokemonSprite';
import { Logo } from '../components/Logo';
import { parseReplayId, fetchReplay, parseReplay, userInReplay, searchUserReplays, type MatchRecord } from '../lib/replay';
import {
  computeStats, matchSavedTeam, computeUsage, computeMatchups, computeMoveUsageByMon, computeLeads, groupSets,
  type MonStat, type MonUsage, type Matchup, type MonMoves, type MatchSet, type LeadStat,
} from '../lib/replayStats';
import type { ChampionsData } from '../types/pokemon';

interface Props { data: ChampionsData }

const USERNAME_KEY = 'champions-sd-username';
const MATCHES_KEY = 'champions-replays';
// Paleta tomada de los colores que ya usa la página (rosa de marca, azul cielo
// del rival, verde/amarillo/naranja de los win-rates, rojo Pokémon).
const PIE_COLORS = ['#e94560', '#38bdf8', '#22c55e', '#eab308', '#fb923c', '#ee1515', '#f9a8d4', '#7dd3fc'];

function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw) as T; } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ } }, [key, state]);
  return [state, setState];
}

const spName = (id: string) => getSpecies(id)?.name ?? id;
const wrColor = (wr: number) => (wr >= 60 ? 'text-green-400' : wr >= 45 ? 'text-yellow-400' : 'text-red-400');
const wrBg = (wr: number) => (wr >= 60 ? 'bg-green-500' : wr >= 45 ? 'bg-yellow-500' : 'bg-red-500');
const pct = (w: number, d: number) => (d ? Math.round((w / d) * 100) : 0);

// Anima un número de 0 al objetivo (easeOutCubic), respetando reduce-motion.
function useCountUp(target: number, duration = 800): number {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return v;
}

function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value);
  return <>{v.toFixed(decimals)}</>;
}

function timeAgo(ts: number, lang: 'es' | 'en'): string {
  const d = Math.floor(Date.now() / 1000 - ts);
  const day = Math.floor(d / 86400);
  if (day < 1) return lang === 'es' ? 'hoy' : 'today';
  if (day < 7) return `${day}${lang === 'es' ? 'd' : 'd'}`;
  if (day < 30) return `${Math.floor(day / 7)}${lang === 'es' ? ' sem' : 'w'}`;
  if (day < 365) return `${Math.floor(day / 30)}${lang === 'es' ? ' mes' : 'mo'}`;
  return `${Math.floor(day / 365)}${lang === 'es' ? ' a' : 'y'}`;
}

type Tab = 'overview' | 'games' | 'sets' | 'usage' | 'matchup' | 'moves';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Resumen' },
  { id: 'games', label: 'Partida a partida' },
  { id: 'sets', label: 'Sets' },
  { id: 'usage', label: 'Uso de Pokémon' },
  { id: 'matchup', label: 'Matchups' },
  { id: 'moves', label: 'Uso de movimientos' },
];

export function ReplaysView(_props: Props) {
  const { teams, activeTeam, activeTeamId } = useTeam();
  const { t, lang } = useLang();
  const [username, setUsername] = usePersistedState<string>(USERNAME_KEY, '');
  const [matches, setMatches] = usePersistedState<MatchRecord[]>(MATCHES_KEY, []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allTeams, setAllTeams] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [syncing, setSyncing] = useState<{ done: number; total: number } | null>(null);

  const filtered = useMemo(
    () => (allTeams ? matches : matches.filter((m) => m.teamId === activeTeamId)),
    [matches, allTeams, activeTeamId],
  );

  // En modo general solo se ofrece el Resumen; las demás pestañas son por equipo.
  useEffect(() => { if (allTeams) setTab('overview'); }, [allTeams]);

  const addReplay = async () => {
    setError(null);
    const u = username.trim();
    if (!u) { setError(t('Pon tu usuario de Showdown primero.')); return; }
    const id = parseReplayId(input);
    if (!id) { setError(t('URL o ID de repetición no válido.')); return; }
    if (matches.some((m) => m.id === id)) { setError(t('Esa repetición ya está añadida.')); return; }
    setBusy(true);
    try {
      const raw = await fetchReplay(id);
      if (!userInReplay(raw, u)) { setError(t('Tu usuario no aparece en esta repetición. Revisa que esté bien escrito.')); return; }
      const rec = parseReplay(raw, u);
      const matched = matchSavedTeam(rec.myTeam, teams);
      if (matched) { rec.teamId = matched.id; rec.teamName = matched.name; }
      setMatches((prev) => [rec, ...prev].sort((a, b) => b.uploadtime - a.uploadtime));
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('No se pudo cargar la repetición.'));
    } finally { setBusy(false); }
  };

  const removeMatch = (id: string) => setMatches((prev) => prev.filter((m) => m.id !== id));
  const clearAll = () => { if (confirm(t('¿Borrar todas las repeticiones guardadas?'))) setMatches([]); };

  // Vuelve a descargar y reparsear todas las repeticiones (refresca datos tras
  // mejorar el parser). Conserva las que fallen al descargar.
  const resyncAll = async () => {
    const u = username.trim();
    if (!u) { setError(t('Pon tu usuario de Showdown primero.')); return; }
    setError(null);
    setSyncing({ done: 0, total: matches.length });
    const updated: MatchRecord[] = [];
    for (let i = 0; i < matches.length; i++) {
      const old = matches[i];
      try {
        const raw = await fetchReplay(old.id);
        const rec = parseReplay(raw, u);
        const matched = matchSavedTeam(rec.myTeam, teams);
        if (matched) { rec.teamId = matched.id; rec.teamName = matched.name; }
        updated.push(rec);
      } catch {
        updated.push(old); // si falla, mantenemos el registro anterior
      }
      setSyncing({ done: i + 1, total: matches.length });
    }
    updated.sort((a, b) => b.uploadtime - a.uploadtime);
    setMatches(updated);
    setSyncing(null);
  };

  // Trae automáticamente las últimas repeticiones de Champions de tu usuario en Showdown.
  const autoImport = async () => {
    const u = username.trim();
    if (!u) { setError(t('Pon tu usuario de Showdown primero.')); return; }
    setError(null); setBusy(true);
    try {
      const list = await searchUserReplays(u);
      const champions = list.filter((r) => /champions/i.test(r.format) || /champions/i.test(r.id));
      const fresh = champions.filter((r) => !matches.some((m) => m.id === r.id));
      if (fresh.length === 0) {
        setError(champions.length === 0 ? t('No se encontraron repeticiones de Champions para tu usuario.') : t('No hay partidas nuevas que importar.'));
        return;
      }
      const recs: MatchRecord[] = [];
      setSyncing({ done: 0, total: fresh.length });
      for (const r of fresh) {
        try {
          const raw = await fetchReplay(r.id);
          if (userInReplay(raw, u)) {
            const rec = parseReplay(raw, u);
            const matched = matchSavedTeam(rec.myTeam, teams);
            if (matched) { rec.teamId = matched.id; rec.teamName = matched.name; }
            recs.push(rec);
          }
        } catch { /* salta la que falle */ }
        setSyncing({ done: recs.length, total: fresh.length });
      }
      setMatches((prev) => [...recs, ...prev].sort((a, b) => b.uploadtime - a.uploadtime));
    } catch {
      setError(t('No se pudieron buscar tus repeticiones.'));
    } finally { setBusy(false); setSyncing(null); }
  };

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Repeticiones')}</h2>
      </div>

      <div className="panel p-4 mb-4 border-poke-pink/20">
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-2 items-end">
          <label className="block">
            <span className="text-xs text-gray-400 uppercase">{t('Tu usuario de Showdown')}</span>
            <input className="input-field mt-1" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="usuario" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 uppercase">{t('URL o ID de la repetición')}</span>
            <input className="input-field mt-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addReplay(); }} placeholder="https://replay.pokemonshowdown.com/…" />
          </label>
          <button type="button" onClick={addReplay} disabled={busy} className="btn-primary px-5 py-2.5 disabled:opacity-50">{busy ? `⏳ ${t('Cargando…')}` : `＋ ${t('Añadir')}`}</button>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={autoImport} disabled={busy} className="btn-secondary text-sm py-2 px-4 disabled:opacity-50">
            {syncing ? `${t('Importando…')} ${syncing.done}/${syncing.total}` : `↻ ${t('Importar mis últimas partidas')}`}
          </button>
          <span className="text-xs text-gray-500">{t('Trae automáticamente tus repeticiones públicas de Champions en Showdown.')}</span>
        </div>
        {error && <p className="text-sm text-red-400 mt-2">⚠ {error}</p>}
      </div>

      {matches.length === 0 ? (
        <div className="panel p-10 text-center flex flex-col items-center gap-3">
          <Logo className="w-14 h-14 opacity-40" />
          <p className="text-gray-400 max-w-sm">{t('Aún no has añadido repeticiones. Pega el enlace de una partida de Showdown arriba.')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setAllTeams((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${allTeams ? 'border-poke-pink bg-poke-pink/15 text-poke-pink' : 'border-poke-accent text-gray-300 hover:bg-poke-accent/40'}`}
              title={t('Activado: todas las partidas. Desactivado: solo el equipo seleccionado.')}
            >
              {allTeams ? `★ ${t('Todos los equipos')}` : `☆ ${activeTeam?.name ?? t('Equipo seleccionado')}`}
            </button>
            <span className="text-xs text-gray-500">{filtered.length} {t('partidas')}</span>
            <button
              type="button"
              onClick={resyncAll}
              disabled={!!syncing}
              className="ml-auto text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
              title={t('Vuelve a descargar y reparsear todas las repeticiones')}
            >
              {syncing ? `${t('Re-sincronizando…')} ${syncing.done}/${syncing.total}` : `↻ ${t('Re-sincronizar')}`}
            </button>
            <button type="button" onClick={clearAll} className="text-xs text-red-400 hover:text-red-300">{t('Borrar todas')}</button>
          </div>

          {!allTeams && (
            <div className="inline-flex gap-1 mb-4 p-1 rounded-xl bg-poke-dark/50 border border-poke-accent/40 overflow-x-auto max-w-full">
              {TABS.map((tb) => (
                <button key={tb.id} type="button" onClick={() => setTab(tb.id)} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all active:scale-95 ${tab === tb.id ? 'bg-poke-pink text-white shadow-sm' : 'text-gray-400 hover:bg-poke-accent/40 hover:text-gray-200'}`}>{t(tb.label)}</button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="panel p-10 text-center flex flex-col items-center gap-3">
              <Logo className="w-12 h-12 opacity-40" />
              <p className="text-gray-400 max-w-sm">{t('No hay partidas para este equipo. Activa «Todos los equipos» o importa más repeticiones.')}</p>
            </div>
          ) : (
            <div key={tab} className="page-enter">
              {tab === 'overview' && <Overview matches={filtered} t={t} />}
              {tab === 'games' && <GameByGame matches={filtered} onDelete={removeMatch} lang={lang} t={t} />}
              {tab === 'sets' && <MatchByMatch sets={groupSets(filtered)} t={t} />}
              {tab === 'usage' && <UsageStats rows={computeUsage(filtered)} leads={computeLeads(filtered)} total={filtered.length} t={t} />}
              {tab === 'matchup' && <MatchupStats rows={computeMatchups(filtered)} t={t} />}
              {tab === 'moves' && <MoveUsage rows={computeMoveUsageByMon(filtered)} lang={lang} t={t} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Anillo de win-rate ───────────────────────────────────────────────────────
function WinRing({ winrate }: { winrate: number }) {
  const v = useCountUp(winrate); // valor animado 0 → winrate (rellena el aro)
  const r = 30, c = 2 * Math.PI * r;
  const stroke = winrate >= 60 ? '#22c55e' : winrate >= 45 ? '#eab308' : '#ef4444';
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgb(15 52 96 / 0.6)" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * v) / 100}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-bold text-lg ${wrColor(winrate)}`}>{v.toFixed(Number.isInteger(winrate) ? 0 : 1)}%</div>
    </div>
  );
}

// ── Filas de Pokémon ─────────────────────────────────────────────────────────
function TeamRow({ ids, size = 'w-9 h-9' }: { ids: string[]; size?: string }) {
  return <div className="flex flex-wrap gap-1">{ids.map((id, i) => <PokemonSprite key={`${id}-${i}`} speciesId={id} className={`${size} object-contain`} />)}</div>;
}

function PicksRow({ ids, leads, ring }: { ids: string[]; leads: string[]; ring: string }) {
  const slots = [...ids];
  while (slots.length < 4) slots.push('');
  return (
    <div className="flex gap-1">
      {slots.map((id, i) => id ? (
        <PokemonSprite key={`${id}-${i}`} speciesId={id} className={`w-7 h-7 object-contain ${leads.includes(id) ? `ring-2 ${ring} rounded-full` : ''}`} />
      ) : (
        <div key={i} className="w-7 h-7 rounded border border-dashed border-poke-accent/40" />
      ))}
    </div>
  );
}

function MegaCell({ id, label }: { id: string | null; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-7">{label}</span>
      {id ? <PokemonSprite speciesId={id} className="w-7 h-7 object-contain" /> : <span className="text-gray-600">—</span>}
    </div>
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
function Overview({ matches, t }: { matches: MatchRecord[]; t: (s: string) => string }) {
  const stats = useMemo(() => computeStats(matches), [matches]);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3 items-start mb-4">
        <div className="panel p-4 animate-fade-in-up">
          <h3 className="font-semibold mb-3">📈 {t('Resumen')}</h3>
          <div className="flex items-center gap-4">
            <WinRing winrate={stats.winrate} />
            <div className="flex-1 min-w-0">
              <div className="flex items-end justify-between gap-2 mb-2">
                <div className="text-center"><div className="text-2xl font-bold text-green-400 leading-none"><CountUp value={stats.wins} /></div><div className="text-xs uppercase text-gray-400 mt-0.5">{t('Ganadas')}</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-gray-200 leading-none"><CountUp value={stats.total} /></div><div className="text-xs uppercase text-gray-400 mt-0.5">{t('partidas')}</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-red-400 leading-none"><CountUp value={stats.losses} /></div><div className="text-xs uppercase text-gray-400 mt-0.5">{t('Perdidas')}</div></div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-poke-dark/60">
                <div className="bg-green-500 grow-x" style={{ width: `${stats.winrate}%` }} />
                <div className="bg-red-500/70 grow-x" style={{ width: `${100 - stats.winrate}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <h3 className="font-semibold mb-3">🧩 {t('Por equipo')}</h3>
          <div className="space-y-2">
            {stats.byTeam.map((ts) => {
              const wr = pct(ts.wins, ts.total);
              return (
                <div key={ts.key}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-300 truncate">{ts.name === 'Sin asociar' ? t('Sin asociar') : ts.name}</span><span className="text-gray-400">{ts.wins}/{ts.total} · {wr}%</span></div>
                  <div className="h-2 rounded-full bg-poke-dark/60 overflow-hidden"><div className={`h-full grow-x ${wrBg(wr)}`} style={{ width: `${wr}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <h3 className="font-semibold mb-3">🎯 {t('Leads más usados')}</h3>
          {stats.leads.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
            <div className="space-y-2">
              {stats.leads.map((l) => { const wr = pct(l.wins, l.total); return (
                <div key={l.ids.join('+')} className="flex items-center gap-2">
                  <div className="flex -space-x-1">{l.ids.map((id) => <PokemonSprite key={id} speciesId={id} className="w-7 h-7 object-contain" />)}</div>
                  <span className={`text-xs font-semibold ${wrColor(wr)}`}>{wr}%</span><span className="text-xs text-gray-500">({l.wins}/{l.total})</span>
                </div>
              ); })}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <MonGrid title={`👹 ${t('Rivales más enfrentados')}`} mons={stats.topOpponents} total={stats.total} />
        <MonGrid title={`📦 ${t('Tu bring-rate')}`} mons={stats.bring} total={stats.total} />
      </div>
    </>
  );
}

// ── Partida a partida ────────────────────────────────────────────────────────
function GameByGame({ matches, onDelete, lang, t }: { matches: MatchRecord[]; onDelete: (id: string) => void; lang: 'es' | 'en'; t: (s: string) => string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return matches;
    return matches.filter((m) => m.oppTeam.some((id) => spName(id).toLowerCase().includes(query)) || m.oppName.toLowerCase().includes(query));
  }, [matches, q]);

  return (
    <>
      <input className="input-field mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filtrar por Pokémon rival…')} />
      <div className="space-y-3">
        {shown.map((m, i) => {
          const cls = m.win === true ? 'border-green-500/40' : m.win === false ? 'border-red-500/40' : 'border-poke-accent/30';
          const badge = m.win === true ? 'bg-green-600/30 text-green-300' : m.win === false ? 'bg-red-600/30 text-red-300' : 'bg-poke-accent/50 text-gray-300';
          const label = m.win === true ? t('Victoria') : m.win === false ? t('Derrota') : t('Empate');
          return (
            <div key={m.id} className={`panel border border-l-4 ${cls} p-3 animate-fade-in-up transition-transform duration-150 hover:-translate-y-0.5`} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="w-32 shrink-0">
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${badge}`}>{label}</span>
                  <div className="text-sm font-medium mt-1 truncate">vs {m.oppName}</div>
                  <div className="text-xs text-gray-500">{timeAgo(m.uploadtime, lang)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-400 mb-1">{t('Equipo rival')}</div>
                  <TeamRow ids={m.oppTeam} />
                </div>
                <div>
                  <div className="text-xs uppercase text-sky-400 mb-1">{t('Tus picks')}</div>
                  <PicksRow ids={m.myBrought} leads={m.myLeads} ring="ring-poke-pink" />
                </div>
                <div>
                  <div className="text-xs uppercase text-red-400 mb-1">{t('Sus picks')}</div>
                  <PicksRow ids={m.oppBrought} leads={m.oppLeads} ring="ring-sky-400" />
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-400 mb-1">{t('Mega')}</div>
                  <MegaCell id={m.myMega} label={t('Tú')} />
                  <MegaCell id={m.oppMega} label={t('Riv')} />
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
                  <span>{m.turns} {t('turnos')}</span>
                  {m.teamName && <span className="text-poke-pink/80">{m.teamName}</span>}
                  <a href={`https://replay.pokemonshowdown.com/${m.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-poke-pink" title={t('Ver repetición')}>↗</a>
                  <button type="button" onClick={() => onDelete(m.id)} className="hover:text-red-400" title={t('Eliminar')}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Sets (Bo3/Bo5) ───────────────────────────────────────────────────────────
function MatchByMatch({ sets, t }: { sets: MatchSet[]; t: (s: string) => string }) {
  const wins = sets.filter((s) => s.result === 'win').length;
  const losses = sets.filter((s) => s.result === 'loss').length;
  const wr = pct(wins, wins + losses);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard value={sets.length} label={t('Sets totales')} delay={0} />
        <StatCard value={wins} label={t('Ganados')} color="text-green-400" delay={60} />
        <StatCard value={losses} label={t('Perdidos')} color="text-red-400" delay={120} />
        <StatCard value={`${wr}%`} label={t('Victorias')} color={wrColor(wr)} delay={180} />
      </div>
      <div className="space-y-3">
        {sets.map((s, si) => {
          const color = s.result === 'win' ? 'border-green-500/40' : s.result === 'loss' ? 'border-red-500/40' : 'border-poke-accent/30';
          const badge = s.result === 'win' ? 'bg-green-600/30 text-green-300' : s.result === 'loss' ? 'bg-red-600/30 text-red-300' : 'bg-poke-accent/50 text-gray-300';
          const label = s.result === 'win' ? `${t('Ganado')} ${s.myWins}-${s.oppWins}` : s.result === 'loss' ? `${t('Perdido')} ${s.myWins}-${s.oppWins}` : `${s.myWins}-${s.oppWins}`;
          // Coloca cada juego en su posición (por nº si lo hay, si no en orden).
          const ordered: (typeof s.games[number] | undefined)[] = [];
          for (const g of s.games) {
            const idx = g.gameNum ? g.gameNum - 1 : ordered.length;
            ordered[idx] = g;
          }
          const expected = Math.max(s.bestOf ?? 0, ordered.length, s.games.length);
          return (
            <div key={s.key} className={`panel border border-l-4 ${color} p-3 animate-fade-in-up transition-transform duration-150 hover:-translate-y-0.5`} style={{ animationDelay: `${si * 50}ms` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge}`}>{label}</span>
                <span className="font-medium text-sm">vs {s.oppName}</span>
                <span className="text-xs text-gray-500 ml-auto">🏆 {s.games.length} {t('partidas')}</span>
              </div>
              <div className="grid lg:grid-cols-[1fr_auto] gap-4">
                <div className="space-y-2">
                  {Array.from({ length: expected }).map((_, i) => {
                    const g = ordered[i];
                    return (
                      <div key={i} className="bg-poke-dark/30 rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{t('Partida')} {i + 1}{' '}
                            {g ? <span className={g.win === true ? 'text-green-400' : g.win === false ? 'text-red-400' : 'text-gray-400'}>{g.win === true ? t('Victoria') : g.win === false ? t('Derrota') : '—'}</span> : <span className="text-gray-600">{t('Sin jugar')}</span>}
                          </span>
                          {g && <a href={`https://replay.pokemonshowdown.com/${g.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-poke-pink">↗ {t('Ver repetición')}</a>}
                        </div>
                        {g && (
                          <div className="flex flex-wrap gap-x-6 gap-y-1">
                            <div><span className="text-xs text-sky-400 mr-1">{t('Tus picks')}</span><PicksRow ids={g.myBrought} leads={g.myLeads} ring="ring-poke-pink" /></div>
                            <div><span className="text-xs text-red-400 mr-1">{t('Sus picks')}</span><PicksRow ids={g.oppBrought} leads={g.oppLeads} ring="ring-sky-400" /></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-400 mb-1">{t('Equipo rival')}</div>
                  <TeamRow ids={s.games[0].oppTeam} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function StatCard({ value, label, color = 'text-white', delay = 0 }: { value: number | string; label: string; color?: string; delay?: number }) {
  return (
    <div className="panel p-4 text-center pop-in" style={{ animationDelay: `${delay}ms` }}>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

// ── Uso de Pokémon ───────────────────────────────────────────────────────────
function UsageStats({ rows, leads, total, t }: { rows: MonUsage[]; leads: LeadStat[]; total: number; t: (s: string) => string }) {
  const common = [...leads].sort((a, b) => b.total - a.total).slice(0, 5);
  const best = [...leads].sort((a, b) => (b.wins / b.total) - (a.wins / a.total) || b.total - a.total).slice(0, 5);
  return (
    <>
      <div className="panel p-4 mb-4 overflow-x-auto animate-fade-in-up">
        <h3 className="font-semibold mb-3">📊 {t('Rendimiento de tu equipo')}</h3>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-poke-accent/30">
              <th className="text-left font-medium py-1">{t('Pokémon')}</th>
              <th className="text-right font-medium">{t('Uso')}</th>
              <th className="text-right font-medium">Win %</th>
              <th className="text-right font-medium">{t('Lead')}</th>
              <th className="text-right font-medium">Lead Win %</th>
              <th className="text-right font-medium">{t('Mega')}</th>
              <th className="text-right font-medium">Mega Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-poke-accent/10 animate-fade-in-up hover:bg-poke-accent/10 transition-colors" style={{ animationDelay: `${i * 40}ms` }}>
                <td className="py-1.5"><span className="flex items-center gap-2"><PokemonSprite speciesId={r.id} className="w-7 h-7 object-contain shrink-0" /><span className="truncate">{spName(r.id)}</span></span></td>
                <td className="text-right text-gray-300">{r.brought} <span className="text-gray-500 text-xs">({total ? Math.round((r.brought / total) * 100) : 0}%)</span></td>
                <td className={`text-right font-semibold ${r.broughtDec ? wrColor(pct(r.broughtWins, r.broughtDec)) : 'text-gray-600'}`}>{r.broughtDec ? `${pct(r.broughtWins, r.broughtDec)}%` : '—'}</td>
                <td className="text-right text-gray-400">{r.led}</td>
                <td className={`text-right font-semibold ${r.ledDec ? wrColor(pct(r.ledWins, r.ledDec)) : 'text-gray-600'}`}>{r.ledDec ? `${pct(r.ledWins, r.ledDec)}%` : '—'}</td>
                <td className="text-right text-gray-400">{r.mega || '—'}</td>
                <td className={`text-right font-semibold ${r.megaDec ? wrColor(pct(r.megaWins, r.megaDec)) : 'text-gray-600'}`}>{r.megaDec ? `${pct(r.megaWins, r.megaDec)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LeadList title={`👥 ${t('Leads más comunes')}`} leads={common} t={t} />
        <LeadList title={`⭐ ${t('Mejores leads (Win %)')}`} leads={best} t={t} />
      </div>
    </>
  );
}

function LeadList({ title, leads, t }: { title: string; leads: LeadStat[]; t: (s: string) => string }) {
  return (
    <div className="panel p-4 animate-fade-in-up">
      <h3 className="font-semibold mb-3">{title}</h3>
      {leads.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
        <div className="space-y-2">
          {leads.map((l, i) => { const wr = pct(l.wins, l.total); return (
            <div key={l.ids.join('+')} className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="text-xs text-poke-pink font-bold w-5">#{i + 1}</span>
              <div className="flex -space-x-1">{l.ids.map((id) => <PokemonSprite key={id} speciesId={id} className="w-7 h-7 object-contain" />)}</div>
              <span className="text-sm truncate flex-1">{l.ids.map(spName).join(' + ')}</span>
              <span className={`text-sm font-semibold ${wrColor(wr)}`}>{wr}%</span>
              <span className="text-xs text-gray-500 w-12 text-right">{l.wins}{t('V')}-{l.total - l.wins}{t('D')}</span>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

// ── Matchups ─────────────────────────────────────────────────────────────────
function MatchupStats({ rows, t }: { rows: Matchup[]; t: (s: string) => string }) {
  const enough = rows.filter((r) => r.games >= 3);
  const best = [...enough].sort((a, b) => (b.wins / b.games) - (a.wins / a.games)).slice(0, 5);
  const worst = [...enough].sort((a, b) => (a.wins / a.games) - (b.wins / b.games)).slice(0, 5);
  const most = [...rows].sort((a, b) => b.games - a.games).slice(0, 5);
  const least = [...rows].sort((a, b) => a.games - b.games).slice(0, 5);
  return (
    <>
      <p className="text-xs text-gray-500 mb-3">{t('Mejores/peores requieren al menos 3 enfrentamientos.')}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MatchupCol title={`📈 ${t('Mejores matchups')}`} rows={best} delay={0} />
        <MatchupCol title={`📉 ${t('Peores matchups')}`} rows={worst} delay={80} />
        <MatchupCol title={`👥 ${t('Más enfrentados')}`} rows={most} delay={160} />
        <MatchupCol title={`👤 ${t('Menos enfrentados')}`} rows={least} delay={240} />
      </div>
    </>
  );
}

function MatchupCol({ title, rows, delay = 0 }: { title: string; rows: Matchup[]; delay?: number }) {
  return (
    <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="font-semibold mb-3 text-sm">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">—</p> : (
        <div className="space-y-2">
          {rows.map((r, i) => { const wr = pct(r.wins, r.games); return (
            <div key={r.id} className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${delay + i * 50}ms` }}>
              <span className="text-xs text-gray-500 w-4">#{i + 1}</span>
              <PokemonSprite speciesId={r.id} className="w-7 h-7 object-contain shrink-0" />
              <span className="text-sm truncate flex-1">{spName(r.id)}</span>
              <div className="text-right">
                <div className={`text-sm font-semibold ${wrColor(wr)}`}>{wr}%</div>
                <div className="text-xs text-gray-500">{r.wins}/{r.games}</div>
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

// ── Uso de movimientos (por Pokémon) ────────────────────────────────────────
function MoveUsage({ rows, lang, t }: { rows: MonMoves[]; lang: 'es' | 'en'; t: (s: string) => string }) {
  if (rows.length === 0) return <div className="panel p-8 text-center text-gray-400">{t('Sin datos de movimientos todavía.')}</div>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((mon, i) => (
        <div key={mon.id} className="panel p-4 animate-fade-in-up transition-transform duration-150 hover:-translate-y-0.5" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="flex items-center gap-2 mb-3">
            <PokemonSprite speciesId={mon.id} className="w-9 h-9 object-contain" />
            <div><div className="font-semibold">{spName(mon.id)}</div><div className="text-xs text-gray-500">{mon.total} {t('usos')}</div></div>
          </div>
          {mon.total === 0 ? <p className="text-xs text-gray-500 text-center py-6">{t('Sin datos de movimientos')}</p> : <MovePie mon={mon} lang={lang} />}
        </div>
      ))}
    </div>
  );
}

function MovePie({ mon, lang }: { mon: MonMoves; lang: 'es' | 'en' }) {
  const [hi, setHi] = useState<number | null>(null);
  const cx = 50, cy = 50, r = 46;
  const single = mon.moves.length === 1;

  // Una porción (path de arco) por movimiento; guardamos el desplazamiento
  // hacia fuera (dx,dy) para "sacar" la porción al destacarla.
  let acc = 0;
  const slices = mon.moves.map((mv, i) => {
    const a0 = (acc / mon.total) * 2 * Math.PI - Math.PI / 2;
    acc += mv.count;
    const a1 = (acc / mon.total) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const mid = (a0 + a1) / 2;
    const d = `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
    return { mv, i, d, dx: Math.cos(mid) * 4, dy: Math.sin(mid) * 4, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 shrink-0">
        <div className="absolute inset-0 pie-reveal rounded-full">
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {single ? (
              <circle
                cx={cx} cy={cy} r={r} fill={slices[0].color}
                onMouseEnter={() => setHi(0)}
                onMouseLeave={() => setHi(null)}
                style={{
                  transformBox: 'fill-box', transformOrigin: 'center',
                  transform: hi === 0 ? 'scale(1.06)' : 'none',
                  filter: hi === 0 ? 'brightness(1.15)' : 'none',
                  transition: 'transform 0.15s ease, filter 0.15s ease',
                  cursor: 'pointer',
                }}
              />
            ) : slices.map((s) => (
              <path
                key={s.mv.name}
                d={s.d}
                fill={s.color}
                onMouseEnter={() => setHi(s.i)}
                onMouseLeave={() => setHi(null)}
                style={{
                  transform: hi === s.i ? `translate(${s.dx}px, ${s.dy}px)` : 'none',
                  opacity: hi === null || hi === s.i ? 1 : 0.45,
                  transition: 'transform 0.15s ease, opacity 0.15s ease',
                  cursor: 'pointer',
                }}
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="space-y-1 min-w-0">
        {mon.moves.map((mv, i) => (
          <div
            key={mv.name}
            className="flex items-center gap-2 text-sm animate-fade-in-up rounded px-1 -mx-1 transition-colors cursor-default"
            style={{ animationDelay: `${300 + i * 80}ms`, background: hi === i ? 'rgb(233 69 96 / 0.15)' : 'transparent' }}
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi(null)}
          >
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="truncate">{localizeName('moves', mv.name, lang)}</span>
            <span className="text-gray-500 ml-auto">{Math.round((mv.count / mon.total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compartidos ──────────────────────────────────────────────────────────────
function MonGrid({ title, mons, total }: { title: string; mons: MonStat[]; total: number }) {
  return (
    <div className="panel p-4 animate-fade-in-up">
      <h3 className="font-semibold mb-3">{title}</h3>
      {mons.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
        <div className="flex flex-wrap gap-2">
          {mons.map((mon, i) => (
            <div key={mon.id} className="flex flex-col items-center w-16 pop-in transition-transform hover:scale-110" style={{ animationDelay: `${i * 40}ms` }} title={spName(mon.id)}>
              <PokemonSprite speciesId={mon.id} className="w-10 h-10 object-contain" />
              <span className="text-xs text-gray-400">{mon.count}{total ? ` · ${Math.round((mon.count / total) * 100)}%` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
