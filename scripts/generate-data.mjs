import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Dex } from '@pkmn/dex';
import * as champions from '@pkmn/mods/champions';
import { translateDesc } from './translateDesc.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/data');

mkdirSync(outDir, { recursive: true });

const dex = Dex.mod('champions', champions);
dex.includeData();
dex.includeModData();

const NATURES = [
  'Adamant', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle',
  'Hasty', 'Impish', 'Jolly', 'Lax', 'Lonely', 'Mild', 'Modest',
  'Naive', 'Naughty', 'Quiet', 'Rash', 'Relaxed', 'Sassy', 'Timid',
];

function toSpriteSlug(name) {
  return name
    .toLowerCase()
    .replace(/-mega-([xy])$/i, '-mega$1');
}

const cosmeticIds = new Set();
for (const s of dex.species.all()) {
  for (const formeName of s.cosmeticFormes || []) {
    cosmeticIds.add(dex.species.get(formeName).id);
  }
}

function sameStats(a, b) {
  return Object.keys(a.baseStats).every((k) => a.baseStats[k] === b.baseStats[k]);
}

function sameTypes(a, b) {
  return a.types.length === b.types.length && a.types.every((t, i) => t === b.types[i]);
}

function isFunctionalForme(s) {
  if (!s.forme) return false;
  if (['Mega', 'Mega-X', 'Mega-Y'].includes(s.forme)) return true;
  if (/Alola|Hisui|Galar|Paldea|Totem|Gmax/.test(s.forme)) return true;
  if (['Shield', 'Blade', 'Attack', 'Defense', 'Speed'].includes(s.forme)) return true;
  return false;
}

// Roster legal de Reg M-B: números de Pokédex permitidos según championslab.xyz.
// Un Pokémon es legal si su nº (base) está aquí; eso incluye sus megas y formas
// regionales (comparten número). Regenerar scripts/allowed-nums.txt para actualizar.
const readNoBom = (p) => readFileSync(join(__dirname, p), 'utf8').replace(/^﻿/, '');

const allowedNums = new Set(
  readNoBom('allowed-nums.txt')
    .split(',')
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => !Number.isNaN(n))
);

// Tier ("nota") de championslab.xyz por nº de Pokédex base. Megas y formas
// regionales heredan el tier de su especie base (comparten número).
const tierMap = JSON.parse(readNoBom('tiers.json'));

const speciesList = [];
const seen = new Set();

for (const s of dex.species.all()) {
  if (s.isNonstandard || s.forme === 'Totem' || s.forme === 'Starter') continue;
  if (cosmeticIds.has(s.id)) continue;
  if (!allowedNums.has(s.num)) continue;

  if (s.forme && s.baseSpecies) {
    const base = dex.species.get(s.baseSpecies);
    if (base && sameStats(s, base) && sameTypes(s, base) && !isFunctionalForme(s)) continue;
  }

  if (seen.has(s.id)) continue;
  seen.add(s.id);

  const types = [...s.types];
  const abilities = Object.values(s.abilities || {}).filter(Boolean);
  const baseStats = { ...s.baseStats };
  const isMega = !!(s.forme && ['Mega', 'Mega-X', 'Mega-Y'].includes(s.forme));
  let baseSpeciesId;
  let baseAbilities;
  if (isMega && s.baseSpecies) {
    const base = dex.species.get(s.baseSpecies);
    if (base) {
      baseSpeciesId = base.id;
      baseAbilities = Object.values(base.abilities || {}).filter(Boolean);
    }
  }

  speciesList.push({
    id: s.id,
    name: s.name,
    num: s.num,
    types,
    baseStats,
    abilities,
    weightkg: s.weightkg,
    gender: s.gender ?? 'N',
    spriteSlug: toSpriteSlug(s.name),
    megaStone: s.requiredItem || undefined,
    isMega: isMega || undefined,
    baseSpeciesId,
    baseAbilities,
    tier: tierMap[String(s.num)] ?? null,
  });
}

