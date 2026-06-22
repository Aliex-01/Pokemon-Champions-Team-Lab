import { useMemo, useState } from 'react';
import { useTeam } from '../store/teamStore';
import { getSpecies } from '../lib/championsData';
import { getTypeEffectiveness, TYPE_NAMES } from '../lib/typeChart';
import { PokemonSprite } from '../components/PokemonSprite';
import { useLang } from '../lib/i18n';
import type { ChampionsData } from '../types/pokemon';

interface CoverageViewProps {
  data: ChampionsData;
}

// Habilidades que dan inmunidad a un tipo (defensiva).
const ABILITY_IMMUNE: Record<string, string> = {
  Levitate: 'Ground', 'Earth Eater': 'Ground',
  'Water Absorb': 'Water', 'Storm Drain': 'Water', 'Dry Skin': 'Water',
  'Volt Absorb': 'Electric', 'Lightning Rod': 'Electric', 'Motor Drive': 'Electric',
  'Flash Fire': 'Fire', 'Well-Baked Body': 'Fire',
  'Sap Sipper': 'Grass',
};
// Habilidades que resisten (×0.5) ciertos tipos.
const ABILITY_RESIST: Record<string, string[]> = {
  'Thick Fat': ['Fire', 'Ice'], Heatproof: ['Fire'], 'Water Bubble': ['Fire'], 'Purifying Salt': ['Ghost'],
};

function applyAbility(mult: number, attackType: string, ability: string): number {
  if (!ability) return mult;
  if (ABILITY_IMMUNE[ability] === attackType) return 0;
  if (ABILITY_RESIST[ability]?.includes(attackType)) return mult * 0.5;
  return mult;
}

function effLabel(m: number): string {
  if (m === 0) return '0';
  if (m === 0.25) return '/4';
  if (m === 0.5) return '/2';
  if (m === 2) return '2';
  if (m === 4) return '4';
  return '';
}

// Defensiva: débil = rojo, resiste = verde, inmune = azul.
function effClassDef(m: number): string {
  if (m === 0) return 'bg-blue-900/70 text-blue-200';
  if (m > 1) return m >= 4 ? 'bg-red-900 text-red-100' : 'bg-red-600/80 text-white';
  if (m < 1) return m <= 0.25 ? 'bg-green-900 text-green-100' : 'bg-green-600/80 text-white';
  return 'bg-poke-dark/30 text-gray-600';
}

// Ofensiva: supereficaz = verde, poco eficaz/inmune = rojo/gris.
function effClassOff(m: number): string {
  if (m === 0) return 'bg-blue-900/70 text-blue-200';
  if (m > 1) return m >= 4 ? 'bg-green-900 text-green-100' : 'bg-green-600/80 text-white';
  if (m < 1) return 'bg-red-600/80 text-white';
  return 'bg-poke-dark/30 text-gray-600';
}

