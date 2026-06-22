import type { ChampionsData } from '../types/pokemon';

const TYPE_NAMES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

export function getTypeEffectiveness(
  attackType: string,
  defenderTypes: string[],
  typeChart: ChampionsData['typeChart']
): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    const chart = typeChart[defType];
    if (!chart) continue;
    const taken = chart.damageTaken[attackType];
    if (taken === 1) multiplier *= 2;
    else if (taken === 2) multiplier *= 0.5;
    else if (taken === 3) multiplier *= 0;
  }
  return multiplier;
}

export interface DefensiveCoverage {
  type: string;
  weakCount: number;
  resistCount: number;
  immuneCount: number;
  weakPokemon: string[];
  resistPokemon: string[];
}

export function analyzeDefensiveCoverage(
  teamTypes: { name: string; types: string[] }[],
  typeChart: ChampionsData['typeChart']
): DefensiveCoverage[] {
  return TYPE_NAMES.map((type) => {
    let weakCount = 0;
    let resistCount = 0;
    let immuneCount = 0;
    const weakPokemon: string[] = [];
    const resistPokemon: string[] = [];

    for (const mon of teamTypes) {
      if (!mon.name) continue;
      const eff = getTypeEffectiveness(type, mon.types, typeChart);
      if (eff >= 2) { weakCount++; weakPokemon.push(mon.name); }
      else if (eff === 0) { immuneCount++; resistPokemon.push(mon.name); }
      else if (eff <= 0.5) { resistCount++; resistPokemon.push(mon.name); }
    }

    return { type, weakCount, resistCount, immuneCount, weakPokemon, resistPokemon };
  });
}

export interface OffensiveCoverage {
  type: string;
  superEffective: string[];
  notVeryEffective: string[];
  noEffect: string[];
}

export function analyzeOffensiveCoverage(
  moveTypes: string[],
  enemyTypes: { name: string; types: string[] }[],
  typeChart: ChampionsData['typeChart']
): OffensiveCoverage[] {
  const uniqueMoveTypes = [...new Set(moveTypes.filter(Boolean))];

  return uniqueMoveTypes.map((moveType) => {
    const superEffective: string[] = [];
    const notVeryEffective: string[] = [];
    const noEffect: string[] = [];

    for (const enemy of enemyTypes) {
      if (!enemy.name) continue;
      const eff = getTypeEffectiveness(moveType, enemy.types, typeChart);
      if (eff >= 2) superEffective.push(enemy.name);
      else if (eff === 0) noEffect.push(enemy.name);
      else if (eff <= 0.5) notVeryEffective.push(enemy.name);
    }

    return { type: moveType, superEffective, notVeryEffective, noEffect };
  });
}

export function getMoveType(moveName: string, data: ChampionsData): string {
  const id = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return data.moveTypes?.[id] ?? data.moveTypes?.[moveName] ?? 'Normal';
}

export { TYPE_NAMES };
