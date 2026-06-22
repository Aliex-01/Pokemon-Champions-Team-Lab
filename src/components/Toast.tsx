import { useEffect, useRef, useState } from 'react';

type Tone = 'info' | 'success' | 'error';

/** Aviso flotante abajo a la derecha: entra deslizando y se auto-oculta con fade. */
export function Toast({ message, onClose, tone = 'info' }: { message: string; onClose: () => void; tone?: Tone }) {
  const [leaving, setLeaving] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!message) return;
    setLeaving(false);
    const t1 = setTimeout(() => setLeaving(true), 2500);
    const t2 = setTimeout(() => onCloseRef.current(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [message]);

  if (!message) return null;

  const toneCls =
    tone === 'success' ? 'border-green-500/50 text-green-300'
    : tone === 'error' ? 'border-red-500/50 text-red-300'
    : 'border-poke-accent text-gray-100';

  return (
    <div className={`fixed bottom-4 right-4 z-[120] panel px-4 py-3 text-sm shadow-2xl max-w-xs ${toneCls} ${leaving ? 'toast-out' : 'toast-in'}`}>
      {message}
    </div>
  );
}
