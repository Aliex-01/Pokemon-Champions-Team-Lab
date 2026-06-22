export type EvMode = 'champions' | 'traditional';

export interface EvSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export const DEFAULT_EVS: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const DEFAULT_IVS: EvSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const MAX_EVS = 508;
export const MAX_SINGLE_EV = 252;

export interface TeamPokemon {
  slotId: string;
  speciesId: string;
  speciesName: string;
  ability: string;
  item: string;
  nature: string;
  preMegaAbility?: string;
  evMode: EvMode;
  evs: EvSpread;
  ivs: EvSpread;
  moves: [string, string, string, string];
  level: number;
}

export interface SavedTeam {
  id: string;
  name: string;
  pokemon: TeamPokemon[];
  createdAt: string;
  updatedAt: string;
}

export interface SpeciesData {
  id: string;
  name: string;
  num: number;
  types: string[];
  baseStats: EvSpread;
  abilities: string[];
  weightkg: number;
  gender: string;
  spriteSlug: string;
  megaStone?: string;
  isMega?: boolean;
  baseSpeciesId?: string;
  baseAbilities?: string[];
  tier?: string | null;
}

export interface MoveData {
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  power: number;
  accuracy: number | null;
  pp: number;
  desc: string;
}

export interface ChampionsData {
  generatedAt: string;
  format: string;
  species: SpeciesData[];
  learnsets: Record<string, string[]>;
  items: string[];
  itemSprites: Record<string, number>;
  moves: string[];
  moveTypes: Record<string, string>;
  moveNames: Record<string, string>;
  moveData: Record<string, MoveData>;
  abilities: string[];
  natures: string[];
  typeChart: Record<string, { damageTaken: Record<string, number> }>;
  /** Nombres oficiales en español (PokeAPI), por nombre EN normalizado. */
  es?: {
    moves: Record<string, string>;
    abilities: Record<string, string>;
    items: Record<string, string>;
    natures: Record<string, string>;
    /** Descripción de efecto traducida, por id de movimiento. */
    moveDesc?: Record<string, string>;
  };
}

export interface UsageStat {
  rank: number;
  name: string;
  usage: number;
}

export interface PokemonBuildData {
  name: string;
  usage: number;
  abilities: { name: string; pct: number }[];
  items: { name: string; pct: number }[];
  moves: { name: string; pct: number }[];
  spreads: { nature: string; evs: string; pct: number }[];
}

export interface MetaBuildEntry {
  name: string;
  pct: number;
}

export interface MetaSpread {
  nature: string;
  evs: string;
  pct: number;
}

export interface MetaBuild {
  name: string;
  usage: number;
  rawCount: number;
  abilities: MetaBuildEntry[];
  items: MetaBuildEntry[];
  moves: MetaBuildEntry[];
  teraTypes: MetaBuildEntry[];
  teammates: MetaBuildEntry[];
  natures: MetaBuildEntry[];
  spreads: MetaSpread[];
}

export interface MetaBuildsData {
  generatedAt: string;
  month: string;
  format: string;
  rating: string;
  pokemon: Record<string, MetaBuild>;
}

export type AppView = 'builder' | 'speed' | 'builds' | 'coverage' | 'damage';

export function createEmptyPokemon(slotId: string): TeamPokemon {
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

export function createEmptyTeam(name: string): SavedTeam {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    pokemon: Array.from({ length: 6 }, (_, i) => createEmptyPokemon(`slot-${i}`)),
    createdAt: now,
    updatedAt: now,
  };
}
