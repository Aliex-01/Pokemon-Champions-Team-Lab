import { useEffect, useMemo, useRef, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { getSpecies, getSpeciesByName } from '../lib/championsData';
import { getTypeEffectiveness, TYPE_NAMES } from '../lib/typeChart';
import { loadMetaBuilds } from '../lib/metaBuilds';
import { PokemonSprite } from '../components/PokemonSprite';
import { useLang } from '../lib/i18n';
import type { ChampionsData, MetaBuildsData } from '../types/pokemon';

interface Props {
  data: ChampionsData;
}

// Habilidades que dan inmunidad / resistencia (igual que en Cobertura).
const ABILITY_IMMUNE: Record<string, string> = {
  Levitate: 'Ground', 'Earth Eater': 'Ground',
  'Water Absorb': 'Water', 'Storm Drain': 'Water', 'Dry Skin': 'Water',
  'Volt Absorb': 'Electric', 'Lightning Rod': 'Electric', 'Motor Drive': 'Electric',
  'Flash Fire': 'Fire', 'Well-Baked Body': 'Fire', 'Sap Sipper': 'Grass',
};
const ABILITY_RESIST: Record<string, string[]> = {
  'Thick Fat': ['Fire', 'Ice'], Heatproof: ['Fire'], 'Water Bubble': ['Fire'], 'Purifying Salt': ['Ghost'],
};
function applyAbility(mult: number, attackType: string, ability: string): number {
  if (!ability) return mult;
  if (ABILITY_IMMUNE[ability] === attackType) return 0;
  if (ABILITY_RESIST[ability]?.includes(attackType)) return mult * 0.5;
  return mult;
}

// Conjuntos de movimientos por utilidad (ids de Showdown).
const SET = {
  tailwind: new Set(['tailwind']),
  trickRoom: new Set(['trickroom']),
  speedCtrl: new Set(['icywind', 'electroweb', 'thunderwave', 'glare', 'nuzzle', 'stickyweb', 'scaryface', 'bulldoze', 'rocktomb', 'cottonspore', 'stringshot', 'mudshot']),
  hazards: new Set(['stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'ceaselessedge', 'stoneaxe']),
  hazardRemoval: new Set(['rapidspin', 'defog', 'tidyup', 'mortalspin']),
  redirection: new Set(['followme', 'ragepowder']),
  fakeOut: new Set(['fakeout']),
  recovery: new Set(['recover', 'roost', 'synthesis', 'moonlight', 'morningsun', 'slackoff', 'softboiled', 'rest', 'wish', 'milkdrink', 'junglehealing', 'lifedew', 'strengthsap', 'shoreup']),
  priority: new Set(['fakeout', 'extremespeed', 'aquajet', 'bulletpunch', 'machpunch', 'iceshard', 'suckerpunch', 'shadowsneak', 'quickattack', 'vacuumwave', 'watershuriken', 'grassyglide', 'jetpunch', 'accelerock', 'feint', 'firstimpression']),
  screens: new Set(['reflect', 'lightscreen', 'auroraveil']),
  paralyze: new Set(['thunderwave', 'glare', 'nuzzle', 'stunspore']),
  burn: new Set(['willowisp']),
  sleep: new Set(['spore', 'sleeppowder', 'hypnosis', 'yawn', 'lovelykiss']),
  protect: new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'maxguard', 'obstruct']),
  // Útiles en dobles:
  protectArea: new Set(['wideguard', 'quickguard', 'matblock']),
  allySupport: new Set(['helpinghand', 'decorate', 'coaching']),
  weatherMove: new Set(['sunnyday', 'raindance', 'sandstorm', 'snowscape', 'chillyreception']),
  terrainMove: new Set(['electricterrain', 'grassyterrain', 'psychicterrain', 'mistyterrain']),
  // Movimientos de mejora propia (setup) e intercambio (pivote).
  setup: new Set(['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'irondefense', 'agility', 'rockpolish', 'workup', 'victorydance', 'tidyup', 'clangoroussoul', 'noretreat', 'filletaway', 'tailglow', 'geomancy', 'curse']),
  pivot: new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'batonpass']),
  // Ataques de área dañinos que golpean a ambos rivales (o a todos los adyacentes).
  spread: new Set([
    'heatwave', 'blizzard', 'muddywater', 'dazzlinggleam', 'hypervoice', 'eruption', 'waterspout',
    'rockslide', 'earthquake', 'surf', 'discharge', 'lavaplume', 'bulldoze', 'sludgewave', 'razorleaf',
    'snarl', 'strugglebug', 'makeitrain', 'paraboliccharge', 'breakingswipe', 'burningjealousy',
    'glaciate', 'dragonenergy', 'originpulse', 'precipiceblades', 'astralbarrage', 'glaciallance',
    'sandsearstorm', 'wildboltstorm', 'bleakwindstorm', 'springtidestorm', 'icywind', 'electroweb',
    'overdrive', 'fierywrath',
  ]),
};
const WEATHER_ABILITIES = new Set(['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Orichalcum Pulse', 'Desolate Land', 'Primordial Sea']);
const TERRAIN_ABILITIES = new Set(['Electric Surge', 'Grassy Surge', 'Psychic Surge', 'Misty Surge', 'Hadron Engine']);

// ---- Sinergias de clima/terreno ----
const WEATHER_BY_ABILITY: Record<string, string> = {
  Drought: 'sun', 'Orichalcum Pulse': 'sun', 'Desolate Land': 'sun',
  Drizzle: 'rain', 'Primordial Sea': 'rain',
  'Sand Stream': 'sand', 'Snow Warning': 'snow',
};
const WEATHER_BY_MOVE: Record<string, string> = {
  sunnyday: 'sun', raindance: 'rain', sandstorm: 'sand', snowscape: 'snow', chillyreception: 'snow',
};
const WEATHER_ABUSERS: Record<string, string[]> = {
  sun: ['Chlorophyll', 'Solar Power', 'Protosynthesis', 'Flower Gift', 'Leaf Guard'],
  rain: ['Swift Swim', 'Rain Dish', 'Dry Skin', 'Hydration'],
  sand: ['Sand Rush', 'Sand Force', 'Sand Veil'],
  snow: ['Slush Rush', 'Ice Body', 'Ice Face', 'Snow Cloak'],
};
const TERRAIN_BY_ABILITY: Record<string, string> = {
  'Electric Surge': 'electric', 'Hadron Engine': 'electric',
  'Grassy Surge': 'grassy', 'Psychic Surge': 'psychic', 'Misty Surge': 'misty',
};
const TERRAIN_BY_MOVE: Record<string, string> = {
  electricterrain: 'electric', grassyterrain: 'grassy', psychicterrain: 'psychic', mistyterrain: 'misty',
};
const WEATHER_LABEL: Record<string, string> = { sun: 'Sol', rain: 'Lluvia', sand: 'Arena', snow: 'Nieve' };

// Categorías de rol y su color (ofensiva, defensa, velocidad, apoyo).
type RoleKind = 'off' | 'def' | 'spe' | 'sup';
const ROLE_KIND_CLASS: Record<RoleKind, string> = {
  off: 'bg-red-500/20 text-red-200 border-red-500/40',
  def: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  spe: 'bg-amber-500/20 text-amber-100 border-amber-500/40',
  sup: 'bg-purple-500/20 text-purple-200 border-purple-500/40',
};
const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  off: 'Ofensiva', def: 'Defensa', spe: 'Velocidad', sup: 'Apoyo',
};