speciesList.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));

console.log(`Processing ${speciesList.length} species learnsets...`);

const learnsets = {};
const moveTypes = {};
const moveNames = {};
const moveData = {};
const items = new Set();
const allMoves = new Set();
const allAbilities = new Set();

for (const move of dex.moves.all()) {
  if (move.id && move.type) {
    moveTypes[move.id] = move.type;
    moveNames[move.id] = move.name;
    moveData[move.id] = {
      type: move.type,
      category: move.category,
      power: move.basePower || 0,
      accuracy: move.accuracy === true ? null : move.accuracy,
      pp: move.pp,
      desc: move.shortDesc || move.desc || '',
    };
  }
}

for (const sp of speciesList) {
  for (const a of sp.abilities) allAbilities.add(a);
  try {
    const ls = await dex.learnsets.get(sp.id);
    if (!ls?.learnset) continue;
    const moves = Object.keys(ls.learnset).sort();
    learnsets[sp.id] = moves;
    for (const m of moves) allMoves.add(m);
  } catch {
    learnsets[sp.id] = [];
  }
}

for (const sp of speciesList) {
  if (sp.isMega && sp.baseSpeciesId && (!learnsets[sp.id] || learnsets[sp.id].length === 0)) {
    learnsets[sp.id] = [...(learnsets[sp.baseSpeciesId] ?? [])];
  }
}

for (const item of dex.items.all()) {
  if (!item.isNonstandard) items.add(item.name);
}

// Spritenums de Showdown para los iconos de objeto (incluye piedras nuevas de Z-A
// que no están en PokeAPI). Se renderizan desde itemicons-sheet.png.
const itemSprites = {};
try {
  const res = await fetch('https://play.pokemonshowdown.com/data/items.js');
  const txt = await res.text();
  const re = /(\w+):\{(?:[^{}]|\{[^{}]*\})*?spritenum:(\d+)/g;
  const all = {};
  let m;
  while ((m = re.exec(txt))) all[m[1]] = parseInt(m[2], 10);
  for (const name of items) {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (all[id] != null) itemSprites[id] = all[id];
  }
  console.log(`Item spritenums: ${Object.keys(itemSprites).length}/${items.size}`);
} catch (e) {
  console.warn('No se pudieron obtener spritenums de items:', e.message);
}

const typeChart = {};
for (const type of dex.types.all()) {
  if (type.name === '???') continue;
  typeChart[type.name] = {
    damageTaken: { ...type.damageTaken },
  };
}

// --- Nombres oficiales en español (España) desde los CSV de PokeAPI ---
// Mapeamos por el nombre EN normalizado → nombre ES, así en runtime localizamos
// movimientos, habilidades, objetos y naturalezas sin tocar la lógica (que usa EN).
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === ',') { out.push(cur); cur = ''; }
    else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchCsvRows(file) {
  const res = await fetch(`https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/${file}`);
  if (!res.ok) throw new Error(`${file} → ${res.status}`);
  const txt = await res.text();
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const f = splitCsvLine(l);
    const o = {};
    header.forEach((h, i) => (o[h] = f[i]));
    return o;
  });
}

const nrm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Construye { normalize(nombreEN): nombreES } de un *_names.csv (lang 9 = EN, 7 = ES).
async function esMapFrom(namesCsv, idField) {
  const rows = await fetchCsvRows(namesCsv);
  const en = {}, es = {};
  for (const r of rows) {
    if (r.local_language_id === '9') en[r[idField]] = r.name;
    else if (r.local_language_id === '7') es[r[idField]] = r.name;
  }
  const out = {};
  for (const id in es) if (en[id]) out[nrm(en[id])] = es[id];
  return out;
}

