import { useCallback, useMemo } from 'react';
import { localizeName } from '../lib/championsData';
import { Combobox } from './Combobox';

/** Selector de movimiento con búsqueda por texto (coincide en cualquier posición). */
export function MoveSearch({ moves, value, names, onPick, placeholder, lang, clearable, usageMap }) {
  const getLabel = useCallback((id) => localizeName('moves', names[id] ?? id, lang), [names, lang]);
  const sortedMoves = useMemo(() => {
    if (!usageMap || usageMap.size === 0) return moves;
    return [...moves].sort((a, b) => (usageMap.get(b) ?? -1) - (usageMap.get(a) ?? -1));
  }, [moves, usageMap]);
  const renderOption = useCallback((id) => {
    const label = getLabel(id);
    const pct = usageMap?.get(id);
    if (pct == null || pct < 1) return label;
    return (
      <span className="flex items-center justify-between gap-2 w-full">
        <span className="truncate">{label}</span>
        <span className="text-xs font-mono text-poke-pink shrink-0">{Math.round(pct)}%</span>
      </span>
    );
  }, [getLabel, usageMap]);
  return (
    <Combobox
      items={sortedMoves}
      value={value}
      getLabel={getLabel}
      renderOption={usageMap && usageMap.size > 0 ? renderOption : undefined}
      onPick={onPick}
      placeholder={placeholder}
      clearable={clearable}
    />
  );
}
