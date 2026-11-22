import { useCallback } from 'react';
import { localizeName } from '../lib/championsData';
import { Combobox } from './Combobox';

/** Selector de movimiento con búsqueda por texto (coincide en cualquier posición). */
export function MoveSearch({ moves, value, names, onPick, placeholder, lang, clearable }) {
  const getLabel = useCallback((id) => localizeName('moves', names[id] ?? id, lang), [names, lang]);
  return (
    <Combobox
      items={moves}
      value={value}
      getLabel={getLabel}
      onPick={onPick}
      placeholder={placeholder}
      clearable={clearable}
    />
  );
}