// Nombres oficiales en español (juegos Esp.) de movimientos de Gen 9 que PokeAPI
// aún NO tiene traducidos. Clave = nombre EN normalizado. Si PokeAPI los añade,
// se sobrescriben con su valor. Corrige aquí cualquiera que veas mal.
const MOVE_ES_OVERRIDES = {
  aquacutter: 'Tajo Acuático', aquastep: 'Danza Acuática', armorcannon: 'Cañón Armadura',
  axekick: 'Patada Hacha', barbbarrage: 'Mil Púas Tóxicas', bitterblade: 'Espada Lamento',
  bittermalice: 'Rencor Reprimido', ceaselessedge: 'Tajo Metralla', chillingwater: 'Agua Fría',
  chillyreception: 'Fría acogida', comeuppance: 'Resarcimiento', direclaw: 'Garra Nociva',
  flowertrick: 'Truco Floral', gigatonhammer: 'Martillo Colosal', headlongrush: 'Arremetida',
  icespinner: 'Pirueta Helada', infernalparade: 'Marcha Espectral', jetpunch: 'Puño Jet',
  kowtowcleave: 'Genufendiente', lastrespects: 'Homenaje Póstumo', luminacrash: 'Fotocolisión',
  makeitrain: 'Fiebre Dorada', matchagotcha: 'Cañón Batidor', mortalspin: 'Giro Mortífero',
  mountaingale: 'Viento Carámbano', populationbomb: 'Proliferación', pounce: 'Brinco',
  psyshieldbash: 'Asalto Barrera', ragefist: 'Puño Furia', ragingbull: 'Furia taurina',
  ragingfury: 'Erupción de ira', saltcure: 'Salazón', shedtail: 'Autotomía',
  shelter: 'Retracción', snowscape: 'Paisaje nevado', spicyextract: 'Extracto picante',
  stoneaxe: 'Hachazo Pétreo', syrupbomb: 'Bomba Caramelo', tidyup: 'Limpieza general',
  torchsong: 'Canto ardiente', trailblaze: 'Abrecaminos', triplearrows: 'Triple flecha',
  twinbeam: 'Láser Doble', wavecrash: 'Envite Acuatico',
};

let esNames = { moves: {}, abilities: {}, items: {}, natures: {} };
try {
  const [esMoves, esAbilities, esItems, esNatures] = await Promise.all([
    esMapFrom('move_names.csv', 'move_id'),
    esMapFrom('ability_names.csv', 'ability_id'),
    esMapFrom('item_names.csv', 'item_id'),
    esMapFrom('nature_names.csv', 'nature_id'),
  ]);
  // Filtramos a lo que usa el formato para no inflar el JSON.
  const pick = (full, names) => {
    const o = {};
    for (const n of names) { const k = nrm(n); if (full[k]) o[k] = full[k]; }
    return o;
  };
  esNames = {
    moves: pick(esMoves, Object.values(moveNames)),
    abilities: pick(esAbilities, [...allAbilities]),
    items: pick(esItems, [...items]),
    natures: pick(esNatures, NATURES),
  };
  console.log(`Nombres ES: ${Object.keys(esNames.moves).length} mov · ${Object.keys(esNames.abilities).length} hab · ${Object.keys(esNames.items).length} obj · ${Object.keys(esNames.natures).length} nat`);
} catch (e) {
  console.warn('No se pudieron obtener nombres ES de PokeAPI (se usará inglés):', e.message);
}

// Rellena los que PokeAPI no trae en español (movimientos nuevos de Gen 9).
let overridden = 0;
for (const [k, v] of Object.entries(MOVE_ES_OVERRIDES)) {
  if (!esNames.moves[k]) { esNames.moves[k] = v; overridden++; }
}
if (overridden) console.log(`Nombres ES (override manual): ${overridden} movimientos`);

// Traducción (por reglas) de las descripciones de efecto de cada movimiento.
esNames.moveDesc = {};
for (const [id, md] of Object.entries(moveData)) {
  if (md?.desc) esNames.moveDesc[id] = translateDesc(md.desc);
}
console.log(`Descripciones ES: ${Object.keys(esNames.moveDesc).length}`);

