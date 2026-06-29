import type { ReactNode } from 'react';

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Clases extra para el contenedor (p. ej. ancho o margen). */
  className?: string;
}

/**
 * Control segmentado con la estética de la app: contenedor acolchado oscuro y
 * una pastilla rosa que se desliza hasta la opción activa. Los segmentos son de
 * igual ancho (flex-1), por lo que el indicador se alinea solo.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, className = '' }: SegmentedControlProps<T>) {
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div className={`relative flex p-1 rounded-xl bg-poke-dark/50 border border-poke-accent/40 ${className}`}>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-lg bg-poke-pink transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative z-10 flex-1 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors duration-200 ${o.value === value ? 'text-white' : 'text-gray-300 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
