import { useState, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { canSeeDevPages } from '../lib/devPages';
import { useRouteSeo } from '../lib/seo';
import { AccountMenu } from './AccountMenu';
import { Dropdown } from './Dropdown';
import { Modal } from './Modal';

// Banderas en SVG (los emojis de bandera no se renderizan en Chrome/Edge sobre Windows).
// Misma caja para ambas (w-6 h-4); preserveAspectRatio="none" las estira para
// llenarla sin huecos, ya que España (3:2) y Reino Unido (2:1) no comparten proporción.
const flagClass = 'w-6 h-4 rounded-[2px] shrink-0 ring-1 ring-black/30';

function FlagES() {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="none" className={flagClass} aria-label="Español">
      <rect width="3" height="2" fill="#c60b1e" />
      <rect width="3" height="1" y="0.5" fill="#ffc400" />
    </svg>
  );
}

function FlagGB() {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" className={flagClass} aria-label="English">
      <clipPath id="flag-gb-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      {/* Contracambio: limita las diagonales rojas a cuadrantes alternos. */}
      <clipPath id="flag-gb-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath="url(#flag-gb-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-gb-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

// `dev: true` → página oculta: visible solo en localhost (import.meta.env.DEV) o
// para un usuario administrador logueado (user.isAdmin, vía ADMIN_EMAILS en
// Cloudflare). En el build público se filtra y queda oculta, sin tocar nada.
type NavItem = { to: string; label: string; end?: boolean; beta?: boolean; dev?: boolean };
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Equipo', end: true },
  { to: '/speed', label: 'Speed Tier' },
  { to: '/builds', label: 'Builds Meta' },
  { to: '/dex', label: 'Pokédex' },
  { to: '/coverage', label: 'Cobertura' },
  { to: '/damage', label: 'Calculadora' },
  { to: '/optimizer', label: 'Optimizador', beta: true },
  { to: '/analysis', label: 'Análisis' },
  { to: '/replays', label: 'Repeticiones', beta: true },
  { to: '/tournament', label: 'Equipos de torneo', dev: true },
];

const visibleNavItems = (isAdmin: boolean) => NAV_ITEMS.filter((i) => !i.dev || canSeeDevPages(isAdmin));

// Enlaces de navegación, reutilizados en la barra de escritorio y en el menú móvil.
function NavLinks({ t, onNavigate }: { t: (s: string) => string; onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <>
      {visibleNavItems(!!user?.isAdmin).map(({ to, label, end, beta }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `nav-link w-full justify-start inline-flex items-center gap-1.5 whitespace-nowrap ${isActive ? 'nav-link-active' : ''}`
          }
        >
          {t(label)}
          {beta && (
            <span className="text-[9px] font-bold uppercase leading-none px-1 py-0.5 rounded bg-[#4b2a47] text-poke-pink border border-poke-pink/40">
              beta
            </span>
          )}
        </NavLink>
      ))}
    </>
  );
}

// Contenido del menú lateral: marca arriba, navegación, y abajo la cuenta.
function SidebarContent({ t, onNavigate }: { t: (s: string) => string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-4 py-4 border-b border-poke-accent/40 hover:bg-poke-accent/20 transition-colors">
        <Logo className="w-8 h-8 shrink-0" />
        <span className="text-sm font-bold text-white leading-tight">
          Pokémon Champions<br /><span className="text-poke-pink">Team Lab</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
        <NavLinks t={t} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-poke-accent/40 p-3">
        <AccountMenu />
      </div>
    </div>
  );
}

