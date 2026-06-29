import { useRef, useState } from 'react';
import { getSpriteUrls, getItemSpritenum } from '../lib/championsData';

const ITEM_SHEET = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png';

interface PokemonSpriteProps {
  speciesId: string;
  className?: string;
  alt?: string;
  /** Muestra un placeholder con shimmer mientras la imagen carga. */
  skeleton?: boolean;
}

export function PokemonSprite({ speciesId, className = 'w-12 h-12 object-contain', alt = '', skeleton = false }: PokemonSpriteProps) {
  const urls = getSpriteUrls(speciesId);
  const [urlIndex, setUrlIndex] = useState(0);
  const [prevId, setPrevId] = useState(speciesId);
  const [loaded, setLoaded] = useState(false);
  // URL que ya cargó bien: para ignorar errores espurios que el navegador
  // dispara al re-renderizar/relayout (p. ej. al cambiar el objeto del rival).
  const loadedSrc = useRef<string | null>(null);

  // Reinicia el fallback al cambiar de especie, durante el render (sin parpadeo),
  // porque al cambiar de equipo React reutiliza la instancia (mismo slotId).
  if (prevId !== speciesId) {
    setPrevId(speciesId);
    setUrlIndex(0);
    setLoaded(false);
    loadedSrc.current = null;
  }

  if (!speciesId || urlIndex >= urls.length) {
    return <div className={`${className} bg-poke-dark/30 rounded`} />;
  }

  const src = urls[urlIndex];
  const onLoad = () => { loadedSrc.current = src; setLoaded(true); };
  const onError = () => { if (loadedSrc.current !== src) setUrlIndex((i) => i + 1); };

  if (!skeleton) {
    return (
      <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onLoad={onLoad} onError={onError} />
    );
  }

  // Variante con placeholder: contenedor con el tamaño, shimmer detrás y la
  // imagen encima (oculta hasta que carga).
  return (
    <span className={`relative block ${className}`}>
      {!loaded && <span className="skeleton absolute inset-0 rounded-lg" />}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        onError={onError}
      />
    </span>
  );
}

interface ItemSpriteProps {
  item: string;
  /** Tamaño en px del icono (la hoja es de 24px; se escala proporcionalmente). */
  size?: number;
  className?: string;
}

/** Icono del objeto recortado de la hoja de sprites de Showdown (24×24, 16 por fila). */
export function ItemSprite({ item, size = 24, className = '' }: ItemSpriteProps) {
  const num = item ? getItemSpritenum(item) : undefined;
  if (num == null) return null;

  const scale = size / 24;
  const left = (num % 16) * 24 * scale;
  const top = Math.floor(num / 16) * 24 * scale;

  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: `transparent url("${ITEM_SHEET}") no-repeat -${left}px -${top}px`,
        backgroundSize: `${16 * 24 * scale}px auto`,
        imageRendering: 'pixelated',
      }}
    />
  );
}
