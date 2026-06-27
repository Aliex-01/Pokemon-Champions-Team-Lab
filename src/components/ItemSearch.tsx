import { useMemo, useState } from 'react';
import { localizeName } from '../lib/championsData';
import { ItemSprite } from './PokemonSprite';

interface Props {
  items: string[];                 // nombres de objeto (EN) del formato
  value: string;                   // objeto seleccionado (EN)
  onPick: (name: string) => void;
  placeholder: string;
  lang: 'es' | 'en';
  disabled?: boolean;
  clearable?: boolean;
}

/** Selector de objeto con búsqueda por texto (coincide en cualquier posición). */
export function ItemSearch({ items, value, onPick, placeholder, lang, disabled, clearable }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const label = (name: string) => (name ? localizeName('items', name, lang) : '');
  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    return (s ? items.filter((n) => localizeName('items', n, lang).toLowerCase().includes(s)) : items).slice(0, 40);
  }, [q, items, lang]);

  return (
    <div className="relative">
      <div className="relative">
        {value && <span className="absolute left-2 inset-y-0 flex items-center pointer-events-none"><ItemSprite item={value} className="w-5 h-5" /></span>}
        <input
          className="input-field"
          style={value ? { paddingLeft: '2rem' } : undefined}
          placeholder={placeholder}
          disabled={disabled}
          value={open ? q : label(value)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(''); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && !disabled && (results.length > 0 || clearable) && (
        <ul className="absolute z-20 w-full mt-1 max-h-56 overflow-auto bg-poke-panel border border-poke-accent rounded-lg shadow-xl">
          {clearable && (
            <li><button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-sm text-gray-400" onMouseDown={() => { onPick(''); setOpen(false); }}>— —</button></li>
          )}
          {results.map((name) => (
            <li key={name}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-poke-accent/50 text-sm flex items-center gap-2" onMouseDown={() => { onPick(name); setOpen(false); }}>
                <ItemSprite item={name} className="w-5 h-5" />{localizeName('items', name, lang)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
