import { useMemo, useState } from 'react';

interface ComboboxProps {
  /** Ids/valores disponibles. */
  items: string[];
  /** Valor seleccionado ('' = ninguno). */
  value: string;
  /** Etiqueta visible para un id (ya localizada). */
  getLabel: (id: string) => string;
  onPick: (id: string) => void;
  placeholder: string;
  /** Permite la opción «— —» para vaciar la selección. */
  clearable?: boolean;
  /** Máximo de resultados mostrados. */
  limit?: number;
}

/**
 * Selector con búsqueda por texto (coincide en cualquier posición). Cierra al
 * perder el foco y al elegir. Base reutilizable para movimientos, habilidades, etc.
 */
export function Combobox({ items, value, getLabel, onPick, placeholder, clearable, limit = 40 }: ComboboxProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    const list = items.filter(Boolean);
    return (s ? list.filter((id) => getLabel(id).toLowerCase().includes(s)) : list).slice(0, limit);
  }, [q, items, getLabel, limit]);

  return (
    <div className="relative">
      <input
        className="input-field"
        placeholder={placeholder}
        value={open ? q : value ? getLabel(value) : ''}
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
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-sm" onMouseDown={() => { onPick(id); setOpen(false); }}>{getLabel(id)}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
