import { useLayoutEffect, useRef } from 'react';

/**
 * Animación FLIP con entrada coordinada. Cuando la lista cambia (`deps`):
 *  - los elementos que permanecen se deslizan desde su posición anterior a la nueva,
 *  - los que aparecen (al quitar/cambiar un filtro) hacen un fade + scale suave,
 *    escalonados según el orden en que entran (no según su posición en el grid).
 *
 * Cada hijo a animar debe tener un atributo `data-flip-id` único.
 * Devuelve un ref para el contenedor del grid/lista.
 */
export function useFlip<T extends HTMLElement = HTMLDivElement>(deps: unknown) {
  const containerRef = useRef<T>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prev = prevRects.current;
    const next = new Map<string, DOMRect>();
    let enterIndex = 0;

    container.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId!;
      const rect = el.getBoundingClientRect();
      next.set(id, rect);

      if (reduce) return;

      const old = prev.get(id);
      if (old) {
        // Permanece: se desliza desde la posición antigua a la nueva (FLIP).
        const dx = old.left - rect.left;
        const dy = old.top - rect.top;
        if (!dx && !dy) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
      } else {
        // Entra: fade + scale en su sitio, escalonado por orden de entrada.
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'scale(1)' },
          ],
          {
            duration: 260,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            delay: Math.min(enterIndex, 14) * 22,
            fill: 'backwards', // mantiene opacity:0 durante el delay (sin parpadeo)
          }
        );
        enterIndex++;
      }
    });

    prevRects.current = next;
  }, [deps]);

  return containerRef;
}
