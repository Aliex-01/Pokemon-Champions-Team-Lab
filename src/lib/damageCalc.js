import { calculate, Generations, Pokemon, Move, Field, Side } from '@smogon/calc';
import { getSpecies } from './championsData';
import { toTraditionalEvs } from './stats';

const gen = Generations.get(9);

export const emptySide = () => ({
  reflect: false, lightScreen: false, auroraVeil: false, helpingHand: false, friendGuard: false, protected: false,
});

function buildPokemon(m) {
  const sp = getSpecies(m.speciesId);
  if (!sp) return null;
  const evs = m.evMode === 'champions' ? toTraditionalEvs(m.evs) : m.evs;
  return new Pokemon(gen, m.speciesName || sp.name, {
    level: m.level || 50,
    ability: m.ability || sp.abilities[0] || '',
    item: m.item || undefined,
    nature: m.nature,
    evs: evs,
    ivs: m.ivs,
    boosts: m.boosts,
    status: (m.status || ''),
    moves: m.moves.filter(Boolean),
    // Supreme Overlord (General Supremo) lo aplica @smogon/calc con este valor.
    alliesFainted: Math.min(5, Math.max(0, m.alliesFainted || 0)),
  });
}

// La protección se aplica a mano (mecánica de Champions), no vía @smogon/calc.
function sideOpts(s) {
  return {
    isReflect: s.reflect,
    isLightScreen: s.lightScreen,
    isAuroraVeil: s.auroraVeil,
    isHelpingHand: s.helpingHand,
    isFriendGuard: s.friendGuard,
  };
}

// Habilidades que atraviesan Protección en Champions: hacen el 25% del daño (con contacto).
const PIERCE_PROTECT = new Set(['Unseen Fist', 'Piercing Drill']);

