import { useState, useEffect, useRef } from 'react';

interface DropdownProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  render?: (value: string) => React.ReactNode;
  placeholder?: string;
  expand?: boolean;
  className?: string;
}

/** Desplegable personalizado con la estética oscura de la app (sustituye a <select>). */
export function Dropdown({
  value,
  options,
  onChange,
  render,
  placeholder = 'Seleccionar',
  expand = false,
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className="select-field flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value ? 'truncate' : 'truncate text-gray-400'}>
          {value ? (render ? render(value) : value) : placeholder}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul className={`absolute z-20 w-full mt-1 bg-poke-panel border border-poke-accent rounded-lg shadow-xl ${expand ? '' : 'max-h-60 overflow-auto'}`}>
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 hover:bg-poke-accent/50 ${
                  o === value ? 'bg-poke-gold/20 text-poke-gold' : ''
                }`}
                onClick={() => { onChange(o); setOpen(false); }}
              >
                {render ? render(o) : o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
