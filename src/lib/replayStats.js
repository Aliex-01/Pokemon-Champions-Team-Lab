import { baseSpeciesId, toID } from './replay';

/** Calcula las métricas agregadas a partir de las partidas guardadas. */
export function computeStats(matches) {
  const decided = matches.filter((m) => m.win !== null);
  const wins = decided.filter((m) => m.win === true).length;
  const losses = decided.length - wins;

  const byTeamMap = new Map();
  const oppMap = new Map();
  const leadMap = new Map();
  const bringMap = new Map();

  for (const m of matches) {
    // Win-rate por equipo (autodetectado).
    const key = m.teamId ?? '__none__';
    const name = m.teamName ?? 'Sin asociar';
    const ts = byTeamMap.get(key) ?? { key, name, wins: 0, total: 0 };
    if (m.win !== null) { ts.total++; if (m.win) ts.wins++; }
    byTeamMap.set(key, ts);

    // Pokémon rival enfrentados (equipo del rival, por especie base).
    for (const id of m.oppTeam) {
      const b = baseSpeciesId(id);
      oppMap.set(b, (oppMap.get(b) ?? 0) + 1);
    }

    // Bring-rate de tus Pokémon.
    for (const id of m.myBrought) {
      const b = baseSpeciesId(id);
      bringMap.set(b, (bringMap.get(b) ?? 0) + 1);
    }

    // Win-rate por dupla de leads tuyos.
    if (m.myLeads.length && m.win !== null) {
      const ids = [...m.myLeads].map(baseSpeciesId).sort();
      const lk = ids.join('+');
      const ls = leadMap.get(lk) ?? { ids, wins: 0, total: 0 };
      ls.total++; if (m.win) ls.wins++;
      leadMap.set(lk, ls);
    }
  }

  return {
    total: matches.length,
    wins,
    losses,
    winrate: decided.length ? Math.round((wins / decided.length) * 1000) / 10 : 0,
    byTeam: [...byTeamMap.values()].sort((a, b) => b.total - a.total),
    topOpponents: [...oppMap.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    leads: [...leadMap.values()].sort((a, b) => b.total - a.total).slice(0, 8),
    bring: [...bringMap.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 12),
  };
}

export function computeUsage(matches) {
  const map = new Map();
  const get = (id) => {
    let u = map.get(id);
    if (!u) { u = { id, brought: 0, broughtWins: 0, broughtDec: 0, led: 0, ledWins: 0, ledDec: 0, mega: 0, megaWins: 0, megaDec: 0 }; map.set(id, u); }
    return u;
  };
  for (const m of matches) {
    const dec = m.win !== null, win = m.win === true;
    const led = new Set(m.myLeads.map(baseSpeciesId));
    const megaId = m.myMega ? baseSpeciesId(m.myMega) : null;
    for (const raw of new Set(m.myBrought.map(baseSpeciesId))) {
      const u = get(raw);
      u.brought++;
      if (dec) { u.broughtDec++; if (win) u.broughtWins++; }
      if (led.has(raw)) { u.led++; if (dec) { u.ledDec++; if (win) u.ledWins++; } }
    }
    if (megaId) {
      const u = get(megaId);
      u.mega++;
      if (dec) { u.megaDec++; if (win) u.megaWins++; }
    }
  }
  return [...map.values()].sort((a, b) => b.brought - a.brought);
}

/** Todas las duplas de leads tuyas con su win-rate (para "más usados" y "mejores"). */
export function computeLeads(matches) {
  const map = new Map();
  for (const m of matches) {
    if (m.myLeads.length === 0 || m.win === null) continue;
    const ids = [...m.myLeads].map(baseSpeciesId).sort();
    const k = ids.join('+');
    const ls = map.get(k) ?? { ids, wins: 0, total: 0 };
    ls.total++; if (m.win) ls.wins++;
    map.set(k, ls);
  }
  return [...map.values()];
}

export function computeMatchups(matches) {
  const map = new Map();
  for (const m of matches) {
    if (m.win === null) continue;
    const seen = new Set(m.oppTeam.map(baseSpeciesId)); // 1 vez por partida aunque salga 2x
    for (const id of seen) {
      const x = map.get(id) ?? { id, games: 0, wins: 0, losses: 0 };
      x.games++;
      if (m.win) x.wins++; else x.losses++;
      map.set(id, x);
    }
  }
  return [...map.values()].sort((a, b) => b.games - a.games);
}

export function computeMoveUsageByMon(matches) {
  const byMon = new Map();
  for (const m of matches) {
    for (const [monId, moves] of Object.entries(m.myMovesByMon ?? {})) {
      const id = baseSpeciesId(monId);
      const mv = byMon.get(id) ?? new Map();
      for (const [name, n] of Object.entries(moves)) mv.set(name, (mv.get(name) ?? 0) + n);
      byMon.set(id, mv);
    }
  }
  return [...byMon.entries()]
    .map(([id, mv]) => {
      const moves = [...mv.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
      return { id, total: moves.reduce((s, x) => s + x.count, 0), moves };
    })
    .sort((a, b) => b.total - a.total);
}

// Ventana para unir partidas de un Bo3/Bo5 que no traen id de set en el log:
// mismas dos personas, mismo equipo tuyo y jugadas seguidas (≤ 3 h).
const SET_WINDOW = 3 * 3600;
const teamSig = (ids) => [...new Set(ids.map(baseSpeciesId))].sort().join(',');

export function groupSets(matches) {
  const map = new Map();

  // Las que sí traen id de set se agrupan por él directamente.
  const withId = matches.filter((m) => m.setId);
  const without = matches.filter((m) => !m.setId).sort((a, b) => a.uploadtime - b.uploadtime);
  for (const m of withId) {
    const key = `set-${m.setId}`;
    (map.get(key) ?? map.set(key, []).get(key)).push(m);
  }

  // Fallback: agrupa por rival + tu equipo + cercanía temporal.
  const lastByKey = new Map();
  for (const m of without) {
    const sig = `${toID(m.oppName)}|${teamSig(m.myTeam)}`;
    const prev = lastByKey.get(sig);
    let key;
    if (prev && m.uploadtime - prev.time <= SET_WINDOW) {
      key = prev.key;
    } else {
      key = `auto-${m.id}`;
    }
    (map.get(key) ?? map.set(key, []).get(key)).push(m);
    lastByKey.set(sig, { key, time: m.uploadtime });
  }
  const sets = [];
  for (const [key, games] of map) {
    games.sort((a, b) => (a.gameNum ?? 0) - (b.gameNum ?? 0) || a.uploadtime - b.uploadtime);
    const myWins = games.filter((g) => g.win === true).length;
    const oppWins = games.filter((g) => g.win === false).length;
    const result = myWins === oppWins ? (myWins === 0 ? null : 'tie') : myWins > oppWins ? 'win' : 'loss';
    sets.push({
      key,
      oppName: games[0].oppName,
      bestOf: games[0].bestOf,
      games,
      myWins,
      oppWins,
      result,
      uploadtime: Math.max(...games.map((g) => g.uploadtime)),
    });
  }
  return sets.sort((a, b) => b.uploadtime - a.uploadtime);
}

/** Casa el equipo revelado con un equipo guardado (mejor solape de especies base). */
export function matchSavedTeam(
  myTeamIds,
  teams,
) {
  if (myTeamIds.length === 0) return null;
  const mine = new Set(myTeamIds.map(baseSpeciesId));
  let best = null;
  for (const t of teams) {
    const ids = t.pokemon.map((p) => p.speciesId).filter(Boolean);
    if (ids.length === 0) continue;
    const score = ids.filter((id) => mine.has(baseSpeciesId(id))).length;
    if (!best || score > best.score) best = { id: t.id, name: t.name, score };
  }
  // Umbral: al menos 4 de 6 coinciden para considerarlo el mismo equipo.
  return best && best.score >= 4 ? { id: best.id, name: best.name } : null;
}
