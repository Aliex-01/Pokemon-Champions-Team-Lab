import type { PokemonBuildData, UsageStat } from '../types/pokemon';

const FORMAT_IDS = [
  'gen9championsvgc2026regmb',
  'gen9championsvgc2026regma',
  'gen9championsvgc2026regmabo3',
  'gen9championsvgc2026regma',
] as const;

const RATING = '1760';

async function findLatestStatsMonth(): Promise<string> {
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    try {
      const res = await fetch(`https://www.smogon.com/stats/${month}/`);
      if (res.ok) return month;
    } catch { /* try previous */ }
  }
  return '2026-05';
}

async function fetchFormatId(month: string): Promise<string> {
  for (const format of FORMAT_IDS) {
    try {
      const res = await fetch(
        `https://www.smogon.com/stats/${month}/${format}-${RATING}.txt`,
        { mode: 'cors' }
      );
      if (res.ok) return format;
    } catch { /* next */ }
  }
  return 'gen9championsvgc2026regma';
}

export async function fetchUsageStats(): Promise<{ stats: UsageStat[]; month: string; format: string }> {
  const month = await findLatestStatsMonth();
  const format = await fetchFormatId(month);
  const url = `https://www.smogon.com/stats/${month}/${format}-${RATING}.txt`;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('No se pudieron cargar las estadísticas de uso');
  const text = await res.text();
  const stats = parseUsageTxt(text);
  return { stats, month, format };
}

function parseUsageTxt(text: string): UsageStat[] {
  const lines = text.split('\n');
  const stats: UsageStat[] = [];
  for (const line of lines) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)%/);
    if (match) {
      stats.push({
        rank: parseInt(match[1], 10),
        name: match[2].trim(),
        usage: parseFloat(match[3]),
      });
    }
  }
  return stats;
}

export async function fetchPokemonBuild(pokemonName: string): Promise<PokemonBuildData | null> {
  const month = await findLatestStatsMonth();
  const format = await fetchFormatId(month);
  const url = `https://www.smogon.com/stats/${month}/moveset/${format}-${RATING}.txt`;

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const text = await res.text();
    return parseMovesetTxt(text, pokemonName);
  } catch {
    return null;
  }
}

function parseMovesetTxt(text: string, pokemonName: string): PokemonBuildData | null {
  const sections = text.split('\n\n');
  const normalized = pokemonName.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const section of sections) {
    const headerMatch = section.match(/^(.+?) \(([\d.]+)%\)/m);
    if (!headerMatch) continue;
    const name = headerMatch[1].trim();
    if (name.toLowerCase().replace(/[^a-z0-9]/g, '') !== normalized) continue;

    const usage = parseFloat(headerMatch[2]);
    const abilities: { name: string; pct: number }[] = [];
    const items: { name: string; pct: number }[] = [];
    const moves: { name: string; pct: number }[] = [];
    const spreads: { nature: string; evs: string; pct: number }[] = [];

    let currentSection = '';
    for (const line of section.split('\n')) {
      if (line.startsWith('Abilities')) currentSection = 'abilities';
      else if (line.startsWith('Items')) currentSection = 'items';
      else if (line.startsWith('Moves')) currentSection = 'moves';
      else if (line.startsWith('Spreads') || line.includes('Nature')) currentSection = 'spreads';
      else {
        const pctMatch = line.match(/^(.+?)\s+([\d.]+)%/);
        if (pctMatch) {
          const entry = { name: pctMatch[1].trim(), pct: parseFloat(pctMatch[2]) };
          if (currentSection === 'abilities') abilities.push(entry);
          else if (currentSection === 'items') items.push(entry);
          else if (currentSection === 'moves') moves.push(entry);
        }
        const spreadMatch = line.match(/^(\w+):\s*(.+?)\s+([\d.]+)%/);
        if (spreadMatch) {
          spreads.push({ nature: spreadMatch[1], evs: spreadMatch[2], pct: parseFloat(spreadMatch[3]) });
        }
      }
    }

    return { name, usage, abilities, items, moves, spreads };
  }
  return null;
}

export async function fetchAllBuilds(topN = 50): Promise<Map<string, PokemonBuildData>> {
  const month = await findLatestStatsMonth();
  const format = await fetchFormatId(month);
  const url = `https://www.smogon.com/stats/${month}/moveset/${format}-${RATING}.txt`;
  const builds = new Map<string, PokemonBuildData>();

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return builds;
    const text = await res.text();
    const sections = text.split('\n\n').slice(0, topN * 3);

    for (const section of sections) {
      const headerMatch = section.match(/^(.+?) \(([\d.]+)%\)/m);
      if (!headerMatch) continue;
      const name = headerMatch[1].trim();
      if (builds.has(name)) continue;

      const build = parseMovesetTxt(text, name);
      if (build) builds.set(name, build);
      if (builds.size >= topN) break;
    }
  } catch { /* offline */ }

  return builds;
}
