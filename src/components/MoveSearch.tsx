import { useCallback } from 'react';
import { localizeName } from '../lib/championsData';
import { Combobox } from './Combobox';

interface Props {
  moves: string[];                 // ids de movimientos disponibles
  value: string;                   // id seleccionado
  names: Record<string, string>;   // id → nombre (EN)
  onPick: (id: string) => void;
  placeholder: string;
  lang: 'es' | 'en';
  clearable?: boolean;             // permite dejar el hueco vacío
}

/** Selector de movimiento con búsqueda por texto (coincide en cualquier posición). */
export function MoveSearch({ moves, value, names, onPick, placeholder, lang, clearable }: Props) {
  const getLabel = useCallback((id: string) => localizeName('moves', names[id] ?? id, lang), [names, lang]);
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
