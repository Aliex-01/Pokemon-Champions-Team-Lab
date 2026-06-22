import type { MetaBuildsData } from '../types/pokemon';

let cache: MetaBuildsData | null = null;

/** Carga las estadísticas de uso (builds.json) generadas desde Smogon. */
export async function loadMetaBuilds(): Promise<MetaBuildsData | null> {
  if (cache) return cache;
  try {
    const res = await fetch('/data/builds.json');
    if (!res.ok) return null;
    cache = (await res.json()) as MetaBuildsData;
    return cache;
  } catch {
    return null;
  }
}
