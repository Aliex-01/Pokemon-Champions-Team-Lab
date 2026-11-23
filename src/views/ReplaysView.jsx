import { useEffect, useMemo, useRef, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { getSpecies, localizeName } from '../lib/championsData';
import { PokemonSprite } from '../components/PokemonSprite';
import { Logo } from '../components/Logo';
import { InfoTooltip } from '../components/InfoTooltip';
import { Icon } from '../components/Icons';
import { parseReplayId, fetchReplay, parseReplay, userInReplay, searchUserReplays } from '../lib/replay';
import { computeStats, matchSavedTeam, computeUsage, computeMatchups, computeMoveUsageByMon, computeLeads, groupSets } from '../lib/replayStats';

const USERNAME_KEY = 'champions-sd-username';
const MATCHES_KEY = 'champions-replays';
// Paleta tomada de los colores que ya usa la página (rosa de marca, azul cielo
// del rival, verde/amarillo/naranja de los win-rates, rojo Pokémon).
const PIE_COLORS = ['#e94560', '#38bdf8', '#22c55e', '#eab308', '#fb923c', '#ee1515', '#f9a8d4', '#7dd3fc'];

function usePersistedState(key, initial) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(key); if (raw != null) return JSON.parse(raw); } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ } }, [key, state]);
  return [state, setState];
}

const spName = (id) => getSpecies(id)?.name ?? id;
const wrColor = (wr) => (wr >= 60 ? 'text-green-400' : wr >= 45 ? 'text-yellow-400' : 'text-red-400');
const wrBg = (wr) => (wr >= 60 ? 'bg-green-500' : wr >= 45 ? 'bg-yellow-500' : 'bg-red-500');
const pct = (w, d) => (d ? Math.round((w / d) * 100) : 0);

// Anima un número de 0 al objetivo (easeOutCubic), respetando reduce-motion.
function useCountUp(target, duration = 800) {
  const [v, setV] = useState(0);
  const raf = useRef(undefined);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return v;
}

function CountUp({ value, decimals = 0 }) {
  const v = useCountUp(value);
  return <>{v.toFixed(decimals)}</>;
}