export function Layout() {
  const { teams, activeTeamId, setActiveTeamId, createTeam, deleteTeam, renameTeam } = useTeam();
  const { t, lang, toggle } = useLang();
  const activeTeam = teams.find((t) => t.id === activeTeamId);
  // Actualiza title/description/canonical/OG según la ruta y el idioma.
  useRouteSeo();

  // Diálogo activo y valor del input.
  const [dialog, setDialog] = useState<null | 'create' | 'rename' | 'delete'>(null);
  const [nameInput, setNameInput] = useState('');
  // Menú de navegación colapsable en móvil.
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  const openCreate = () => { setNameInput(`Equipo ${teams.length + 1}`); setDialog('create'); };
  const openRename = () => { if (activeTeam) { setNameInput(activeTeam.name); setDialog('rename'); } };
  const closeDialog = () => setDialog(null);

  const confirmDialog = () => {
    if (dialog === 'create') { const n = nameInput.trim(); if (n) createTeam(n); }
    else if (dialog === 'rename') { const n = nameInput.trim(); if (n && activeTeam) renameTeam(activeTeam.id, n); }
    else if (dialog === 'delete') { if (activeTeamId) deleteTeam(activeTeamId); }
    closeDialog();
  };

  return (
    <div className="min-h-screen flex">
      {/* Menú lateral (escritorio) */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-poke-panel border-r border-poke-accent/50 sticky top-0 h-screen">
        <SidebarContent t={t} />
      </aside>

      {/* Drawer lateral (pantallas pequeñas) */}
      {navOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 h-full w-64 bg-poke-panel border-r border-poke-accent/50 lg:hidden">
            <SidebarContent t={t} onNavigate={() => setNavOpen(false)} />
          </aside>
        </>
      )}

      {/* Columna principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-poke-panel/95 backdrop-blur border-b border-poke-accent/50">
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            {/* Móvil: hamburguesa + marca compacta */}
            <button
              type="button"
              aria-label={t('Menú')}
              onClick={() => setNavOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-poke-accent text-gray-200 hover:bg-poke-accent/40 transition-colors active:scale-95"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <Link to="/" className="lg:hidden flex items-center gap-2">
              <Logo className="w-7 h-7" />
              <span className="font-bold text-white">Champions <span className="text-poke-pink">Lab</span></span>
            </Link>

            {/* Controles de equipo */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm text-gray-400">{t('Equipo activo:')}</label>
              <Dropdown
                className="w-auto min-w-[180px]"
                value={activeTeamId ?? ''}
                options={teams.map((t) => t.id)}
                onChange={(id) => setActiveTeamId(id)}
                render={(id) => teams.find((t) => t.id === id)?.name ?? id}
              />
              <button type="button" className="btn-secondary text-sm py-1 border border-transparent active:scale-95" onClick={openCreate}>
                {t('+ Nuevo')}
              </button>
              <button type="button" className="btn-secondary text-sm py-1 border border-transparent active:scale-95" onClick={openRename}>
                {t('Renombrar')}
              </button>
              {teams.length > 1 && (
                <button type="button" className="px-3 py-2 rounded-lg border border-red-700/50 text-red-400 text-sm hover:bg-red-900/30 transition-colors active:scale-95" onClick={() => setDialog('delete')}>
                  {t('Eliminar')}
                </button>
              )}
            </div>

            {/* Idioma, a la derecha de la barra superior */}
            <button
              type="button"
              onClick={toggle}
              title={lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              className="ml-auto px-3 py-2 rounded-lg text-sm font-medium border border-poke-accent text-gray-200 hover:bg-poke-accent/40 hover:border-poke-pink/60 transition-all duration-150 active:scale-95 inline-flex items-center gap-2"
            >
              {lang === 'es' ? <FlagES /> : <FlagGB />}
              {lang.toUpperCase()}
            </button>
          </div>
        </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <Logo className="w-10 h-10 animate-bounce" />
            </div>
          }
        >
          <div key={location.pathname}>
            <Outlet />
          </div>
        </Suspense>
      </main>

      <footer className="mt-auto border-t border-poke-accent/30 bg-poke-panel/40">
        <div className="max-w-7xl mx-auto px-4 py-6 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="flex items-start gap-3">
            <Logo className="w-8 h-8 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">
                Pokémon Champions <span className="text-poke-pink">Team Lab</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                {t('Constructor y análisis de equipos para VGC Champions (Reg M-B, dobles).')}
              </p>
            </div>
          </div>
          <div className="text-xs sm:text-right">
            <span className="text-gray-500 uppercase tracking-wide text-[10px]">{t('Datos y código')}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 sm:justify-end">
              {[
                { href: 'https://pokeapi.co', label: 'PokéAPI' },
                { href: 'https://pokemonshowdown.com', label: 'Pokémon Showdown' },
                { href: 'https://www.smogon.com/stats/', label: 'Smogon Stats' },
                { href: 'https://github.com/Aliex-01/Pokemon-Champions-Team-Lab', label: 'GitHub' },
              ].map(({ href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-poke-pink transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-poke-accent/20 px-4 py-3 text-center text-[11px] text-gray-500">
          {t('Proyecto fan sin ánimo de lucro. Pokémon © Nintendo · Game Freak · The Pokémon Company.')}
        </div>
      </footer>
      </div>

      {/* Crear / Renombrar equipo */}
      <Modal open={dialog === 'create' || dialog === 'rename'} onClose={closeDialog} title={dialog === 'rename' ? t('Renombrar equipo') : t('Nuevo equipo')}>
        <form onSubmit={(e) => { e.preventDefault(); confirmDialog(); }}>
          <label className="block text-sm text-gray-400 mb-1">{t('Nombre del equipo')}</label>
          <input
            autoFocus
            className="input-field mb-4"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder={t('Mi equipo')}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm border border-transparent" onClick={closeDialog}>{t('Cancelar')}</button>
            <button type="submit" className="btn-primary text-sm" disabled={!nameInput.trim()}>
              {dialog === 'rename' ? t('Guardar') : t('Crear')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Eliminar equipo */}
      <Modal open={dialog === 'delete'} onClose={closeDialog} title={t('Eliminar equipo')}>
        <p className="text-sm text-gray-300 mb-4">
          {t('¿Seguro que quieres eliminar')} <span className="font-semibold text-white">{activeTeam?.name}</span>{t('? Esta acción no se puede deshacer.')}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm border border-transparent" onClick={closeDialog}>{t('Cancelar')}</button>
          <button type="button" className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors" onClick={confirmDialog}>
            {t('Eliminar')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
