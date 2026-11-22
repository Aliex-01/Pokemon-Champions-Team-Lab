let cache = null;

/** Carga las estadísticas de uso (builds.json) generadas desde Smogon. */
export async function loadMetaBuilds() {
  if (cache) return cache;
  try {
    const res = await fetch('/data/builds.json');
    if (!res.ok) return null;
    cache = (await res.json());
    return cache;
  } catch {
    return null;
  }
}