function timeAgo(ts, lang) {
  const d = Math.floor(Date.now() / 1000 - ts);
  const day = Math.floor(d / 86400);
  if (day < 1) return lang === 'es' ? 'hoy' : 'today';
  if (day < 7) return `${day}${lang === 'es' ? 'd' : 'd'}`;
  if (day < 30) return `${Math.floor(day / 7)}${lang === 'es' ? ' sem' : 'w'}`;
  if (day < 365) return `${Math.floor(day / 30)}${lang === 'es' ? ' mes' : 'mo'}`;
  return `${Math.floor(day / 365)}${lang === 'es' ? ' a' : 'y'}`;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportReplaysCsv(matches, lang) {
  const header = lang === 'en'
    ? ['Date', 'Result', 'Team', 'Opponent', 'Opponent Team', 'Your Picks', 'Your Leads', 'Opp Picks', 'Turns', 'Note', 'URL']
    : ['Fecha', 'Resultado', 'Equipo', 'Rival', 'Equipo rival', 'Tus picks', 'Tus leads', 'Sus picks', 'Turnos', 'Nota', 'URL'];
  const rows = [header.map(csvCell).join(',')];
  for (const m of matches) {
    const date = m.uploadtime ? new Date(m.uploadtime * 1000).toISOString().slice(0, 10) : '';
    const res = m.win === true ? (lang === 'en' ? 'Win' : 'Victoria') : m.win === false ? (lang === 'en' ? 'Loss' : 'Derrota') : (lang === 'en' ? 'Tie' : 'Empate');
    rows.push([
      date,
      res,
      m.teamName ?? '',
      m.oppName ?? '',
      (m.oppTeam ?? []).map(spName).join(' / '),
      (m.myBrought ?? []).map(spName).join(' / '),
      (m.myLeads ?? []).map(spName).join(' / '),
      (m.oppBrought ?? []).map(spName).join(' / '),
      m.turns ?? '',
      m.note ?? '',
      `https://replay.pokemonshowdown.com/${m.id}`,
    ].map(csvCell).join(','));
  }
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `replays-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TABS = [
  { id: 'overview', label: 'Resumen' },
  { id: 'games', label: 'Partida a partida' },
  { id: 'sets', label: 'Sets' },
  { id: 'usage', label: 'Uso de Pokémon' },
  { id: 'matchup', label: 'Matchups' },
  { id: 'moves', label: 'Uso de movimientos' },
];

export function ReplaysView(_props) {
  const { teams, activeTeam, activeTeamId } = useTeam();
  const { t, lang } = useLang();
  const [username, setUsername] = usePersistedState(USERNAME_KEY, '');
  const [matches, setMatches] = usePersistedState(MATCHES_KEY, []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [allTeams, setAllTeams] = useState(false);
  const [dateRange, setDateRange] = useState('all'); // '7d' | '30d' | 'all'
  const [gameQuery, setGameQuery] = useState('');
  const [tab, setTab] = useState('overview');
  const [syncing, setSyncing] = useState(null);

  // Si se elimina un equipo, se borran también las repeticiones asociadas a él.
  useEffect(() => {
    const ids = new Set(teams.map((tm) => tm.id));
    setMatches((prev) => {
      const next = prev.filter((m) => !m.teamId || ids.has(m.teamId));
      return next.length === prev.length ? prev : next;
    });
  }, [teams, setMatches]);

  const filtered = useMemo(() => {
    // Solo partidas asociadas a un equipo (se excluyen las «sin asociar»).
    let list = (allTeams ? matches : matches.filter((m) => m.teamId === activeTeamId)).filter((m) => m.teamId);
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : 30;
      const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
      list = list.filter((m) => (m.uploadtime ?? 0) >= cutoff);
    }
    return list;
  }, [matches, allTeams, activeTeamId, dateRange]);

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

  const removeMatch = (id) => setMatches((prev) => prev.filter((m) => m.id !== id));
  const updateNote = (id, note) => setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, note } : m)));
  const clearAll = () => { if (confirm(t('¿Borrar todas las repeticiones guardadas?'))) setMatches([]); };

  // Vuelve a descargar y reparsear todas las repeticiones (refresca datos tras
  // mejorar el parser). Conserva las que fallen al descargar.
  const resyncAll = async () => {
    const u = username.trim();
    if (!u) { setError(t('Pon tu usuario de Showdown primero.')); return; }
    setError(null);
    setSyncing({ done: 0, total: matches.length });
    const updated = [];
    for (let i = 0; i < matches.length; i++) {
      const old = matches[i];
      try {
        const raw = await fetchReplay(old.id);
        const rec = parseReplay(raw, u);
        const matched = matchSavedTeam(rec.myTeam, teams);
        if (matched) { rec.teamId = matched.id; rec.teamName = matched.name; }
        if (old.note) rec.note = old.note;
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
      const recs = [];
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
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {t('Repeticiones')}
          <InfoTooltip label={t('Más información')} side="bottom" className="h-5 w-5 text-xs">
            {lang === 'en'
              ? 'Import your Pokémon Showdown Champions replays (by URL or automatically from your username) and this page analyses them: win rate, most-used leads, matchups against each opponent, and Pokémon and move usage. Everything is computed locally from your saved replays.'
              : 'Importa tus repeticiones de Champions de Pokémon Showdown (por URL o automáticamente desde tu usuario) y esta página las analiza: win rate, leads más usados, matchups contra cada rival, y uso de Pokémon y movimientos. Todo se calcula en local a partir de tus repeticiones guardadas.'}
          </InfoTooltip>
        </h2>
      </div>

      <div className="panel p-4 mb-4 border-poke-pink/20">
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-2 items-end">
          <label className="block">
            <span className="text-xs text-gray-400 uppercase">{t('Usuario de Showdown')}</span>
            <input className="input-field mt-1" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="usuario" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400 uppercase">{t('URL o ID de la repetición')}</span>
            <input className="input-field mt-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addReplay(); }} placeholder="https://replay.pokemonshowdown.com/…" />
          </label>
          <button type="button" onClick={addReplay} disabled={busy} className="btn-primary px-5 py-2.5 disabled:opacity-50">{busy ? `⏳ ${t('Cargando…')}` : `＋ ${t('Añadir')}`}</button>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={autoImport} disabled={busy} className="btn-secondary text-sm py-2 px-4 disabled:opacity-50 inline-flex items-center gap-1.5">
            <Icon name="refresh" className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? `${t('Importando…')} ${syncing.done}/${syncing.total}` : t('Importar mis últimas partidas')}
          </button>
          <span className="text-xs text-gray-500 inline-flex items-center gap-1.5">
            {t('Trae automáticamente tus repeticiones públicas de Champions en Showdown.')}
            <InfoTooltip label={t('Más información')} side="bottom">
              {lang === 'en'
                ? 'Two ways to add games: paste a single replay URL/ID in the field above, or click here to auto-fetch your latest public Champions replays for the Showdown username entered. Only public replays are found automatically — save the replay on Showdown to make it public.'
                : 'Dos formas de añadir partidas: pega la URL/ID de una repetición en el campo de arriba, o pulsa aquí para traer automáticamente tus últimas repeticiones públicas de Champions del usuario de Showdown indicado. Solo se encuentran las repeticiones públicas: guarda la repetición en Showdown para hacerla pública.'}
            </InfoTooltip>
          </span>
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
            <div className="inline-flex items-center gap-1 rounded-lg bg-poke-dark/60 border border-poke-accent/50 p-0.5">
              {[
                { id: '7d', label: '7d' },
                { id: '30d', label: '30d' },
                { id: 'all', label: t('Todo') },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDateRange(r.id)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    dateRange === r.id ? 'bg-poke-pink text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">{filtered.length} {t('partidas')}</span>
            <button
              type="button"
              onClick={() => exportReplaysCsv(filtered, lang)}
              disabled={filtered.length === 0}
              className="ml-auto btn-secondary text-xs py-1.5 px-3 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              {t('Exportar CSV')}
            </button>
            <button
              type="button"
              onClick={resyncAll}
              disabled={!!syncing}
              className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50 inline-flex items-center gap-1"
              title={t('Vuelve a descargar y reparsear todas las repeticiones')}
            >
              <Icon name="refresh" className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? `${t('Re-sincronizando…')} ${syncing.done}/${syncing.total}` : t('Re-sincronizar')}
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
              {tab === 'overview' && <Overview matches={filtered} lang={lang} t={t} />}
              {tab === 'games' && <GameByGame matches={filtered} query={gameQuery} onQuery={setGameQuery} onDelete={removeMatch} onNote={updateNote} lang={lang} t={t} />}
              {tab === 'sets' && <MatchByMatch sets={groupSets(filtered)} lang={lang} t={t} />}
              {tab === 'usage' && <UsageStats rows={computeUsage(filtered)} leads={computeLeads(filtered)} total={filtered.length} lang={lang} t={t} />}
              {tab === 'matchup' && (
                <MatchupStats
                  rows={computeMatchups(filtered)}
                  onPickOpponent={(id) => { setGameQuery(spName(id)); setTab('games'); }}
                  lang={lang}
                  t={t}
                />
              )}
              {tab === 'moves' && <MoveUsage rows={computeMoveUsageByMon(filtered)} lang={lang} t={t} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Anillo de win-rate ───────────────────────────────────────────────────────
function WinRing({ winrate }) {
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
function TeamRow({ ids, size = 'w-9 h-9' }) {
  return <div className="flex flex-wrap gap-1">{ids.map((id, i) => <PokemonSprite key={`${id}-${i}`} speciesId={id} className={`${size} object-contain`} />)}</div>;
}

function PicksRow({ ids, leads, ring }) {
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

function MegaCell({ id, label }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-7">{label}</span>
      {id ? <PokemonSprite speciesId={id} className="w-7 h-7 object-contain" /> : <span className="text-gray-600">—</span>}
    </div>
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────
function Overview({ matches, lang, t }) {
  const stats = useMemo(() => computeStats(matches), [matches]);
  const turnStats = useMemo(() => {
    const allTurns = matches.filter((m) => m.turns > 0).map((m) => m.turns);
    const winTurns = matches.filter((m) => m.win === true && m.turns > 0).map((m) => m.turns);
    const lossTurns = matches.filter((m) => m.win === false && m.turns > 0).map((m) => m.turns);
    const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—');
    return { allAvg: avg(allTurns), winAvg: avg(winTurns), lossAvg: avg(lossTurns) };
  }, [matches]);
  return (
    <div className="grid gap-4 md:grid-cols-2 items-stretch">
      <div className="panel p-4 animate-fade-in-up">
          <h3 className="font-semibold mb-3 flex items-center gap-1.5">
            <Icon name="trendingUp" className="w-4 h-4 text-poke-pink" />
            {t('Resumen')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Win rate is the percentage of games won out of your total analysed replays. The ring and the green/red bar show that split; the numbers below are wins, total games and losses.'
                : 'El win rate es el porcentaje de partidas ganadas sobre el total de repeticiones analizadas. El aro y la barra verde/roja muestran ese reparto; los números de abajo son victorias, partidas totales y derrotas.'}
            </InfoTooltip>
          </h3>
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
        <div className="panel p-4 animate-fade-in-up flex flex-col" style={{ animationDelay: '40ms' }}>
          <h3 className="font-semibold mb-3 flex items-center gap-1.5">
            <Icon name="clock" className="w-4 h-4 text-poke-pink" />
            {t('Turnos medios')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Average number of turns per game, split between wins and losses. Helps you spot whether your team closes games fast or struggles in longer matches.'
                : 'Número medio de turnos por partida, separado entre victorias y derrotas. Ayuda a ver si tu equipo cierra rápido o sufre cuando las partidas se alargan.'}
            </InfoTooltip>
          </h3>
          <div className="grid grid-cols-3 gap-2.5 text-center flex-1">
            <div className="bg-poke-dark/50 rounded-lg py-3 px-2 border border-poke-accent/30 flex flex-col items-center justify-center">
              <div className="font-mono text-2xl font-bold text-green-400 leading-none">{turnStats.winAvg}</div>
              <div className="text-[11px] uppercase text-gray-400 mt-1.5">{t('Ganadas')}</div>
            </div>
            <div className="bg-poke-dark/50 rounded-lg py-3 px-2 border border-poke-accent/30 flex flex-col items-center justify-center">
              <div className="font-mono text-2xl font-bold text-gray-200 leading-none">{turnStats.allAvg}</div>
              <div className="text-[11px] uppercase text-gray-400 mt-1.5">{t('Total')}</div>
            </div>
            <div className="bg-poke-dark/50 rounded-lg py-3 px-2 border border-poke-accent/30 flex flex-col items-center justify-center">
              <div className="font-mono text-2xl font-bold text-red-400 leading-none">{turnStats.lossAvg}</div>
              <div className="text-[11px] uppercase text-gray-400 mt-1.5">{t('Perdidas')}</div>
            </div>
          </div>
        </div>
        <MonGrid
          title={<><Icon name="users" className="w-4 h-4 text-poke-pink" />{t('Rivales más enfrentados')}</>}
          mons={stats.topOpponents.slice(0, 8)}
          total={stats.total}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'The Pokémon that appeared most often on your opponents’ teams, with how many games they showed up in. A quick read of what the meta is bringing against you.'
                : 'Los Pokémon que más aparecen en los equipos rivales, con el número de partidas en que salieron. Una lectura rápida de lo que el meta trae contra ti.'}
            </InfoTooltip>
          }
        />
        <MonGrid
          title={<><Icon name="box" className="w-4 h-4 text-poke-pink" />{t('Tu bring-rate')}</>}
          mons={stats.bring.slice(0, 8)}
          total={stats.total}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Bring-rate: how often you actually brought each of your Pokémon to Team Preview, and in what share of games. Shows which members you rely on most.'
                : 'Bring-rate: con qué frecuencia llevaste cada uno de tus Pokémon a la vista previa, y en qué porcentaje de partidas. Muestra en qué miembros te apoyas más.'}
            </InfoTooltip>
          }
        />
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
          <h3 className="font-semibold mb-3 flex items-center gap-1.5">
            <Icon name="layers" className="w-4 h-4 text-poke-pink" />
            {t('Por equipo')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Win rate broken down by each of your saved teams, so you can compare how they perform. Only teams matched to a replay appear here.'
                : 'Win rate desglosado por cada uno de tus equipos guardados, para comparar cómo rinden. Solo aparecen los equipos asociados a alguna repetición.'}
            </InfoTooltip>
          </h3>
          <div className="space-y-2">
            {stats.byTeam.filter((ts) => ts.key !== '__none__').map((ts) => {
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
          <h3 className="font-semibold mb-3 flex items-center gap-1.5">
            <Icon name="target" className="w-4 h-4 text-poke-pink" />
            {t('Leads más usados')}
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Leads are the two Pokémon you send out first each game. This lists your most frequent lead pairs with their win rate (wins/games), so you can see which openings actually work.'
                : 'Los leads son los dos Pokémon que sacas al principio de cada partida. Aquí se listan tus parejas de lead más frecuentes con su win rate (victorias/partidas), para ver qué aperturas te funcionan de verdad.'}
            </InfoTooltip>
          </h3>
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
  );
}

// ── Partida a partida ────────────────────────────────────────────────────────
function GameByGame({ matches, query: q, onQuery: setQ, onDelete, onNote, lang, t }) {
  const [resultFilter, setResultFilter] = useState('all');
  const shown = useMemo(() => {
    const query = q.toLowerCase().trim();
    return matches.filter((m) => {
      if (resultFilter === 'win' && m.win !== true) return false;
      if (resultFilter === 'loss' && m.win !== false) return false;
      if (!query) return true;
      return (
        m.oppTeam.some((id) => spName(id).toLowerCase().includes(query)) ||
        m.oppName.toLowerCase().includes(query) ||
        (m.note ?? '').toLowerCase().includes(query)
      );
    });
  }, [matches, q, resultFilter]);

  const RESULT_OPTS = [
    { id: 'all', label: 'Todas' },
    { id: 'win', label: 'Victorias' },
    { id: 'loss', label: 'Derrotas' },
  ];

  return (
    <>
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">
        {t('Partida a partida')}
        <InfoTooltip label={t('Más información')} side="bottom">
          {lang === 'en'
            ? 'Every analysed game, newest first: result, opponent, the full enemy team, what each side actually brought (leads ringed), Megas, turn count and your notes. Filter by result, opposing Pokémon or note.'
            : 'Todas las partidas analizadas, de más nueva a más antigua: resultado, rival, el equipo enemigo completo, lo que llevó cada lado (leads resaltados), Megas, número de turnos y tus notas. Filtra por resultado, Pokémon rival o nota.'}
        </InfoTooltip>
      </h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="input-field flex-1 min-w-[200px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Filtrar por Pokémon rival o nota…')}
        />
        <div className="flex items-center gap-1.5">
          {RESULT_OPTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setResultFilter(opt.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                resultFilter === opt.id
                  ? 'border-poke-pink bg-poke-pink/15 text-poke-pink'
                  : 'border-poke-accent bg-poke-dark text-gray-300 hover:bg-poke-accent/40'
              }`}
            >
              {t(opt.label)}
            </button>
          ))}
        </div>
      </div>
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
                  <a href={`https://replay.pokemonshowdown.com/${m.id}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1 px-2.5">{t('Ver repetición')}</a>
                  <button type="button" onClick={() => onDelete(m.id)} className="btn-primary text-xs py-1 px-2.5">{t('Eliminar')}</button>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-poke-accent/20 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 shrink-0">{t('Nota')}</span>
                <input
                  type="text"
                  value={m.note ?? ''}
                  onChange={(e) => onNote(m.id, e.target.value)}
                  placeholder={t('Añadir nota sobre la partida…')}
                  className="w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 focus:text-white outline-none py-0.5"
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Sets (Bo3/Bo5) ───────────────────────────────────────────────────────────
function MatchByMatch({ sets, lang, t }) {
  const wins = sets.filter((s) => s.result === 'win').length;
  const losses = sets.filter((s) => s.result === 'loss').length;
  const wr = pct(wins, wins + losses);
  return (
    <>
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">
        {t('Sets')}
        <InfoTooltip label={t('Más información')} side="bottom">
          {lang === 'en'
            ? 'Games grouped into Best-of-3/Best-of-5 sets against the same opponent. Shows the set score, each individual game with the picks used, and your set win rate — the format that actually decides tournaments.'
            : 'Partidas agrupadas en sets al mejor de 3/5 contra el mismo rival. Muestra el marcador del set, cada partida individual con los picks usados y tu win rate por sets, el formato que de verdad decide los torneos.'}
        </InfoTooltip>
      </h3>
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
          const ordered = [];
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
                <span className="text-xs text-gray-500 ml-auto inline-flex items-center gap-1"><Icon name="trophy" className="w-3.5 h-3.5" />{s.games.length} {t('partidas')}</span>
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
                          {g && <a href={`https://replay.pokemonshowdown.com/${g.id}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1 px-2.5 shrink-0">{t('Ver repetición')}</a>}
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

function StatCard({ value, label, color = 'text-white', delay = 0 }) {
  return (
    <div className="panel p-4 text-center pop-in" style={{ animationDelay: `${delay}ms` }}>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

// ── Uso de Pokémon ───────────────────────────────────────────────────────────
function UsageStats({ rows, leads, total, lang, t }) {
  const common = [...leads].sort((a, b) => b.total - a.total).slice(0, 5);
  const best = [...leads].sort((a, b) => (b.wins / b.total) - (a.wins / a.total) || b.total - a.total).slice(0, 5);
  return (
    <>
      <div className="panel p-4 mb-4 overflow-x-auto animate-fade-in-up">
        <h3 className="font-semibold mb-3 flex items-center gap-1.5">
          <Icon name="barChart" className="w-4 h-4 text-poke-pink" />
          {t('Rendimiento de tu equipo')}
          <InfoTooltip label={t('Más información')}>
            {lang === 'en'
              ? 'Per-Pokémon breakdown: how often you brought it (Usage) and its win rate, plus lead usage/win rate and Mega usage/win rate. Percentages are computed only over games where that stat applies.'
              : 'Desglose por Pokémon: con qué frecuencia lo llevaste (Uso) y su win rate, además del uso/win rate como lead y como Mega. Los porcentajes se calculan solo sobre las partidas donde aplica cada dato.'}
          </InfoTooltip>
        </h3>
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
        <LeadList
          title={<><Icon name="users" className="w-4 h-4 text-poke-pink" />{t('Leads más comunes')}</>}
          leads={common}
          t={t}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Your most frequently used lead pairs (the two Pokémon sent out first), ranked by how many games you opened with them, with their win-loss record.'
                : 'Tus parejas de lead más usadas (los dos Pokémon que sacas primero), ordenadas por en cuántas partidas abriste con ellas, con su registro de victorias-derrotas.'}
            </InfoTooltip>
          }
        />
        <LeadList
          title={<><Icon name="star" className="w-4 h-4 text-poke-pink" />{t('Mejores leads (Win %)')}</>}
          leads={best}
          t={t}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Your lead pairs ranked by win rate instead of frequency, so you can spot which openings win the most (not just which you use most).'
                : 'Tus parejas de lead ordenadas por win rate en vez de por frecuencia, para ver qué aperturas ganan más (no solo las que más usas).'}
            </InfoTooltip>
          }
        />
      </div>
    </>
  );
}