const output = {
  generatedAt: new Date().toISOString(),
  format: 'gen9championsvgc2026regmb',
  species: speciesList,
  learnsets,
  items: [...items].sort(),
  itemSprites,
  moves: [...allMoves].sort(),
  moveTypes,
  moveNames,
  moveData,
  abilities: [...allAbilities].sort(),
  natures: NATURES,
  typeChart,
  es: esNames,
};

writeFileSync(join(outDir, 'champions.json'), JSON.stringify(output));
console.log(`Wrote ${speciesList.length} species to public/data/champions.json`);

// --- Builds Meta: estadísticas de uso de Smogon (chaos JSON, sin CORS desde Node) ---
const STATS_RATING = '1760';
const STATS_FORMATS = [
  'gen9championsvgc2026regmb',
  'gen9championsvgc2026regmbbo3',
  'gen9championsvgc2026regmabo3',
  'gen9championsvgc2026regma',
];

async function fetchChaos() {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const fmt of STATS_FORMATS) {
      try {
        const res = await fetch(`https://www.smogon.com/stats/${month}/chaos/${fmt}-${STATS_RATING}.json`);
        if (res.ok) return { data: (await res.json()).data, month, format: fmt };
      } catch { /* siguiente */ }
    }
  }
  return null;
}

try {
  const chaos = await fetchChaos();
  if (!chaos) {
    console.warn('No se encontraron stats de Smogon para Champions (builds.json no generado).');
  } else {
    const itemNameById = {};
    for (const it of dex.items.all()) itemNameById[it.id] = it.name;
    const abilityNameById = {};
    for (const ab of dex.abilities.all()) abilityNameById[ab.id] = ab.name;
    const idByName = new Map(
      speciesList.map((s) => [s.name.toLowerCase().replace(/[^a-z0-9]/g, ''), s.id])
    );

    const top = (obj, total, n, nameFn = (x) => x) =>
      Object.entries(obj || {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, v]) => ({ name: nameFn(name), pct: Math.round((v / total) * 1000) / 10 }));

    const pokemon = {};
    for (const [name, g] of Object.entries(chaos.data)) {
      const id = idByName.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (!id) continue; // no está en el roster Reg M-B
      const total = Object.values(g.Abilities || {}).reduce((a, b) => a + b, 0) || g['Raw count'] || 1;

      const natureTotals = {};
      for (const [k, v] of Object.entries(g.Spreads || {})) {
        const nat = k.split(':')[0];
        natureTotals[nat] = (natureTotals[nat] || 0) + v;
      }

      pokemon[id] = {
        name,
        usage: Math.round((g.usage ?? 0) * 1000) / 10,
        rawCount: g['Raw count'] ?? 0,
        abilities: top(g.Abilities, total, 6, (x) => abilityNameById[x] ?? x),
        items: top(g.Items, total, 10, (x) => (x ? itemNameById[x] ?? x : 'Sin objeto')),
        moves: top(g.Moves, total, 14, (x) => (x ? moveNames[x] ?? x : 'Sin movimiento')),
        teraTypes: top(g['Tera Types'], total, 6),
        teammates: top(g.Teammates, total, 10),
        natures: top(natureTotals, total, 6),
        spreads: Object.entries(g.Spreads || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => {
            const [nature, evs] = k.split(':');
            return { nature, evs, pct: Math.round((v / total) * 1000) / 10 };
          }),
      };
    }

    const builds = {
      generatedAt: new Date().toISOString(),
      month: chaos.month,
      format: chaos.format,
      rating: STATS_RATING,
      pokemon,
    };
    writeFileSync(join(outDir, 'builds.json'), JSON.stringify(builds));
    console.log(`Wrote builds.json: ${Object.keys(pokemon).length} Pokémon (${chaos.format} · ${chaos.month})`);
  }
} catch (e) {
  console.warn('No se pudo generar builds.json:', e.message);
}
