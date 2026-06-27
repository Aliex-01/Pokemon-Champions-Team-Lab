import { useMemo, useState } from 'react';
import { localizeName } from '../lib/championsData';

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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const label = (id: string) => (id ? localizeName('moves', names[id] ?? id, lang) : '');
  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    const list = moves.filter(Boolean);
    return (s ? list.filter((id) => localizeName('moves', names[id] ?? id, lang).toLowerCase().includes(s)) : list).slice(0, 40);
  }, [q, moves, names, lang]);

  return (
    <div className="relative">
      <input
        className="input-field"
        placeholder={placeholder}
        value={open ? q : label(value)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || clearable) && (
        <ul className="absolute z-20 w-full mt-1 max-h-56 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {clearable && (
            <li>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-sm text-gray-400" onMouseDown={() => { onPick(''); setOpen(false); }}>— —</button>
            </li>
          )}
          {results.map((id) => (
            <li key={id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-sm" onMouseDown={() => { onPick(id); setOpen(false); }}>{label(id)}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