export function CoverageView({ data }: CoverageViewProps) {
  const { activeTeam } = useTeam();
  const { t } = useLang();
  const [mode, setMode] = useState<'def' | 'off'>('def');

  const team = useMemo(() => {
    return (activeTeam?.pokemon ?? [])
      .filter((p) => p.speciesId)
      .map((p) => {
        const sp = getSpecies(p.speciesId);
        const moveTypes = [
          ...new Set(
            p.moves
              .filter(Boolean)
              .map((id) => data.moveData?.[id])
              .filter((md): md is NonNullable<typeof md> => !!md && md.category !== 'Status')
              .map((md) => md.type)
          ),
        ];
        return { name: p.speciesName, speciesId: p.speciesId, ability: p.ability, types: sp?.types ?? [], moveTypes };
      });
  }, [activeTeam, data]);

  type TeamMon = (typeof team)[number];
  const tc = data.typeChart;

  const cellValue = (type: string, mon: TeamMon): number => {
    if (mode === 'def') return applyAbility(getTypeEffectiveness(type, mon.types, tc), type, mon.ability);
    return mon.moveTypes.length ? Math.max(...mon.moveTypes.map((t) => getTypeEffectiveness(t, [type], tc))) : 1;
  };

  // Análisis: tipos a los que el equipo es muy débil y huecos ofensivos.
  const analysis = useMemo(() => {
    const weakTypes: { type: string; count: number }[] = [];
    const offGaps: string[] = [];
    for (const type of TYPE_NAMES) {
      const defWeak = team.filter((m) => applyAbility(getTypeEffectiveness(type, m.types, tc), type, m.ability) > 1).length;
      if (defWeak >= 3) weakTypes.push({ type, count: defWeak });
      const se = team.filter((m) => m.moveTypes.length && Math.max(...m.moveTypes.map((t) => getTypeEffectiveness(t, [type], tc))) > 1).length;
      if (se === 0) offGaps.push(type);
    }
    weakTypes.sort((a, b) => b.count - a.count);
    return { weakTypes, offGaps };
  }, [team, tc]);

  const effClass = mode === 'def' ? effClassDef : effClassOff;
  const legend = mode === 'def'
    ? [{ v: 4, t: 'Débil ×4' }, { v: 2, t: 'Débil ×2' }, { v: 0.5, t: 'Resiste /2' }, { v: 0.25, t: 'Resiste /4' }, { v: 0, t: 'Inmune' }]
    : [{ v: 2, t: 'Supereficaz' }, { v: 0.5, t: 'Poco eficaz' }, { v: 0, t: 'Sin efecto' }];

  return (
    <div className="page-enter">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{t('Cobertura de Tipos')}</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <button type="button" className={`px-4 py-2 rounded-lg ${mode === 'def' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('def')}>{t('Defensiva')}</button>
        <button type="button" className={`px-4 py-2 rounded-lg ${mode === 'off' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('off')}>{t('Ofensiva')}</button>
      </div>

      {team.length === 0 ? (
        <div className="panel p-6 text-gray-400 text-center">{t('Añade Pokémon a tu equipo para ver la cobertura.')}</div>
      ) : (
        <>
          {mode === 'def' && analysis.weakTypes.length > 0 && (
            <div className="panel p-3 mb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-red-400 font-semibold mr-1">{t('Debilidades comunes (3+):')}</span>
                {analysis.weakTypes.map(({ type, count }) => (
                  <span key={type} className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>{type} ×{count}</span>
                ))}
              </div>
            </div>
          )}
          {mode === 'off' && (
            <div className="panel p-3 mb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-amber-400 font-semibold mr-1">{t('Huecos ofensivos:')}</span>
                {analysis.offGaps.length === 0 ? (
                  <span className="text-xs text-green-400">{t('Golpeas supereficaz a todos los tipos 🎉')}</span>
                ) : (
                  analysis.offGaps.map((type) => (
                    <span key={type} className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium opacity-80`}>{type}</span>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-gray-400">
            {legend.map(({ v, t: label }) => (
              <div key={v} className="flex items-center gap-1.5">
                <div className={`w-7 rounded font-mono text-center py-0.5 ${effClass(v)}`}>{effLabel(v)}</div>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full table-fixed text-sm border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 bg-poke-panel z-10 w-24">{t('Tipo')}</th>
                  {team.map((m) => (
                    <th key={m.speciesId} className="px-1 py-2 align-bottom">
                      <div className="flex flex-col items-center gap-0.5">
                        <PokemonSprite speciesId={m.speciesId} className="w-9 h-9 object-contain" />
                        <span className="text-[10px] text-gray-400 text-center leading-tight break-words">{m.name}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-1 py-2 text-center text-xs text-gray-400 w-12">{mode === 'def' ? t('Déb') : t('SE')}</th>
                  <th className="px-1 py-2 text-center text-xs text-gray-400 w-12">{mode === 'def' ? t('Res') : t('PE')}</th>
                  <th className="px-1 py-2 text-center text-xs text-gray-400 w-12">{t('Inm')}</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_NAMES.map((type, ti) => {
                  const vals = team.map((m) => cellValue(type, m));
                  const weak = vals.filter((v) => v > 1).length;
                  const resist = vals.filter((v) => v < 1 && v > 0).length;
                  const immune = vals.filter((v) => v === 0).length;
                  return (
                    <tr key={type} className="border-t border-poke-accent/20 hover:bg-poke-accent/10 group animate-fade-in-up" style={{ animationDelay: `${ti * 20}ms` }}>
                      <td className="px-3 py-1 sticky left-0 bg-poke-panel z-10 group-hover:bg-poke-accent/10">
                        <span className={`type-${type.toLowerCase()} px-2 py-0.5 rounded text-xs font-medium`}>{type}</span>
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className="px-1 py-1 text-center">
                          <div className={`w-10 h-6 mx-auto rounded font-mono text-xs flex items-center justify-center transition-colors duration-300 ${effClass(v)}`}>{effLabel(v)}</div>
                        </td>
                      ))}
                      <td className={`px-2 py-1 text-center font-bold text-xs ${mode === 'def' ? 'text-red-400' : 'text-green-400'}`}>{weak || ''}</td>
                      <td className={`px-2 py-1 text-center font-bold text-xs ${mode === 'def' ? 'text-green-400' : 'text-red-400'}`}>{resist || ''}</td>
                      <td className="px-2 py-1 text-center font-bold text-xs text-blue-300">{immune || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