function LeadList({ title, leads, t, info }) {
  return (
    <div className="panel p-4 animate-fade-in-up">
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">{title}{info}</h3>
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
function MatchupStats({ rows, onPickOpponent, lang, t }) {
  const enough = rows.filter((r) => r.games >= 3);
  const best = [...enough].sort((a, b) => (b.wins / b.games) - (a.wins / a.games)).slice(0, 5);
  const worst = [...enough].sort((a, b) => (a.wins / a.games) - (b.wins / b.games)).slice(0, 5);
  const most = [...rows].sort((a, b) => b.games - a.games).slice(0, 5);
  const least = [...rows].sort((a, b) => a.games - b.games).slice(0, 5);
  return (
    <>
      <p className="text-xs text-gray-500 mb-3 inline-flex items-center gap-1.5">
        {t('Mejores/peores requieren al menos 3 enfrentamientos.')}
        <InfoTooltip label={t('Más información')} side="bottom">
          {lang === 'en'
            ? 'A matchup is how you fare against each opposing Pokémon: your win rate in games where that Pokémon appeared on the enemy team. Click any Pokémon to jump to those games.'
            : 'Un matchup es cómo te va contra cada Pokémon rival: tu win rate en las partidas donde ese Pokémon estuvo en el equipo enemigo. Haz clic en cualquier Pokémon para ver esas partidas.'}
        </InfoTooltip>
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MatchupCol
          title={<><Icon name="trendingUp" className="w-4 h-4 text-green-400" />{t('Mejores matchups')}</>}
          rows={best}
          delay={0}
          onPick={onPickOpponent}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Opposing Pokémon you win against most often (highest win rate), among those faced in at least 3 games.'
                : 'Pokémon rivales contra los que más ganas (mayor win rate), entre los enfrentados en al menos 3 partidas.'}
            </InfoTooltip>
          }
        />
        <MatchupCol
          title={<><Icon name="trendingDown" className="w-4 h-4 text-red-400" />{t('Peores matchups')}</>}
          rows={worst}
          delay={80}
          onPick={onPickOpponent}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'Opposing Pokémon that give you the most trouble (lowest win rate), among those faced in at least 3 games.'
                : 'Pokémon rivales que más te cuestan (menor win rate), entre los enfrentados en al menos 3 partidas.'}
            </InfoTooltip>
          }
        />
        <MatchupCol
          title={<><Icon name="users" className="w-4 h-4 text-poke-pink" />{t('Más enfrentados')}</>}
          rows={most}
          delay={160}
          onPick={onPickOpponent}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'The opposing Pokémon you have run into the most, regardless of result — a picture of what you face day to day.'
                : 'Los Pokémon rivales con los que más te has cruzado, sin importar el resultado: una foto de lo que te encuentras a diario.'}
            </InfoTooltip>
          }
        />
        <MatchupCol
          title={<><Icon name="user" className="w-4 h-4 text-gray-400" />{t('Menos enfrentados')}</>}
          rows={least}
          delay={240}
          onPick={onPickOpponent}
          info={
            <InfoTooltip label={t('Más información')}>
              {lang === 'en'
                ? 'The opposing Pokémon you have faced the fewest times — rare matchups where your sample is still small.'
                : 'Los Pokémon rivales que menos veces has enfrentado: matchups raros donde tu muestra aún es pequeña.'}
            </InfoTooltip>
          }
        />
      </div>
    </>
  );
}

