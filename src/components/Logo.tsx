/** Logo de la app: una Poké Ball estilizada con los colores del tema. */
export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-label="Logo">
      <defs>
        <clipPath id="ball-clip">
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>
      <g clipPath="url(#ball-clip)">
        <rect x="0" y="0" width="64" height="32" fill="#e94560" />
        <rect x="0" y="32" width="64" height="32" fill="#eef0f7" />
        <rect x="0" y="28.5" width="64" height="7" fill="#16213e" />
      </g>
      <circle cx="32" cy="32" r="29" fill="none" stroke="#16213e" strokeWidth="3" />
      <circle cx="32" cy="32" r="11" fill="#16213e" />
      <circle cx="32" cy="32" r="6.5" fill="#eef0f7" />
      <circle cx="32" cy="32" r="3" fill="#e94560" />
    </svg>
  );
}
