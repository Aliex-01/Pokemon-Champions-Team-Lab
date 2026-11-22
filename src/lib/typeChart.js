const TYPE_NAMES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
  'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug',
  'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

export function getTypeEffectiveness(
  attackType,
  defenderTypes,
  typeChart
) {
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

export function analyzeDefensiveCoverage(
  teamTypes,
  typeChart
) {
  return TYPE_NAMES.map((type) => {
    let weakCount = 0;
    let resistCount = 0;
    let immuneCount = 0;
    const weakPokemon = [];
    const resistPokemon = [];

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

export function analyzeOffensiveCoverage(
  moveTypes,
  enemyTypes,
  typeChart
) {
  const uniqueMoveTypes = [...new Set(moveTypes.filter(Boolean))];

  return uniqueMoveTypes.map((moveType) => {
    const superEffective = [];
    const notVeryEffective = [];
    const noEffect = [];

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

export function getMoveType(moveName, data) {
  const id = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return data.moveTypes?.[id] ?? data.moveTypes?.[moveName] ?? 'Normal';
}

export { TYPE_NAMES };