function MatchupCol({ title, rows, delay = 0, info, onPick }) {
  return (
    <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="font-semibold mb-3 text-sm flex items-center gap-1.5">{title}{info}</h3>
      {rows.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">—</p> : (
        <div className="space-y-1.5">
          {rows.map((r, i) => { const wr = pct(r.wins, r.games); return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick?.(r.id)}
              className="w-full text-left flex items-center gap-2 animate-fade-in-up rounded-lg px-1.5 -mx-1.5 py-0.5 hover:bg-poke-accent/30 transition-colors"
              style={{ animationDelay: `${delay + i * 50}ms` }}
            >
              <span className="text-xs text-gray-500 w-4">#{i + 1}</span>
              <PokemonSprite speciesId={r.id} className="w-7 h-7 object-contain shrink-0" />
              <span className="text-sm truncate flex-1">{spName(r.id)}</span>
              <div className="text-right">
                <div className={`text-sm font-semibold ${wrColor(wr)}`}>{wr}%</div>
                <div className="text-xs text-gray-500">{r.wins}/{r.games}</div>
              </div>
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}

// ── Uso de movimientos (por Pokémon) ────────────────────────────────────────
function MoveUsage({ rows, lang, t }) {
  if (rows.length === 0) return <div className="panel p-8 text-center text-gray-400">{t('Sin datos de movimientos todavía.')}</div>;
  return (
    <>
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">
        {t('Uso de movimientos')}
        <InfoTooltip label={t('Más información')} side="bottom">
          {lang === 'en'
            ? 'For each of your Pokémon, the share of games in which it used each move (a pie per Pokémon). Reveals your real move choices across replays — useful for spotting predictable or unused options.'
            : 'Para cada uno de tus Pokémon, el porcentaje de partidas en que usó cada movimiento (un gráfico por Pokémon). Revela tus elecciones reales de movimientos en las repeticiones, útil para detectar opciones predecibles o que no usas.'}
        </InfoTooltip>
      </h3>
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
    </>
  );
}

function MovePie({ mon, lang }) {
  const [hi, setHi] = useState(null);
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
function MonGrid({ title, mons, total, info }) {
  return (
    <div className="panel p-4 animate-fade-in-up">
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">{title}{info}</h3>
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
