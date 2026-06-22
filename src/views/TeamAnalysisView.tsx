import { useMemo } from 'react';
import { useTeam } from '../store/teamStore';
import { getSpecies } from '../lib/championsData';
import { getTypeEffectiveness, TYPE_NAMES } from '../lib/typeChart';
import { PokemonSprite } from '../components/PokemonSprite';
import { useLang } from '../lib/i18n';
import type { ChampionsData } from '../types/pokemon';

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
  // Útiles en dobles:
  protectArea: new Set(['wideguard', 'quickguard', 'matblock']),
  allySupport: new Set(['helpinghand', 'decorate', 'coaching']),
  weatherMove: new Set(['sunnyday', 'raindance', 'sandstorm', 'snowscape', 'chillyreception']),
  terrainMove: new Set(['electricterrain', 'grassyterrain', 'psychicterrain', 'mistyterrain']),
};
const WEATHER_ABILITIES = new Set(['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Orichalcum Pulse', 'Desolate Land', 'Primordial Sea']);
const TERRAIN_ABILITIES = new Set(['Electric Surge', 'Grassy Surge', 'Psychic Surge', 'Misty Surge', 'Hadron Engine']);

export function TeamAnalysisView({ data }: Props) {
  const { activeTeam } = useTeam();
  const { t } = useLang();
  const tc = data.typeChart;

  const analysis = useMemo(() => {
    const mons = (activeTeam?.pokemon ?? [])
      .filter((p) => p.speciesId)
      .map((p) => {
        const sp = getSpecies(p.speciesId)!;
        const moveIds = p.moves.filter(Boolean);
        const moveTypes = [...new Set(moveIds
          .map((id) => data.moveData?.[id])
          .filter((md): md is NonNullable<typeof md> => !!md && md.category !== 'Status')
          .map((md) => md.type))];
        const hasPhysical = moveIds.some((id) => data.moveData?.[id]?.category === 'Physical' && (data.moveData?.[id]?.power ?? 0) > 0);
        const hasSpecial = moveIds.some((id) => data.moveData?.[id]?.category === 'Special' && (data.moveData?.[id]?.power ?? 0) > 0);
        const has = (s: Set<string>) => moveIds.some((id) => s.has(id));
        const bulk = sp.baseStats.hp + sp.baseStats.def + sp.baseStats.spd;
        return { p, sp, name: p.speciesName, moveIds, moveTypes, hasPhysical, hasSpecial, has, bulk, ability: p.ability };
      });

    // Debilidades defensivas compartidas (incluye habilidades).
    const weakByType = TYPE_NAMES.map((type) => {
      const count = mons.filter((m) => applyAbility(getTypeEffectiveness(type, m.sp.types, tc), type, m.ability) > 1).length;
      return { type, count };
    }).filter((w) => w.count >= 2).sort((a, b) => b.count - a.count);

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
    const protectArea = withMove(SET.protectArea);
    const allySupport = withMove(SET.allySupport);
    const weatherSetters = mons.filter((m) => m.has(SET.weatherMove) || WEATHER_ABILITIES.has(m.ability));
    const terrainSetters = mons.filter((m) => m.has(SET.terrainMove) || TERRAIN_ABILITIES.has(m.ability));
    const intimidate = mons.filter((m) => m.ability === 'Intimidate');
    const scarf = mons.filter((m) => m.p.item === 'Choice Scarf');

    // Roles por Pokémon.
    const roles = mons.map((m) => {
      const r: string[] = [];
      if (m.hasPhysical && m.hasSpecial) r.push('Mixto');
      else if (m.hasPhysical) r.push('Físico');
      else if (m.hasSpecial) r.push('Especial');
      const support = m.has(SET.speedCtrl) || m.has(SET.redirection) || m.has(SET.screens) || m.has(SET.protectArea) || m.has(SET.allySupport) || m.has(SET.fakeOut) || m.has(SET.paralyze) || m.has(SET.burn) || m.has(SET.sleep);
      if (support) r.push('Soporte');
      if (m.bulk >= 300 && (m.has(SET.recovery) || (!m.hasPhysical && !m.hasSpecial))) r.push('Muro');
      return { name: m.name, speciesId: m.p.speciesId, roles: r };
    });

    // Avisos.
    const warnings: string[] = [];
    if (mons.length > 0) {
      if (tailwind.length === 0 && trickRoom.length === 0 && speedCtrl.length === 0) warnings.push('Sin control de velocidad (Tailwind, Trick Room, baja-velocidades).');
      if (priority.length === 0) warnings.push('Sin movimientos de prioridad.');
      if (redirection.length === 0 && protectArea.length === 0) warnings.push('Sin redirección ni protección de área (Follow Me, Vasta Guardia…).');
      if (fakeOut.length === 0) warnings.push('Sin Fake Out (presión de retroceso en dobles).');
      for (const w of weakByType.filter((x) => x.count >= 3)) warnings.push(`Débil en común a ${w.type} (${w.count}).`);
      if (!mons.some((m) => m.hasPhysical)) warnings.push('Ningún atacante físico.');
      if (!mons.some((m) => m.hasSpecial)) warnings.push('Ningún atacante especial.');
    }

    return { mons, weakByType, offGaps, tailwind, trickRoom, speedCtrl, redirection, fakeOut, recovery, priority, protectArea, allySupport, weatherSetters, terrainSetters, intimidate, scarf, roles, warnings };
  }, [activeTeam, data, tc]);

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

  return (
    <div className="page-enter">
      <div className="mb-4"><h2 className="text-2xl font-bold">{t('Análisis del Equipo')}</h2></div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {/* Avisos */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up">
          <h3 className="font-semibold mb-2 text-poke-gold">{t('Avisos')}</h3>
          {analysis.warnings.length === 0 ? (
            <p className="text-sm text-green-400">{t('Sin huecos evidentes. ¡Buen equipo!')} 🎉</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analysis.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-amber-300"><span>⚠</span><span>{w}</span></li>
              ))}
            </ul>
          )}
        </div>

        {/* Cobertura */}
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '40ms' }}>
          <h3 className="font-semibold mb-2">{t('Cobertura de Tipos')}</h3>
          <div className="text-sm mb-2">
            <div className="text-gray-400 mb-1">{t('Debilidades compartidas (2+):')}</div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.weakByType.length === 0 ? <span className="text-green-400 text-xs">{t('Ninguna')}</span> :
                analysis.weakByType.map(({ type, count }) => (
                  <span key={type} className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium ${count >= 3 ? 'ring-2 ring-red-400' : ''}`}>{type} ×{count}</span>
                ))}
            </div>
          </div>
          <div className="text-sm">
            <div className="text-gray-400 mb-1">{t('Huecos ofensivos:')}</div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.offGaps.length === 0 ? <span className="text-green-400 text-xs">{t('Ninguno')} 🎉</span> :
                analysis.offGaps.map((type) => (
                  <span key={type} className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium opacity-80`}>{type}</span>
                ))}
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="panel p-4 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <h3 className="font-semibold mb-2">{t('Roles')}</h3>
          <div className="space-y-1.5">
            {analysis.roles.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <PokemonSprite speciesId={r.speciesId} className="w-7 h-7 object-contain shrink-0" />
                <span className="text-sm w-28 truncate">{r.name}</span>
                <div className="flex flex-wrap gap-1">
                  {r.roles.length === 0 ? <span className="text-xs text-gray-500">—</span> :
                    r.roles.map((role) => <span key={role} className="text-[10px] px-1.5 py-0.5 rounded bg-poke-accent/60 text-gray-100">{t(role)}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Utilidad */}
        <div className="panel p-4 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <h3 className="font-semibold mb-2">{t('Utilidad y Control')}</h3>
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
      </div>
    </div>
  );
}
