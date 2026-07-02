import { useId, useState, type ReactNode } from 'react';

interface InfoTooltipProps {
  /** Contenido explicativo del tooltip (admite texto o markup). */
  children: ReactNode;
  /** Lado por el que aparece respecto al icono. Por defecto arriba. */
  side?: 'top' | 'bottom';
  /** Clases extra para el botón (p. ej. margen o tamaño). */
  className?: string;
  /** Etiqueta accesible del botón (por defecto "Más información"). */
  label?: string;
}

/**
 * Pequeño icono (i) que muestra un texto explicativo al pasar el ratón por
 * encima o al recibir foco por teclado. Accesible (role="tooltip" +
 * aria-describedby) y con la estética oscura de la app. La animación de
 * aparición vive en index.css (`.tooltip-in`) y respeta prefers-reduced-motion.
 */
export function InfoTooltip({ children, side = 'top', className = '', label = 'Más información' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-poke-accent/60 bg-poke-dark/50 text-[10px] font-bold leading-none text-gray-300 hover:text-white hover:border-poke-pink focus:outline-none focus-visible:ring-2 focus-visible:ring-poke-pink transition-colors ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`tooltip-in absolute left-1/2 z-[120] w-56 max-w-[70vw] -translate-x-1/2 panel px-3 py-2 text-xs font-normal normal-case text-gray-100 shadow-2xl pointer-events-none ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
