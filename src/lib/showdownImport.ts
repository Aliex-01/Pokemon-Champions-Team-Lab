import type { ChampionsData, TeamPokemon, EvSpread, SpeciesData } from '../types/pokemon';
import { createEmptyPokemon, DEFAULT_IVS } from '../types/pokemon';
import { clampInvestment } from './stats';

const STAT_KEYS: Record<string, keyof EvSpread> = {
  hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe',
};

function toId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Parsea una línea tipo "252 HP / 4 Def / 252 Spe" a un EvSpread parcial. */
function parseStatLine(line: string): Partial<EvSpread> {
  const out: Partial<EvSpread> = {};
  for (const part of line.split('/')) {
    const m = part.trim().match(/(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)/i);
    if (m) {
      const key = STAT_KEYS[m[2].toLowerCase()];
      if (key) out[key] = parseInt(m[1], 10);
    }
  }
  return out;
}

/**
 * Convierte un pegado de equipo de Pokémon Showdown en TeamPokemon[].
 * Los EVs se importan en modo tradicional (valores exactos de Showdown).
 * Los megas se detectan tanto por nombre ("Venusaur-Mega") como por su piedra.
 */
export function parseShowdownTeam(text: string, data: ChampionsData): TeamPokemon[] {
  const speciesByName = new Map<string, SpeciesData>();
  const megaByStone = new Map<string, SpeciesData>();
  for (const s of data.species) {
    speciesByName.set(toId(s.name), s);
    if (s.isMega && s.megaStone) megaByStone.set(toId(s.megaStone), s);
  }
  const moveIdByName = new Map<string, string>();
  for (const [id, name] of Object.entries(data.moveNames ?? {})) moveIdByName.set(toId(name), id);

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const result: TeamPokemon[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;

    // Primera línea: "Mote (Especie) (G) @ Objeto" o "Especie @ Objeto".
    let head = lines[0];
    let item = '';
    const atIdx = head.lastIndexOf(' @ ');
    if (atIdx >= 0) {
      item = head.slice(atIdx + 3).trim();
      head = head.slice(0, atIdx).trim();
    }
    head = head.replace(/\s*\((?:M|F)\)\s*$/i, '').trim();
    let speciesName = head;
    const paren = head.match(/\(([^)]+)\)\s*$/);
    if (paren) speciesName = paren[1].trim();

    let species = speciesByName.get(toId(speciesName));
    // Si el objeto es una mega-piedra, prioriza la forma mega correspondiente.
    if (item && megaByStone.has(toId(item))) {
      const mega = megaByStone.get(toId(item))!;
      if (!species || mega.baseSpeciesId === species.id || toId(mega.name).startsWith(toId(speciesName))) {
        species = mega;
      }
    }
    if (!species) return; // especie desconocida en el formato → se omite

    const mon = createEmptyPokemon(`slot-${idx}`);
    mon.speciesId = species.id;
    mon.speciesName = species.name;
    mon.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    mon.ivs = { ...DEFAULT_IVS };
    mon.level = 50;
    mon.ability = species.abilities[0] ?? '';
    mon.item = species.isMega ? (species.megaStone ?? item) : item;
    if (species.isMega) mon.preMegaAbility = species.baseAbilities?.[0] ?? '';

    const moves: string[] = [];
    for (const line of lines.slice(1)) {
      if (/^ability \(base\):/i.test(line)) {
        mon.preMegaAbility = line.slice(line.indexOf(':') + 1).trim();
      } else if (/^ability:/i.test(line)) {
        const ab = line.slice(line.indexOf(':') + 1).trim();
        // En megas la habilidad es fija; conservamos la de la forma mega.
        if (!species.isMega) mon.ability = ab;
      } else if (/^level:/i.test(line)) {
        mon.level = parseInt(line.slice(line.indexOf(':') + 1), 10) || 50;
      } else if (/^evs:/i.test(line)) {
        Object.assign(mon.evs, parseStatLine(line.slice(line.indexOf(':') + 1)));
      } else if (/^ivs:/i.test(line)) {
        Object.assign(mon.ivs, parseStatLine(line.slice(line.indexOf(':') + 1)));
      } else if (/nature\s*$/i.test(line)) {
        mon.nature = line.replace(/nature\s*$/i, '').trim() || mon.nature;
      } else if (/^-/.test(line) && moves.length < 4) {
        const name = line.replace(/^-\s*/, '').trim();
        moves.push(moveIdByName.get(toId(name)) ?? toId(name));
      }
      // Se ignoran Tera Type, Shiny, Happiness, etc.
    }
    while (moves.length < 4) moves.push('');
    mon.moves = moves.slice(0, 4) as TeamPokemon['moves'];

    // Detecta el formato de los EVs: si la suma es ≤ 66 son Stat Points (Champions);
    // si es mayor, son EVs tradicionales. Se conservan los valores tal cual.
    const total = mon.evs.hp + mon.evs.atk + mon.evs.def + mon.evs.spa + mon.evs.spd + mon.evs.spe;
    mon.evMode = total <= 66 ? 'champions' : 'traditional';
    mon.evs = clampInvestment(mon.evs, mon.evMode);

    result.push(mon);
  });

  return result.slice(0, 6);
}
