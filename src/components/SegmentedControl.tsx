import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Clases extra para el contenedor (p. ej. ancho o margen). */
  className?: string;
  /** Ocupa todo el ancho con segmentos iguales (en vez de ajustarse al texto). */
  fluid?: boolean;
}

/**
 * Control segmentado con la estética de la app: contenedor acolchado oscuro y
 * una pastilla rosa que se desliza hasta la opción activa. La pastilla se mide
 * sobre el botón activo, así encaja con cualquier ancho de etiqueta o idioma.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, className = '', fluid = false }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const c = ref.current;
    const el = c?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(value)}"]`);
    if (!c || !el) return;
    const measure = () => setPill({ left: el.offsetLeft - c.clientLeft, width: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div ref={ref} className={`relative ${fluid ? 'flex' : 'inline-flex'} p-1 rounded-xl bg-poke-dark/50 border border-poke-accent/40 ${className}`}>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-lg bg-poke-pink transition-all duration-300 ease-out"
        style={{ left: pill.left, width: pill.width }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          data-seg={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative z-10 ${fluid ? 'flex-1' : ''} px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors duration-200 ${o.value === value ? 'text-white' : 'text-gray-300 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
