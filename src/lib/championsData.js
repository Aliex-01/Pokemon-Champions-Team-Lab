let cache = null;
let speciesMap = null;

export async function loadChampionsData() {
  if (cache) return cache;
  const res = await fetch('/data/champions.json');
  if (!res.ok) throw new Error('No se pudo cargar la base de datos de Champions');
  cache = await res.json();
  speciesMap = new Map(cache.species.map((s) => [s.id, s]));
  return cache;
}

export function getSpecies(id) {
  return speciesMap?.get(id);
}

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Devuelve el nombre localizado de un movimiento/habilidad/objeto/naturaleza.
 * En inglés (o si falta la traducción) devuelve el nombre EN tal cual.
 */
export function localizeName(
  kind,
  enName,
  lang,
) {
  if (!enName) return enName ?? '';
  if (lang !== 'es') return enName;
  return cache?.es?.[kind]?.[normName(enName)] ?? enName;
}

/** Descripción de efecto del movimiento en el idioma dado (id = id de movimiento). */
export function localizeMoveDesc(moveId, enDesc, lang) {
  if (!enDesc) return enDesc ?? '';
  if (lang !== 'es') return enDesc;
  return cache?.es?.moveDesc?.[moveId] ?? enDesc;
}

/** Busca la especie mega cuya megapiedra coincide con `stone` (para parsear |-mega|). */
export function getMegaByStone(stone) {
  if (!cache || !stone) return undefined;
  const n = stone.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cache.species.find(
    (s) => s.isMega && s.megaStone && s.megaStone.toLowerCase().replace(/[^a-z0-9]/g, '') === n,
  );
}

export function getSpeciesByName(name) {
  if (!cache) return undefined;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cache.species.find(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized ||
      s.id === name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  );
}

export function searchSpecies(query, data, limit = 30) {
  const q = query.toLowerCase().trim();
  if (!q) return data.species.slice(0, limit);
  return data.species
    .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q.replace(/\s/g, '')))
    .slice(0, limit);
}

export function getLearnset(speciesId, data) {
  const own = data.learnsets[speciesId];
  if (own?.length) return own;
  const sp = speciesMap?.get(speciesId);
  if (sp?.baseSpeciesId) return data.learnsets[sp.baseSpeciesId] ?? [];
  return [];
}

export function getSpriteUrls(speciesId) {
  const sp = speciesMap?.get(speciesId);
  const slug = sp?.spriteSlug ?? speciesId;
  const id = sp?.id ?? speciesId;
  const urls = [
    `https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/dex/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`,
  ];
  // Fallback para megas/formas sin sprite propio: usa el de la especie base
  // (así nunca queda un hueco en blanco aunque falte el sprite de la mega).
  const base = sp?.baseSpeciesId ? speciesMap?.get(sp.baseSpeciesId) : undefined;
  if (base?.spriteSlug) {
    urls.push(`https://play.pokemonshowdown.com/sprites/gen5/${base.spriteSlug}.png`);
  }
  if (sp?.num) {
    urls.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${sp.num}.png`);
  }
  return urls.filter(Boolean);
}

export function getShowdownSprite(speciesId) {
  return getSpriteUrls(speciesId)[0];
}

/** Spritenum del objeto en la hoja de iconos de Showdown (itemicons-sheet.png). */
export function getItemSpritenum(itemName) {
  const id = itemName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cache?.itemSprites?.[id];
}

let megaStoneSet = null;
/** Nombres de todas las megapiedras del formato. */
export function getMegaStoneNames() {
  if (!megaStoneSet && cache) {
    megaStoneSet = new Set(
      cache.species.filter((s) => s.isMega && s.megaStone).map((s) => s.megaStone)
    );
  }
  return megaStoneSet ?? new Set();
}

/** Megapiedras que corresponden a una especie base (la X/Y si las hay). */
export function getMegaStonesForSpecies(speciesId) {
  if (!cache) return [];
  return cache.species
    .filter((s) => s.isMega && s.baseSpeciesId === speciesId && s.megaStone)
    .map((s) => s.megaStone);
}
