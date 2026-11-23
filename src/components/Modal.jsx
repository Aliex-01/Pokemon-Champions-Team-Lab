import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Modal centrado con fondo oscurecido, cierre con Escape y clic fuera. */
export function Modal({ open, onClose, title, children, widthClass = 'max-w-sm' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // Bloquea el scroll del fondo mientras el modal está abierto (sin salto horizontal).
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal a <body>: evita que un ancestro con contexto de apilado (p. ej. el
  // sidebar sticky) deje el modal por debajo de otros elementos.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up"
      onMouseDown={onClose}
    >
      <div
        className={`panel modal-pop w-full ${widthClass} p-5 shadow-2xl max-h-[85vh] overflow-y-auto overscroll-contain`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-poke-pink mb-4">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}