// Habilidades "-ate": cambian el tipo de los ataques (ofensiva). `from: '*'` => cualquier tipo.
const ABILITY_MOVE_TYPE: Record<string, { from: string; to: string }> = {
  Pixilate: { from: 'Normal', to: 'Fairy' },
  Refrigerate: { from: 'Normal', to: 'Ice' },
  Aerilate: { from: 'Normal', to: 'Flying' },
  Galvanize: { from: 'Normal', to: 'Electric' },
  Dragonize: { from: 'Normal', to: 'Dragon' }, // Feraligatr-Mega (Champions)
  Normalize: { from: '*', to: 'Normal' },
};
function abilityMoveType(moveType: string, ability: string): string {
  const conv = ABILITY_MOVE_TYPE[ability];
  if (conv && (conv.from === '*' || conv.from === moveType)) return conv.to;
  return moveType;
}

/**
 * Anima un número desde el último valor mostrado hasta `target`.
 * Al cambiar de equipo cuenta desde el valor anterior, no desde 0.
 * Respeta prefers-reduced-motion.
 */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = prevRef.current;
    if (reduce || from === target) { setValue(target); prevRef.current = target; return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      prevRef.current = v; // guarda el último valor mostrado (robusto ante interrupciones)
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{v}</span>;
}

export function TeamAnalysisView({ data }: Props) {
  const { activeTeam } = useTeam();
  const { t } = useLang();
  const tc = data.typeChart;
  const [meta, setMeta] = useState<MetaBuildsData | null>(null);
  // Tras el primer frame las barras pasan de 0 a su valor (crecen al entrar);
  // después, los cambios de equipo transicionan suavemente entre valores.
  const [barsReady, setBarsReady] = useState(false);
  // Tipo de ataque resaltado al pasar el ratón (resalta los Pokémon débiles).
  const [hoverType, setHoverType] = useState<string | null>(null);

  useEffect(() => { loadMetaBuilds().then(setMeta); }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const analysis = useMemo(() => {
    const mons = (activeTeam?.pokemon ?? [])
      .filter((p) => p.speciesId)
      .map((p) => {
        const sp = getSpecies(p.speciesId)!;
        const moveIds = p.moves.filter(Boolean);
        const moveTypes = [...new Set(moveIds
          .map((id) => data.moveData?.[id])
          .filter((md): md is NonNullable<typeof md> => !!md && md.category !== 'Status')
          // Habilidades "-ate" (Pixilate, etc.): el ataque cuenta como su tipo real.
          .map((md) => abilityMoveType(md.type, p.ability)))];
        const hasPhysical = moveIds.some((id) => data.moveData?.[id]?.category === 'Physical' && (data.moveData?.[id]?.power ?? 0) > 0);
        const hasSpecial = moveIds.some((id) => data.moveData?.[id]?.category === 'Special' && (data.moveData?.[id]?.power ?? 0) > 0);
        const has = (s: Set<string>) => moveIds.some((id) => s.has(id));
        const bulk = sp.baseStats.hp + sp.baseStats.def + sp.baseStats.spd;
        return { p, sp, name: p.speciesName, moveIds, moveTypes, hasPhysical, hasSpecial, has, bulk, ability: p.ability };
      });

    // Efectividad de un tipo atacante sobre un Pokémon (con su habilidad).
    const effOn = (atkType: string, m: typeof mons[number]) =>
      applyAbility(getTypeEffectiveness(atkType, m.sp.types, tc), atkType, m.ability);

    // Matriz defensiva: 18 tipos × cada Pokémon (multiplicador recibido).
    const matrix = TYPE_NAMES.map((type) => ({
      type,
      cells: mons.map((m) => effOn(type, m)),
    }));

    // Debilidades defensivas compartidas (incluye habilidades).
    const weakByType = matrix
      .map(({ type, cells }) => ({ type, count: cells.filter((c) => c > 1).length }))
      .filter((w) => w.count >= 2).sort((a, b) => b.count - a.count);

    // Tipos que NADIE del equipo resiste ni es inmune (agujeros defensivos).
    const unresisted = matrix
      .filter(({ cells }) => cells.length > 0 && !cells.some((c) => c < 1))
      .map(({ type }) => type);

    // Huecos ofensivos: tipos a los que nadie pega supereficaz.
    const offGaps = TYPE_NAMES.filter((type) =>
      !mons.some((m) => m.moveTypes.length && Math.max(...m.moveTypes.map((mt) => getTypeEffectiveness(mt, [type], tc))) > 1));

    const withMove = (s: Set<string>) => mons.filter((m) => m.has(s));
    const tailwind = withMove(SET.tailwind);
    const trickRoom = withMove(SET.trickRoom);
    const speedCtrl = withMove(SET.speedCtrl);
    const redirection = withMove(SET.redirection);
    const fakeOut = withMove(SET.fakeOut);
    const recovery = withMove(SET.recovery);
    const priority = withMove(SET.priority);
    const screens = withMove(SET.screens);
    const protectArea = withMove(SET.protectArea);
    const allySupport = withMove(SET.allySupport);
    const protect = withMove(SET.protect);
    const weatherSetters = mons.filter((m) => m.has(SET.weatherMove) || WEATHER_ABILITIES.has(m.ability));
    const terrainSetters = mons.filter((m) => m.has(SET.terrainMove) || TERRAIN_ABILITIES.has(m.ability));
    const intimidate = mons.filter((m) => m.ability === 'Intimidate');
    const scarf = mons.filter((m) => m.p.item === 'Choice Scarf');

    // Roles por Pokémon: etiquetas categorizadas (ofensiva / defensa / velocidad
    // / apoyo) deducidas de stats base, inversión de EVs, objeto, habilidad y
    // movimientos. Mucho más informativo que un simple "Físico/Soporte".
    const roles = mons.map((m) => {
      const tags: { label: string; kind: RoleKind }[] = [];
      const bs = m.sp.baseStats;
      const ev = m.p.evs;
      // Umbrales según el modo de EVs (Champions usa 0–32; tradicional 0–252).
      const champ = m.p.evMode === 'champions';
      const HI = champ ? 20 : 160;   // inversión fuerte
      const MED = champ ? 12 : 100;  // inversión relevante
      const LOWSPE = champ ? 4 : 20;  // velocidad casi sin tocar
      const DEFBUDGET = champ ? 28 : 200;

      // --- Identidad ofensiva ---
      const physInv = ev.atk >= MED, specInv = ev.spa >= MED;
      if ((m.hasPhysical && m.hasSpecial) || (physInv && specInv)) tags.push({ label: 'Mixto', kind: 'off' });
      else if (physInv || (m.hasPhysical && bs.atk >= bs.spa)) tags.push({ label: 'Físico', kind: 'off' });
      else if (specInv || (m.hasSpecial && bs.spa > bs.atk)) tags.push({ label: 'Especial', kind: 'off' });
      if (m.has(SET.setup)) tags.push({ label: 'Setup', kind: 'off' });
      // Prioridad real (no contar Fake Out, que ya tiene su etiqueta).
      if (m.moveIds.some((id) => SET.priority.has(id) && id !== 'fakeout')) tags.push({ label: 'Prioridad', kind: 'off' });
      // Ataques de área: golpean a ambos rivales (clave en dobles).
      if (m.has(SET.spread)) tags.push({ label: 'Área', kind: 'off' });

      // --- Velocidad ---
      if (m.p.item === 'Choice Scarf') tags.push({ label: 'Scarfer', kind: 'spe' });
      else if (ev.spe >= HI) tags.push({ label: 'Veloz', kind: 'spe' });
      else if (bs.spe <= 55 && ev.spe <= LOWSPE) tags.push({ label: 'Lento (TR)', kind: 'spe' });

      // --- Defensa ---
      if (ev.hp + ev.def + ev.spd >= DEFBUDGET) {
        const diff = ev.def - ev.spd;
        if (diff >= MED / 2) tags.push({ label: 'Muro Físico', kind: 'def' });
        else if (-diff >= MED / 2) tags.push({ label: 'Muro Especial', kind: 'def' });
        else tags.push({ label: 'Tanque', kind: 'def' });
      }
      if (m.has(SET.recovery)) tags.push({ label: 'Recuperación', kind: 'def' });

      // --- Funciones de apoyo concretas (sustituyen al genérico "Soporte") ---
      if (m.ability === 'Intimidate') tags.push({ label: 'Intimida', kind: 'sup' });
      if (m.has(SET.fakeOut)) tags.push({ label: 'Fake Out', kind: 'sup' });
      if (m.has(SET.redirection)) tags.push({ label: 'Redirección', kind: 'sup' });
      if (m.has(SET.protectArea)) tags.push({ label: 'Prot. Área', kind: 'sup' });
      if (m.has(SET.screens)) tags.push({ label: 'Pantallas', kind: 'sup' });
      if (m.has(SET.allySupport)) tags.push({ label: 'Apoyo Aliado', kind: 'sup' });
      if (m.has(SET.trickRoom)) tags.push({ label: 'Trick Room', kind: 'spe' });
      if (m.has(SET.tailwind)) tags.push({ label: 'Tailwind', kind: 'spe' });
      if (m.has(SET.speedCtrl)) tags.push({ label: 'Control Veloc.', kind: 'spe' });
      if (m.has(SET.weatherMove) || WEATHER_ABILITIES.has(m.ability)) tags.push({ label: 'Clima', kind: 'sup' });
      if (m.has(SET.terrainMove) || TERRAIN_ABILITIES.has(m.ability)) tags.push({ label: 'Terreno', kind: 'sup' });
      if (m.has(SET.hazards)) tags.push({ label: 'Trampas', kind: 'sup' });
      if (m.has(SET.hazardRemoval)) tags.push({ label: 'Antitrampas', kind: 'sup' });
      if (m.has(SET.paralyze) || m.has(SET.burn) || m.has(SET.sleep)) tags.push({ label: 'Estados', kind: 'sup' });
      if (m.has(SET.pivot)) tags.push({ label: 'Pivote', kind: 'sup' });

      return { name: m.name, speciesId: m.p.speciesId, tags };
    });

    // ---- Arquetipo del equipo (puntuación ponderada) ----
    // En vez de elegir por prioridad fija (Trick Room > Tailwind > …), puntuamos
    // cada plan según las señales reales del equipo y gana el de mayor peso. Así,
    // un equipo cuyo eje es Tailwind pero lleva Trick Room de apoyo se etiqueta
    // como Tailwind, dejando Trick Room como arquetipo secundario.
    const avgSpe = mons.length ? mons.reduce((s, m) => s + m.sp.baseStats.spe, 0) / mons.length : 0;
    const slowMons = mons.filter((m) => m.sp.baseStats.spe <= 60);
    const fastMons = mons.filter((m) => m.sp.baseStats.spe >= 80);

    // Climas/terrenos presentes y cuántos Pokémon los aprovechan (habilidad abusadora).
    const teamWeathers = new Set<string>();
    for (const m of mons) {
      const w = WEATHER_BY_ABILITY[m.ability]; if (w) teamWeathers.add(w);
      for (const id of m.moveIds) if (WEATHER_BY_MOVE[id]) teamWeathers.add(WEATHER_BY_MOVE[id]);
    }
    const wtSetters = weatherSetters.length + terrainSetters.length;
    const wtAbusers = mons.filter((m) => [...teamWeathers].some((w) => WEATHER_ABUSERS[w]?.includes(m.ability))).length;

    // Puntuación de cada plan (0 = no aplica). Pesos calibrados a mano: el nº de
    // inductores pesa, y se premia/penaliza según el equipo encaje con el plan
    // (lentos para Trick Room, rápidos para Tailwind/Hiperofensivo, abusadores
    // para Clima/Terreno).
    const archScores: { key: string; icon: string; score: number }[] = [];
    if (trickRoom.length)
      archScores.push({ key: 'Trick Room', icon: '⧗',
        score: 12 * trickRoom.length + 5 * slowMons.length - 0.2 * Math.max(0, avgSpe - 60) });
    if (tailwind.length)
      archScores.push({ key: 'Tailwind', icon: '≋',
        score: 12 * tailwind.length + 4 * fastMons.length + 0.15 * Math.max(0, avgSpe - 70) });
    if (wtSetters)
      archScores.push({ key: 'Clima / Terreno', icon: '☀',
        score: 9 * wtSetters + 6 * wtAbusers });
    archScores.push({ key: 'Hiperofensivo', icon: '⚔',
      score: (avgSpe >= 95 ? 10 : 0) + 4 * fastMons.length + 3 * scarf.length + 3 * priority.length - 5 * slowMons.length });
    archScores.push({ key: 'Equilibrado', icon: '🛡', score: 9 });

    archScores.sort((a, b) => b.score - a.score);
    const archetype = { key: archScores[0].key, icon: archScores[0].icon };
    // Plan secundario: otro arquetipo de estrategia (no Equilibrado) con peso
    // relevante. Se muestra como "+ apoyo" junto al principal.
    const STRATEGY_KEYS = ['Trick Room', 'Tailwind', 'Clima / Terreno'];
    const second = archScores.slice(1).find((a) => STRATEGY_KEYS.includes(a.key) && a.score >= 12);
    const archetypeSecondary = second ? { key: second.key, icon: second.icon } : null;

    // ---- Sinergias y anti-sinergias de habilidad ----
    const synergies: string[] = [];
    const antiSynergies: string[] = [];
    // Climas activos en el equipo.
    const activeWeathers = new Set<string>();
    for (const m of mons) {
      const w = WEATHER_BY_ABILITY[m.ability];
      if (w) activeWeathers.add(w);
      for (const id of m.moveIds) if (WEATHER_BY_MOVE[id]) activeWeathers.add(WEATHER_BY_MOVE[id]);
    }
    for (const w of activeWeathers) {
      const abusers = mons.filter((m) => WEATHER_ABUSERS[w]?.includes(m.ability));
      if (abusers.length) synergies.push(`${t(WEATHER_LABEL[w])} + ${abusers.map((a) => a.name).join(', ')} (${t('aprovecha el clima')})`);
    }
    if (activeWeathers.size >= 2) antiSynergies.push(`${t('Dos climas distintos se anulan entre sí:')} ${[...activeWeathers].map((w) => t(WEATHER_LABEL[w])).join(' / ')}`);
    // Terrenos.
    const activeTerrains = new Set<string>();
    for (const m of mons) {
      const tr = TERRAIN_BY_ABILITY[m.ability];
      if (tr) activeTerrains.add(tr);
      for (const id of m.moveIds) if (TERRAIN_BY_MOVE[id]) activeTerrains.add(TERRAIN_BY_MOVE[id]);
    }
    if (activeTerrains.has('psychic') && priority.length === 0) {
      // informativo: el terreno psíquico bloquea prioridad rival
    }
    if (activeTerrains.has('psychic')) synergies.push(`${t('Terreno Psíquico')} (${t('bloquea prioridad rival')})`);
    if (activeTerrains.has('electric')) {
      const quark = mons.filter((m) => m.ability === 'Quark Drive');
      if (quark.length) synergies.push(`${t('Terreno Eléctrico')} + ${quark.map((q) => q.name).join(', ')} (Quark Drive)`);
    }
    if (activeTerrains.size >= 2) antiSynergies.push(`${t('Dos terrenos distintos se anulan entre sí.')}`);
    if (intimidate.length >= 2) synergies.push(`${t('Intimidación')} ×${intimidate.length} (${t('presión sobre el ataque rival')})`);
    if (redirection.length >= 1 && mons.some((m) => m.bulk < 280)) synergies.push(`${t('Redirección')} ${t('protege a tus frágiles')}`);

    // ---- Avisos ----
    const warnings: string[] = [];
    if (mons.length > 0) {
      if (tailwind.length === 0 && trickRoom.length === 0 && speedCtrl.length === 0) warnings.push('Sin control de velocidad (Tailwind, Trick Room, baja-velocidades).');
      if (priority.length === 0) warnings.push('Sin movimientos de prioridad.');
      if (redirection.length === 0 && protectArea.length === 0) warnings.push('Sin redirección ni protección de área (Follow Me, Vasta Guardia…).');
      if (fakeOut.length === 0) warnings.push('Sin Fake Out (presión de retroceso en dobles).');
      for (const w of weakByType.filter((x) => x.count >= 3)) warnings.push(`Débil en común a ${w.type} (${w.count}).`);
      if (!mons.some((m) => m.hasPhysical)) warnings.push('Ningún atacante físico.');
      if (!mons.some((m) => m.hasSpecial)) warnings.push('Ningún atacante especial.');
      // Nuevos avisos (#7):
      if (protect.length === 0) warnings.push('Nadie lleva Protección: casi todos los equipos VGC la usan.');
      if (slowMons.length >= 4 && trickRoom.length === 0) warnings.push('Muchos Pokémon lentos y sin Trick Room.');
      const itemCounts = new Map<string, number>();
      for (const m of mons) if (m.p.item) itemCounts.set(m.p.item, (itemCounts.get(m.p.item) ?? 0) + 1);
      for (const [item, c] of itemCounts) if (c >= 2) warnings.push(`Objeto repetido: ${item} ×${c}.`);
    }

    // ---- Puntuación del equipo (0-100) ----
    const speedScore = Math.min(25,
      ((tailwind.length || trickRoom.length || speedCtrl.length) ? 13 : 0) +
      (priority.length ? 7 : 0) +
      ((tailwind.length + trickRoom.length + speedCtrl.length) >= 2 ? 5 : 0));
    const offenseScore = Math.round(25 * (1 - offGaps.length / TYPE_NAMES.length));
    const weak2 = weakByType.length;
    const weak3 = weakByType.filter((x) => x.count >= 3).length;
    const defenseScore = Math.max(0, 25 - weak3 * 5 - weak2 * 2 - (unresisted.length > 6 ? 3 : 0));
    const utilityScore = Math.min(25,
      (fakeOut.length ? 5 : 0) + ((redirection.length || protectArea.length) ? 6 : 0) +
      (recovery.length ? 4 : 0) + (allySupport.length ? 3 : 0) +
      (intimidate.length ? 3 : 0) + (screens.length ? 4 : 0));
    const scores = { speed: speedScore, offense: offenseScore, defense: defenseScore, utility: utilityScore };
    const total = speedScore + offenseScore + defenseScore + utilityScore;

    return { mons, weakByType, unresisted, offGaps, tailwind, trickRoom, speedCtrl, redirection, fakeOut, recovery, priority, protectArea, allySupport, weatherSetters, terrainSetters, intimidate, scarf, roles, warnings, archetype, archetypeSecondary, synergies, antiSynergies, scores, total, avgSpe };
  }, [activeTeam, data, tc, t]);

  // ---- Amenazas del meta (#1) ----
  const threats = useMemo(() => {
    if (!meta || analysis.mons.length === 0) return [];
    const mons = analysis.mons;
    const top = Object.entries(meta.pokemon)
      .sort((a, b) => b[1].usage - a[1].usage)
      .slice(0, 30);
    const out: { id: string; name: string; usage: number; types: string[] }[] = [];
    for (const [id, build] of top) {
      const sp = getSpecies(id) ?? getSpeciesByName(build.name);
      if (!sp) continue;
      const ttypes = sp.types;
      // ¿Alguien lo golpea supereficaz?
      const weHit = mons.some((m) => m.moveTypes.some((mt) => getTypeEffectiveness(mt, ttypes, tc) > 1));
      // ¿Alguien resiste todos sus STAB?
      const weWall = mons.some((m) => ttypes.every((at) => applyAbility(getTypeEffectiveness(at, m.sp.types, tc), at, m.ability) <= 0.5));
      if (!weHit && !weWall) out.push({ id: sp.id, name: sp.name, usage: build.usage, types: ttypes });
    }
    return out.slice(0, 12);
  }, [meta, analysis.mons, tc]);

  if (analysis.mons.length === 0) {
    return (
      <div className="page-enter">
        <div className="mb-4"><h2 className="text-2xl font-bold">{t('Análisis del Equipo')}</h2></div>
        <div className="panel p-6 text-gray-400 text-center">{t('Añade Pokémon a tu equipo para ver el análisis.')}</div>
      </div>
    );
  }

  // Fila de utilidad: etiqueta + lista de sprites de quién lo aporta.
  const UtilRow = ({ label, mons }: { label: string; mons: { name: string; speciesId?: string; p?: { speciesId: string } }[] }) => (
    <div className="flex items-center gap-2 py-1.5 border-t border-poke-accent/20 first:border-0">
      <span className="text-sm text-gray-300 w-40 shrink-0">{label}</span>
      {mons.length === 0 ? (
        <span className="text-xs text-red-400/80">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {mons.map((m, i) => (
            <PokemonSprite key={i} speciesId={(m as { p?: { speciesId: string } }).p?.speciesId ?? m.speciesId ?? ''} className="w-7 h-7 object-contain" />
          ))}
        </div>
      )}
    </div>
  );

  const scoreColor = (v: number, max: number) => {
    const r = v / max;
    if (r >= 0.75) return 'bg-green-500';
    if (r >= 0.45) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  const SCORE_LABELS: Record<string, string> = { speed: 'Velocidad', offense: 'Cobertura ofensiva', defense: 'Solidez defensiva', utility: 'Utilidad' };

  // Multiplicador del tipo atacante sobre un Pokémon (con su habilidad).
  const effOn = (type: string, m: typeof analysis.mons[number]) =>
    applyAbility(getTypeEffectiveness(type, m.sp.types, tc), type, m.ability);

  return (
    <div className="page-enter">
      {/* Cabecera con arquetipo y puntuación */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold">{t('Análisis del Equipo')}</h2>
        <span
          key={analysis.archetype.key}
          className="pop-in px-3 py-1 rounded-full bg-poke-accent/60 text-sm font-medium border border-poke-pink/30"
        >
          {analysis.archetype.icon} {t(analysis.archetype.key)}
        </span>
        {analysis.archetypeSecondary && (
          <span
            key={analysis.archetypeSecondary.key}
            className="pop-in inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-poke-accent/30 text-sm font-medium border border-dashed border-poke-accent text-gray-300"
            title={t('Plan secundario del equipo')}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-poke-pink/20 text-poke-pink leading-none">
              {t('apoyo')}
            </span>
            {analysis.archetypeSecondary.icon} {t(analysis.archetypeSecondary.key)}
          </span>
        )}
        <span className="ml-auto text-sm text-gray-400">{t('Puntuación')}</span>
        <span className={`text-2xl font-bold ${analysis.total >= 75 ? 'text-green-400' : analysis.total >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
          <CountUp value={analysis.total} /><span className="text-sm text-gray-500">/100</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* ── Resumen: puntuación + avisos ── */}
        {/* Puntuación por categorías (#3) */}
        <div className="panel p-4 animate-fade-in-up">
          <h3 className="font-semibold mb-3">📊 {t('Puntuación por categoría')}</h3>
          <div className="space-y-2.5">
            {(['speed', 'offense', 'defense', 'utility'] as const).map((k, idx) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{t(SCORE_LABELS[k])}</span>
                  <span className="text-gray-400"><CountUp value={analysis.scores[k]} />/25</span>
                </div>
                <div className="h-2.5 rounded-full bg-poke-dark/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width,background-color] duration-500 ease-out ${scoreColor(analysis.scores[k], 25)}`}
                    style={{
                      width: `${barsReady ? (analysis.scores[k] / 25) * 100 : 0}%`,
                      transitionDelay: barsReady ? `${idx * 80}ms` : '0ms',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Avisos */}
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '40ms' }}>
          <h3 className="font-semibold mb-2 text-poke-pink">⚠ {t('Avisos')}</h3>
          {analysis.warnings.length === 0 ? (
            <p className="text-sm text-green-400">{t('Sin huecos evidentes. ¡Buen equipo!')} 🎉</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analysis.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-amber-300 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}><span>⚠</span><span>{t(w)}</span></li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Composición del equipo ── */}
        {/* Roles */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-semibold">🧩 {t('Roles')}</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_KIND_LABEL) as RoleKind[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <span className={`w-2.5 h-2.5 rounded-sm border ${ROLE_KIND_CLASS[k]}`} />
                  {t(ROLE_KIND_LABEL[k])}
                </span>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {analysis.roles.map((r, i) => {
              const mult = hoverType ? effOn(hoverType, analysis.mons[i]) : 1;
              const hl = hoverType ? (mult > 1 ? 'ring-1 ring-red-400/60 bg-red-900/15 rounded-lg' : 'opacity-30') : '';
              return (
              <div key={i} className={`flex items-start gap-2 animate-fade-in-up py-1 px-1 -mx-1 border-t border-poke-accent/15 first:border-0 sm:[&:nth-child(2)]:border-0 transition-all duration-150 ${hl}`} style={{ animationDelay: `${i * 50}ms` }}>
                <PokemonSprite speciesId={r.speciesId} className="w-7 h-7 object-contain shrink-0 mt-0.5" />
                <span className="text-sm w-24 truncate shrink-0 mt-1">{r.name}</span>
                <div className="flex flex-wrap gap-1">
                  {r.tags.length === 0 ? <span className="text-xs text-gray-500 mt-1">—</span> :
                    r.tags.map((tag) => (
                      <span key={tag.label} className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_KIND_CLASS[tag.kind]}`}>{t(tag.label)}</span>
                    ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* ── Análisis de tipos y utilidad ── */}
        {/* Cobertura resumida */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <h3 className="font-semibold mb-3">🛡️ {t('Cobertura de Tipos')}</h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-400 mb-1.5">{t('Debilidades compartidas (2+):')}</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.weakByType.length === 0 ? <span className="text-green-400 text-xs">{t('Ninguna')}</span> :
                  analysis.weakByType.map(({ type, count }, i) => (
                    <span key={type} onMouseEnter={() => setHoverType(type)} onMouseLeave={() => setHoverType(null)} className={`pop-in cursor-help type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium ${count >= 3 ? 'ring-2 ring-red-400' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>{type} ×{count}</span>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-1.5">{t('Tipos que nadie resiste:')}</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.unresisted.length === 0 ? <span className="text-green-400 text-xs">{t('Ninguno')} 🎉</span> :
                  analysis.unresisted.map((type, i) => (
                    <span key={type} onMouseEnter={() => setHoverType(type)} onMouseLeave={() => setHoverType(null)} className={`pop-in cursor-help type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium opacity-80`} style={{ animationDelay: `${i * 40}ms` }}>{type}</span>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-1.5">{t('Huecos ofensivos:')}</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.offGaps.length === 0 ? <span className="text-green-400 text-xs">{t('Ninguno')} 🎉</span> :
                  analysis.offGaps.map((type, i) => (
                    <span key={type} className={`pop-in type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium opacity-80`} style={{ animationDelay: `${i * 40}ms` }}>{type}</span>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Utilidad */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '160ms' }}>
          <h3 className="font-semibold mb-2">🔧 {t('Utilidad y Control')}</h3>
          <div className="grid sm:grid-cols-2 gap-x-6">
            <div>
              <UtilRow label={t('Fake Out')} mons={analysis.fakeOut} />
              <UtilRow label={t('Redirección')} mons={analysis.redirection} />
              <UtilRow label={t('Protección de Área')} mons={analysis.protectArea} />
              <UtilRow label={t('Intimidación')} mons={analysis.intimidate} />
              <UtilRow label={t('Apoyo a Aliado')} mons={analysis.allySupport} />
            </div>
            <div>
              <UtilRow label={t('Tailwind')} mons={analysis.tailwind} />
              <UtilRow label={t('Trick Room')} mons={analysis.trickRoom} />
              <UtilRow label={t('Ralentizar')} mons={analysis.speedCtrl} />
              <UtilRow label={t('Clima')} mons={analysis.weatherSetters} />
              <UtilRow label={t('Terreno')} mons={analysis.terrainSetters} />
            </div>
          </div>
        </div>

        {/* ── Sinergias y contexto del meta ── */}
        {/* Sinergias (#6) */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <h3 className="font-semibold mb-2">✨ {t('Sinergias')}</h3>
          {analysis.synergies.length === 0 && analysis.antiSynergies.length === 0 ? (
            <p className="text-sm text-gray-500">{t('No se detectaron sinergias de habilidad notables.')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analysis.synergies.map((s, i) => (
                <li key={`s${i}`} className="flex items-start gap-2 text-green-300 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}><span>✓</span><span>{s}</span></li>
              ))}
              {analysis.antiSynergies.map((s, i) => (
                <li key={`a${i}`} className="flex items-start gap-2 text-amber-300 animate-fade-in-up" style={{ animationDelay: `${(analysis.synergies.length + i) * 50}ms` }}><span>⚠</span><span>{s}</span></li>
              ))}
            </ul>
          )}
        </div>

        {/* Amenazas del meta (#1) */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
          <h3 className="font-semibold mb-1">🎯 {t('Amenazas del meta')}</h3>
          <p className="text-xs text-gray-500 mb-3">
            {t('Pokémon muy usados que tu equipo ni resiste ni golpea supereficaz.')}
            {meta?.month && <span> · {meta.month}</span>}
          </p>
          {!meta ? (
            <div className="flex flex-wrap gap-2">
              {/* Skeleton: chips de amenaza (imita las tarjetas reales) */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 bg-poke-dark/40 rounded-lg pl-1 pr-2.5 py-1 border border-red-500/20">
                  <div className="skeleton w-8 h-8 rounded" />
                  <div className="space-y-1">
                    <div className="skeleton h-2.5 w-16" />
                    <div className="skeleton h-2 w-8" />
                  </div>
                </div>
              ))}
            </div>
          ) : threats.length === 0 ? (
            <p className="text-sm text-green-400">{t('Tu equipo tiene respuesta para las amenazas más usadas. 🎉')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {threats.map((th, i) => (
                <div key={th.id} className="pop-in flex items-center gap-2 bg-poke-dark/40 rounded-lg pl-1 pr-2.5 py-1 border border-red-500/30 transition-transform hover:scale-105 hover:border-red-400/60" style={{ animationDelay: `${i * 50}ms` }}>
                  <PokemonSprite speciesId={th.id} className="w-8 h-8 object-contain" />
                  <div className="leading-tight">
                    <div className="text-xs font-medium">{th.name}</div>
                    <div className="text-[10px] text-gray-400">{th.usage.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
