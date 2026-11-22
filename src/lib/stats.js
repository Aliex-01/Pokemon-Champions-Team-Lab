const NATURE_MODS = {
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

const STAT_LABELS = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export const CHAMPIONS_LEVEL = 50;
export const CHAMPIONS_IV = 31;

export const MAX_EVS = 508;
export const MAX_SINGLE_EV = 252;
export const MAX_STAT_POINTS = 32;
export const MAX_TOTAL_STAT_POINTS = 66;

export function getNatureMod(nature, stat) {
  return NATURE_MODS[nature]?.[stat] ?? 0;
}

export function formatNatureLabel(nature, displayName = nature) {
  const mods = NATURE_MODS[nature];
  if (!mods) return displayName;

  let plus = '';
  let minus = '';
  for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
    const mod = mods[stat];
    if (mod && mod > 0) plus = STAT_LABELS[stat];
    if (mod && mod < 0) minus = STAT_LABELS[stat];
  }
  if (!plus && !minus) return displayName;
  return `${displayName} (+${plus} | -${minus})`;
}

export function getStatNatureClass(nature, stat) {
  if (stat === 'hp') return '';
  const mod = getNatureMod(nature, stat);
  if (mod > 0) return 'bg-green-900/35 ring-1 ring-green-700/40';
  if (mod < 0) return 'bg-red-900/35 ring-1 ring-red-700/40';
  return '';
}

function applyNature(val, natureMod) {
  if (natureMod > 0) return Math.floor(val * 1.1);
  if (natureMod < 0) return Math.floor(val * 0.9);
  return val;
}

function calcTraditionalStat(
  base, iv, ev, level, natureMod
) {
  const val = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return applyNature(val, natureMod);
}

function calcTraditionalHp(base, iv, ev, level) {
  if (base === 1) return 1;
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcAllStats(
  baseStats,
  evs,
  ivs,
  nature,
  level,
  evMode = 'champions'
) {
  const stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  // Champions es la mecánica estándar con presupuesto reducido (1 SP = 8 EV) e IVs
  // fijos a 31, así que convertimos a EVs tradicionales y usamos la misma fórmula.
  const effectiveEvs = evMode === 'champions' ? toTraditionalEvs(evs) : evs;
  const effectiveIvs = evMode === 'champions'
    ? { hp: CHAMPIONS_IV, atk: CHAMPIONS_IV, def: CHAMPIONS_IV, spa: CHAMPIONS_IV, spd: CHAMPIONS_IV, spe: CHAMPIONS_IV }
    : ivs;

  stats.hp = calcTraditionalHp(baseStats.hp, effectiveIvs.hp, effectiveEvs.hp, level);
  for (const stat of ['atk', 'def', 'spa', 'spd', 'spe']) {
    stats[stat] = calcTraditionalStat(
      baseStats[stat], effectiveIvs[stat], effectiveEvs[stat], level, getNatureMod(nature, stat)
    );
  }

  return stats;
}

export function totalInvestment(evs, evMode) {
  return evMode === 'champions' ? totalStatPoints(evs) : totalEvs(evs);
}

export function maxInvestment(evMode) {
  return evMode === 'champions' ? MAX_TOTAL_STAT_POINTS : MAX_EVS;
}

export function maxSingleStat(evMode) {
  return evMode === 'champions' ? MAX_STAT_POINTS : MAX_SINGLE_EV;
}

export function totalEvs(evs) {
  return evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
}

export function totalStatPoints(evs) {
  return totalEvs(evs);
}

/** 1 SP ≈ 8 EV (champdex): 32 SP ↔ 252 EV. Ej. 4 SP → 32 EV. */
export function statPointsToEv(sp) {
  if (sp <= 0) return 0;
  if (sp >= MAX_STAT_POINTS) return MAX_SINGLE_EV;
  return sp * 8;
}

export function evToStatPoints(ev) {
  if (ev <= 0) return 0;
  if (ev >= MAX_SINGLE_EV) return MAX_STAT_POINTS;
  return Math.round(ev / 8);
}

/** Convierte un reparto de stat points (Champions) a EVs tradicionales, por stat. */
export function toTraditionalEvs(evs) {
  return {
    hp: statPointsToEv(evs.hp),
    atk: statPointsToEv(evs.atk),
    def: statPointsToEv(evs.def),
    spa: statPointsToEv(evs.spa),
    spd: statPointsToEv(evs.spd),
    spe: statPointsToEv(evs.spe),
  };
}

export function convertInvestment(evs, from, to) {
  if (from === to) return { ...evs };
  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const converted = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const stat of stats) {
    converted[stat] =
      to === 'traditional' ? statPointsToEv(evs[stat]) : evToStatPoints(evs[stat]);
  }
  return clampInvestment(converted, to);
}

export function clampInvestment(evs, evMode) {
  const maxSingle = maxSingleStat(evMode);
  const clamped = {
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

  const order = ['spe', 'spa', 'spd', 'def', 'atk', 'hp'];
  const result = { ...clamped };
  for (const stat of order) {
    while (total > max && result[stat] > 0) {
      result[stat] -= evMode === 'champions' ? 1 : 4;
      total = totalInvestment(result, evMode);
    }
  }
  return result;
}

export function formatEvs(evs, evMode = 'traditional') {
  const suffix = evMode === 'champions' ? ' SP' : '';
  const parts = [];
  if (evs.hp) parts.push(`${evs.hp}${suffix} HP`);
  if (evs.atk) parts.push(`${evs.atk}${suffix} Atk`);
  if (evs.def) parts.push(`${evs.def}${suffix} Def`);
  if (evs.spa) parts.push(`${evs.spa}${suffix} SpA`);
  if (evs.spd) parts.push(`${evs.spd}${suffix} SpD`);
  if (evs.spe) parts.push(`${evs.spe}${suffix} Spe`);
  return parts.length ? parts.join(' / ') : evMode === 'champions' ? '0 SP' : '0 EVs';
}

export function buildSpeedTier(
  teamEntries,
  metaEntries
) {
  const entries = [];

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
