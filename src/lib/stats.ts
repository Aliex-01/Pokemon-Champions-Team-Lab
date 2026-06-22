import type { EvSpread, EvMode } from '../types/pokemon';

const NATURE_MODS: Record<string, Partial<EvSpread>> = {
  Adamant: { spa: -1, atk: 1 },
  Bold: { atk: -1, def: 1 },
  Brave: { spe: -1, atk: 1 },
  Calm: { atk: -1, spd: 1 },
  Careful: { spa: -1, spd: 1 },
  Gentle: { def: -1, spd: 1 },
  Hasty: { def: -1, spe: 1 },
  Impish: { spa: -1, def: 1 },
  Jolly: { spa: -1, spe: 1 },
  Lax: { spd: -1, def: 1 },
  Lonely: { def: -1, atk: 1 },
  Mild: { def: -1, spa: 1 },
  Modest: { atk: -1, spa: 1 },
  Naive: { spd: -1, spe: 1 },
  Naughty: { atk: 1, spd: -1 },
  Quiet: { spe: -1, spa: 1 },
  Rash: { spd: -1, spa: 1 },
  Relaxed: { spe: -1, def: 1 },
  Sassy: { spe: -1, spd: 1 },
  Timid: { atk: -1, spe: 1 },
};

const STAT_LABELS: Record<keyof EvSpread, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export const CHAMPIONS_LEVEL = 50;
export const CHAMPIONS_IV = 31;

export const MAX_EVS = 508;
export const MAX_SINGLE_EV = 252;
export const MAX_STAT_POINTS = 32;
export const MAX_TOTAL_STAT_POINTS = 66;

export function getNatureMod(nature: string, stat: keyof EvSpread): number {
  return NATURE_MODS[nature]?.[stat] ?? 0;
}

export function formatNatureLabel(nature: string, displayName = nature): string {
  const mods = NATURE_MODS[nature];
  if (!mods) return displayName;

  let plus = '';
  let minus = '';
  for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const mod = mods[stat];
    if (mod && mod > 0) plus = STAT_LABELS[stat];
    if (mod && mod < 0) minus = STAT_LABELS[stat];
  }
  if (!plus && !minus) return displayName;
  return `${displayName} (+${plus} | -${minus})`;
}

export function getStatNatureClass(nature: string, stat: keyof EvSpread): string {
  if (stat === 'hp') return '';
  const mod = getNatureMod(nature, stat);
  if (mod > 0) return 'bg-green-900/35 ring-1 ring-green-700/40';
  if (mod < 0) return 'bg-red-900/35 ring-1 ring-red-700/40';
  return '';
}

function applyNature(val: number, natureMod: number): number {
  if (natureMod > 0) return Math.floor(val * 1.1);
  if (natureMod < 0) return Math.floor(val * 0.9);
  return val;
}

function calcTraditionalStat(
  base: number, iv: number, ev: number, level: number, natureMod: number
): number {
  const val = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return applyNature(val, natureMod);
}

function calcTraditionalHp(base: number, iv: number, ev: number, level: number): number {
  if (base === 1) return 1;
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcAllStats(
  baseStats: EvSpread,
  evs: EvSpread,
  ivs: EvSpread,
  nature: string,
  level: number,
  evMode: EvMode = 'champions'
): EvSpread {
  const stats: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  // Champions es la mecánica estándar con presupuesto reducido (1 SP = 8 EV) e IVs
  // fijos a 31, así que convertimos a EVs tradicionales y usamos la misma fórmula.
  const effectiveEvs = evMode === 'champions' ? toTraditionalEvs(evs) : evs;
  const effectiveIvs = evMode === 'champions'
    ? { hp: CHAMPIONS_IV, atk: CHAMPIONS_IV, def: CHAMPIONS_IV, spa: CHAMPIONS_IV, spd: CHAMPIONS_IV, spe: CHAMPIONS_IV }
    : ivs;

  stats.hp = calcTraditionalHp(baseStats.hp, effectiveIvs.hp, effectiveEvs.hp, level);
  for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
    stats[stat] = calcTraditionalStat(
      baseStats[stat], effectiveIvs[stat], effectiveEvs[stat], level, getNatureMod(nature, stat)
    );
  }

  return stats;
}

export function totalInvestment(evs: EvSpread, evMode: EvMode): number {
  return evMode === 'champions' ? totalStatPoints(evs) : totalEvs(evs);
}

export function maxInvestment(evMode: EvMode): number {
  return evMode === 'champions' ? MAX_TOTAL_STAT_POINTS : MAX_EVS;
}

export function maxSingleStat(evMode: EvMode): number {
  return evMode === 'champions' ? MAX_STAT_POINTS : MAX_SINGLE_EV;
}

export function totalEvs(evs: EvSpread): number {
  return evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
}

