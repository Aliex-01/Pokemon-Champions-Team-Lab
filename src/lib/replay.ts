import { getSpecies, getSpeciesByName, getMegaByStone } from './championsData';

// ── Tipos ──────────────────────────────────────────────────────────────────

export type Side = 'p1' | 'p2';

/** Partida ya parseada y resumida (lo que guardamos en localStorage). */
export interface MatchRecord {
  id: string;            // id del replay de Showdown
  format: string;
  uploadtime: number;    // epoch (s) que da Showdown
  addedAt: string;       // ISO en que lo importaste
  me: Side;
  myName: string;
  oppName: string;
  win: boolean | null;   // null = empate / sin ganador
  turns: number;
  myTeam: string[];       // ids de especie (preview, hasta 6)
  oppTeam: string[];
  myLeads: string[];      // ids de especie (hasta 2)
  oppLeads: string[];
  myBrought: string[];    // ids de especie que sacaste
  oppBrought: string[];
  myTera: string | null;  // especie que teracristalizó
  oppTera: string | null;
  myMega: string | null;  // especie que mega-evolucionó (o null)
  oppMega: string | null;
  teamId: string | null;   // equipo guardado autodetectado
  teamName: string | null;
  // Movimientos que usaste, por Pokémon: { especieBase: { movimiento: veces } }.
  myMovesByMon: Record<string, Record<string, number>>;
  setId: string | null;    // id del set Bo3/Bo5 al que pertenece (o null)
  gameNum: number | null;  // nº de partida dentro del set
  bestOf: number | null;   // 3 / 5 …
}

interface RawReplay {
  id: string;
  format: string;
  players: string[];
  log: string;
  uploadtime: number;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Normaliza como hace Showdown (toID): minúsculas y solo alfanumérico. */
export const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resuelve un nombre de especie de Showdown a su id en nuestra base (o null). */
function resolveSpecies(name: string): string | null {
  return getSpeciesByName(name)?.id ?? null;
}

/** Id de la especie base (las megas/formas comparten base para casar equipos). */
export function baseSpeciesId(id: string): string {
  return getSpecies(id)?.baseSpeciesId ?? id;
}

/** Extrae el id del replay de una URL o de un id pegado directamente. */
export function parseReplayId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Quita el dominio y deja el último segmento; recorta query/hash/password.
  const seg = raw.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0].replace(/\/$/, '');
  const id = seg.split('/').pop() ?? '';
  return /^[a-z0-9]+-[a-z0-9-]+$/i.test(id) ? id : null;
}

// ── Fetch + parseo ───────────────────────────────────────────────────────────

export async function fetchReplay(id: string): Promise<RawReplay> {
  // El servidor de replays envía Access-Control-Allow-Origin: * → fetch directo.
  const res = await fetch(`https://replay.pokemonshowdown.com/${id}.json`);
  if (!res.ok) throw new Error(`No se encontró la repetición (${res.status}).`);
  return res.json();
}

/** Nombre de especie de un campo "Species, L50, M" → "Species". */
const speciesField = (field: string) => field.split(',')[0].trim();

/**
 * Parsea el log de protocolo de Showdown y construye un MatchRecord.
 * @param username tu usuario de Showdown (para saber qué lado eres).
 */
