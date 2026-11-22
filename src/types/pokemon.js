export const DEFAULT_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const DEFAULT_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const MAX_EVS = 508;
export const MAX_SINGLE_EV = 252;

export function createEmptyPokemon(slotId) {
  return {
    slotId,
    speciesId: '',
    speciesName: '',
    ability: '',
    item: '',
    nature: 'Docile',
    evMode: 'champions',
    evs: { ...DEFAULT_EVS },
    ivs: { ...DEFAULT_IVS },
    moves: ['', '', '', ''],
    level: 50,
  };
}

export function createEmptyTeam(name) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    pokemon: Array.from({ length: 6 }, (_, i) => createEmptyPokemon(`slot-${i}`)),
    createdAt: now,
    updatedAt: now,
  };
}