/** Calcula un movimiento del atacante contra el defensor con el campo dado. */
export function calcMove(
  attacker,
  defender,
  moveId,
  field,
  attackerSide,
  defenderSide,
) {
  if (!moveId || !attacker.speciesId || !defender.speciesId) return null;
  const a = buildPokemon(attacker);
  const d = buildPokemon(defender);
  if (!a || !d) return null;

  try {
    // Pasamos la habilidad del atacante para que el nº de golpes multigolpe
    // (Skill Link → 5) sea correcto; el resto del daño usa la habilidad del Pokémon.
    const moveOpts = { isCrit: field.crit, ability: attacker.ability || undefined };

    // @smogon/calc identifica movimientos con lógica de tipo dinámica (Weather
    // Ball, Techno Blast, Multi-Attack…) por `move.originalName`, que fija al
    // string exacto que recibe el constructor. Si le pasamos el id ("weatherball")
    // esa comprobación falla y el tipo no cambia con el clima. Reconstruimos con
    // el nombre canónico ("Weather Ball") para que esas mecánicas funcionen.
    let move = new Move(gen, moveId, moveOpts);
    const moveName = move.name || moveId;
    if (moveName !== moveId) move = new Move(gen, moveName, moveOpts);
    const overrides = {};

    // Dragonize (Feraligatr-Mega): movimientos Normal → Dragón (+1.2x potencia).
    let dragonize = false;
    if (attacker.ability === 'Dragonize' && move.type === 'Normal') {
      dragonize = true;
      overrides.type = 'Dragon';
    }

    // Objetivo único de un ataque de área (Heat Wave, Earthquake…): al pegar a un
    // solo Pokémon no se aplica la reducción ×0.75 de dobles. Lo conseguimos
    // cambiando su `target` a uno individual, así @smogon/calc no lo trata como área.
    const isSpreadMove = ['allAdjacent', 'allAdjacentFoes'].includes(move.target);
    if (field.singleTarget && isSpreadMove) overrides.target = 'normal';

    // Last Respects (Última Baza): @smogon/calc no escala su potencia, lo hacemos a mano.
    // BP = 50 × (1 + aliados debilitados), tope 5 aliados → 300.
    if (move.name === 'Last Respects') {
      const fainted = Math.min(5, Math.max(0, attacker.alliesFainted || 0));
      overrides.basePower = 50 * (1 + fainted);
    }

    if (Object.keys(overrides).length) {
      move = new Move(gen, moveName, { ...moveOpts, overrides });
    }

    // Mega Sol (Meganium-Mega): sus ataques actúan como con Sol.
    const weather = attacker.ability === 'Mega Sol' ? 'Sun' : field.weather;

    const fld = new Field({
      gameType: 'Doubles',
      weather: (weather || undefined),
      terrain: (field.terrain || undefined),
      isGravity: field.gravity,
      isMagicRoom: field.magicRoom,
      isWonderRoom: field.wonderRoom,
      attackerSide: new Side(sideOpts(attackerSide)),
      defenderSide: new Side(sideOpts(defenderSide)),
    });

    const result = calculate(gen, a, d, move, fld);
    // range() devuelve el daño TOTAL [min,max] (suma correctamente los multigolpe).
    // Pero LANZA si el daño es 0 por inmunidad (Volador/Levitación/etc.): en ese
    // caso lo tratamos como inmune para mostrar el movimiento igualmente.
    let min = 0, max = 0;
    try {
      [min, max] = result.range();
    } catch {
      // range() lanza si el daño es 0 por inmunidad: lo dejamos en 0.
    }
    let descNote = '';
    if (isSpreadMove) descNote += field.singleTarget ? ' — objetivo único' : ' — área ×0.75';

    // Habilidades nuevas de Z-A que @smogon/calc no implementa:
    // Fire Mane (Pyroar-Mega): +50% en ataques de Fuego.
    if (attacker.ability === 'Fire Mane' && move.type === 'Fire') {
      min = Math.floor(min * 1.5); max = Math.floor(max * 1.5);
    }
    // Dragonize: +20% de potencia (el cambio de tipo ya se aplicó arriba).
    if (dragonize) {
      min = Math.floor(min * 1.2); max = Math.floor(max * 1.2);
    }
    // Eelevate (Eelektross-Mega): inmune a Tierra (salvo con Gravedad, que anula la inmunidad).
    if (defender.ability === 'Eelevate' && move.type === 'Ground' && !field.gravity) {
      min = 0; max = 0; descNote = ' — Eelevate: inmune a Tierra';
    }
    // Aura Guard (Aura Protectora) (Lucario-Mega-Z): reduce a la mitad el daño
    // recibido de movimientos de contacto.
    if (defender.ability === 'Aura Guard' && move.flags?.contact === 1) {
      min = Math.floor(min * 0.5); max = Math.floor(max * 0.5);
      descNote += ' — Aura Guard: contacto reducido 50%';
    }

    // Protección (mecánica de Champions): bloquea salvo habilidades que la atraviesan
    // por contacto (Puño Invisible / Piercing Drill), que hacen el 25% del daño.
    if (defenderSide.protected) {
      const contact = move.flags?.contact === 1;
      if (PIERCE_PROTECT.has(attacker.ability) && contact) {
        min = Math.floor(min * 0.25);
        max = Math.floor(max * 0.25);
        descNote = ` — Protección: 25% (${attacker.ability})`;
      } else {
        min = 0; max = 0;
        descNote = ' — bloqueado por Protección';
      }
    }

    // desc() puede lanzar si el daño es 0 por inmunidad; usamos un texto de respaldo.
    let safeDesc;
    try { safeDesc = result.desc(); }
    catch { safeDesc = `${attacker.speciesName} ${moveId} vs. ${defender.speciesName}: inmune`; }

    if (max === 0) {
      const koChance = defenderSide.protected ? 'Protegido' : 'Inmune';
      return { moveId, min: 0, max: 0, pctMin: 0, pctMax: 0, koChance, desc: safeDesc + descNote };
    }

    const maxHp = d.maxHP();
    const pctMin = Math.round((min / maxHp) * 1000) / 10;
    const pctMax = Math.round((max / maxHp) * 1000) / 10;

    let koChance = '';
    if (min >= maxHp) koChance = 'OHKO';
    else if (max >= maxHp) koChance = `${Math.round(((max - maxHp + 1) / (max - min + 1)) * 100)}% OHKO`;
    else koChance = `${Math.ceil(maxHp / max)}HKO`;

    return { moveId, min, max, pctMin, pctMax, koChance, desc: safeDesc + descNote };
  } catch {
    return null;
  }
}