export function parseReplay(raw: RawReplay, username: string): MatchRecord {
  const lines = raw.log.split('\n');
  const meId = toID(username);

  const names: Record<Side, string> = { p1: raw.players[0] ?? 'P1', p2: raw.players[1] ?? 'P2' };
  const team: Record<Side, string[]> = { p1: [], p2: [] };
  const brought: Record<Side, string[]> = { p1: [], p2: [] };
  const leads: Record<Side, string[]> = { p1: [], p2: [] };
  const tera: Record<Side, string | null> = { p1: null, p2: null };
  const mega: Record<Side, string | null> = { p1: null, p2: null };
  // Movimientos por Pokémon y lado: side → especieBase → movimiento → veces.
  const movesByMon: Record<Side, Record<string, Record<string, number>>> = { p1: {}, p2: {} };
  // Especie activa por posición (p1a, p1b, p2a, p2b) para resolver tera/mega/movimientos.
  const active: Record<string, string> = {};

  let started = false;     // tras |start, antes de |turn|1 → leads
  let turns = 0;
  let winnerName: string | null = null;
  let tie = false;
  let setId: string | null = null;
  let gameNum: number | null = null;
  let bestOf: number | null = null;

  const push = (arr: string[], id: string | null) => {
    if (id && !arr.includes(id)) arr.push(id);
  };

  for (const line of lines) {
    if (line[0] !== '|') continue;
    const parts = line.slice(1).split('|');
    const cmd = parts[0];

    if (cmd === 'player') {
      const side = parts[1] as Side;
      if ((side === 'p1' || side === 'p2') && parts[2]) names[side] = parts[2];
    } else if (cmd === 'poke') {
      const side = parts[1] as Side;
      push(team[side], resolveSpecies(speciesField(parts[2] ?? '')));
    } else if (cmd === 'start') {
      started = true;
    } else if (cmd === 'turn') {
      started = false;
      turns = Math.max(turns, parseInt(parts[1], 10) || turns);
    } else if (cmd === 'switch' || cmd === 'drag') {
      // parts[1] = "p1a: Apodo", parts[2] = "Species, L50, M"
      const pos = parts[1].slice(0, 3);          // p1a / p2b
      const side = pos.slice(0, 2) as Side;
      const id = resolveSpecies(speciesField(parts[2] ?? ''));
      if (id) {
        active[pos] = id;
        push(brought[side], id);
        if (started && cmd === 'switch') push(leads[side], id);
      }
    } else if (cmd === 'move') {
      const pos = parts[1].slice(0, 3);
      const side = pos.slice(0, 2) as Side;
      const name = parts[2];
      const mon = active[pos] ? baseSpeciesId(active[pos]) : null;
      if ((side === 'p1' || side === 'p2') && name && mon) {
        const byMon = movesByMon[side];
        (byMon[mon] ??= {})[name] = (byMon[mon][name] ?? 0) + 1;
      }
    } else if (cmd === '-terastallize') {
      const pos = parts[1].slice(0, 3);
      const side = pos.slice(0, 2) as Side;
      tera[side] = active[pos] ?? tera[side];
    } else if (cmd === 'detailschange' || cmd === 'replace' || cmd === '-formechange') {
      // Cambio de forma en combate (incl. megaevolución → "X-Mega").
      const pos = parts[1].slice(0, 3);
      const side = pos.slice(0, 2) as Side;
      const changed = resolveSpecies(speciesField(parts[2] ?? ''));
      if ((side === 'p1' || side === 'p2') && changed) {
        active[pos] = changed;
        if (getSpecies(changed)?.isMega) mega[side] = changed;
      }
    } else if (cmd === '-mega') {
      // |-mega|p1a: Heracross|Heracross|Heracronite  → resolvemos la mega por la piedra.
      const pos = parts[1].slice(0, 3);
      const side = pos.slice(0, 2) as Side;
      const byStone = getMegaByStone(parts[3] ?? '')?.id;
      const id = byStone ?? active[pos] ?? null;
      if ((side === 'p1' || side === 'p2') && id) { mega[side] = id; if (byStone) active[pos] = byStone; }
    } else if (cmd === 'uhtml' && parts[1] === 'bestof') {
      // |uhtml|bestof|<h2><strong>Game 5</strong> of <a href="/game-bestof5-<id>">…
      const html = parts.slice(2).join('|');
      gameNum = parseInt(html.match(/Game (\d+)/)?.[1] ?? '', 10) || null;
      bestOf = parseInt(html.match(/bestof(\d+)/)?.[1] ?? '', 10) || null;
      setId = html.match(/game-bestof\d+-([a-z0-9-]+)/)?.[1] ?? null;
    } else if (cmd === 'win') {
      winnerName = parts[1] ?? null;
    } else if (cmd === 'tie') {
      tie = true;
    }
  }

  // ¿Qué lado soy? Por usuario; si no casa, asumo p1 (el importador avisará).
  const me: Side = toID(names.p2) === meId ? 'p2' : 'p1';
  const opp: Side = me === 'p1' ? 'p2' : 'p1';

  const win = tie ? null : winnerName == null ? null : toID(winnerName) === toID(names[me]);

  return {
    id: raw.id,
    format: raw.format,
    uploadtime: raw.uploadtime,
    addedAt: new Date().toISOString(),
    me,
    myName: names[me],
    oppName: names[opp],
    win,
    turns,
    myTeam: team[me],
    oppTeam: team[opp],
    myLeads: leads[me].slice(0, 2),
    oppLeads: leads[opp].slice(0, 2),
    myBrought: brought[me],
    oppBrought: brought[opp],
    myTera: tera[me],
    oppTera: tera[opp],
    myMega: mega[me],
    oppMega: mega[opp],
    teamId: null,
    teamName: null,
    myMovesByMon: movesByMon[me],
    setId,
    gameNum,
    bestOf,
  };
}

/** ¿El usuario aparece en este replay? (para avisar si el nick no casa). */
export function userInReplay(raw: RawReplay, username: string): boolean {
  const id = toID(username);
  return raw.players.some((p) => toID(p) === id);
}