export function totalStatPoints(evs: EvSpread): number {
  return totalEvs(evs);
}

/** 1 SP ≈ 8 EV (champdex): 32 SP ↔ 252 EV. Ej. 4 SP → 32 EV. */
export function statPointsToEv(sp: number): number {
  if (sp <= 0) return 0;
  if (sp >= MAX_STAT_POINTS) return MAX_SINGLE_EV;
  return sp * 8;
}

export function evToStatPoints(ev: number): number {
  if (ev <= 0) return 0;
  if (ev >= MAX_SINGLE_EV) return MAX_STAT_POINTS;
  return Math.round(ev / 8);
}

/** Convierte un reparto de stat points (Champions) a EVs tradicionales, por stat. */
export function toTraditionalEvs(evs: EvSpread): EvSpread {
  return {
    hp: statPointsToEv(evs.hp),
    atk: statPointsToEv(evs.atk),
    def: statPointsToEv(evs.def),
    spa: statPointsToEv(evs.spa),
    spd: statPointsToEv(evs.spd),
    spe: statPointsToEv(evs.spe),
  };
}

export function convertInvestment(evs: EvSpread, from: EvMode, to: EvMode): EvSpread {
  if (from === to) return { ...evs };
  const stats: (keyof EvSpread)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const converted: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const stat of stats) {
    converted[stat] =
      to === 'traditional' ? statPointsToEv(evs[stat]) : evToStatPoints(evs[stat]);
  }
  return clampInvestment(converted, to);
}

export function clampInvestment(evs: EvSpread, evMode: EvMode): EvSpread {
  const maxSingle = maxSingleStat(evMode);
  const clamped: EvSpread = {
    hp: Math.min(maxSingle, Math.max(0, evs.hp)),
    atk: Math.min(maxSingle, Math.max(0, evs.atk)),
    def: Math.min(maxSingle, Math.max(0, evs.def)),
    spa: Math.min(maxSingle, Math.max(0, evs.spa)),
    spd: Math.min(maxSingle, Math.max(0, evs.spd)),
    spe: Math.min(maxSingle, Math.max(0, evs.spe)),
  };

  let total = totalInvestment(clamped, evMode);
  const max = maxInvestment(evMode);
  if (total <= max) return clamped;

  const order: (keyof EvSpread)[] = ['spe', 'spa', 'spd', 'def', 'atk', 'hp'];
  const result = { ...clamped };
  for (const stat of order) {
    while (total > max && result[stat] > 0) {
      result[stat] -= evMode === 'champions' ? 1 : 4;
      total = totalInvestment(result, evMode);
    }
  }
  return result;
}

export function formatEvs(evs: EvSpread, evMode: EvMode = 'traditional'): string {
  const suffix = evMode === 'champions' ? ' SP' : '';
  const parts: string[] = [];
  if (evs.hp) parts.push(`${evs.hp}${suffix} HP`);
  if (evs.atk) parts.push(`${evs.atk}${suffix} Atk`);
  if (evs.def) parts.push(`${evs.def}${suffix} Def`);
  if (evs.spa) parts.push(`${evs.spa}${suffix} SpA`);
  if (evs.spd) parts.push(`${evs.spd}${suffix} SpD`);
  if (evs.spe) parts.push(`${evs.spe}${suffix} Spe`);
  return parts.length ? parts.join(' / ') : evMode === 'champions' ? '0 SP' : '0 EVs';
}

export interface SpeedEntry {
  name: string;
  speed: number;
  nature: string;
  evs: string;
  isTeam: boolean;
  speciesId: string;
}

export function buildSpeedTier(
  teamEntries: { name: string; speed: number; nature: string; evs: EvSpread; speciesId: string }[],
  metaEntries: { name: string; baseSpeed: number; commonSpreads?: { nature: string; evs: EvSpread; speed: number }[] }[]
): SpeedEntry[] {
  const entries: SpeedEntry[] = [];

  for (const t of teamEntries) {
    if (!t.name) continue;
    entries.push({
      name: t.name,
      speed: t.speed,
      nature: t.nature,
      evs: formatEvs(t.evs, 'champions'),
      isTeam: true,
      speciesId: t.speciesId,
    });
  }

  for (const m of metaEntries) {
    if (m.commonSpreads?.length) {
      for (const spread of m.commonSpreads) {
        entries.push({
          name: m.name,
          speed: spread.speed,
          nature: spread.nature,
          evs: formatEvs(spread.evs, 'champions'),
          isTeam: false,
          speciesId: m.name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        });
      }
    } else {
      entries.push({
        name: m.name,
        speed: m.baseSpeed,
        nature: '—',
        evs: 'Base',
        isTeam: false,
        speciesId: m.name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      });
    }
  }

  return entries.sort((a, b) => b.speed - a.speed);
}
