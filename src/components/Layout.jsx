import { useState, useRef, useLayoutEffect, Suspense } from 'react';
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

function NavIcon({ name }) {
  const cls = 'w-4 h-4 shrink-0 opacity-80';
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round', className: cls, 'aria-hidden': true };
  switch (name) {
    case 'team':
      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'speed':
      return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'builds':
      return <svg {...props}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 12 12 17 22 12" /><polyline points="2 17 12 22 22 17" /></svg>;
    case 'dex':
      return <svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case 'coverage':
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case 'damage':
      return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="10" y2="11" /><line x1="14" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="10" y2="15" /><line x1="14" y1="15" x2="16" y2="15" /><line x1="8" y1="19" x2="16" y2="19" /></svg>;
    case 'optimizer':
      return <svg {...props}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>;
    case 'analysis':
      return <svg {...props}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
    case 'replays':
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>;
    case 'tournament':
      return <svg {...props}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>;
    default:
      return null;
  }
}

const NAV_ITEMS = [
  { to: '/', label: 'Equipo', icon: 'team', end: true },
  { to: '/speed', label: 'Speed Tier', icon: 'speed' },
  { to: '/builds', label: 'Builds Meta', icon: 'builds' },
  { to: '/dex', label: 'Pokédex', icon: 'dex' },
  { to: '/coverage', label: 'Cobertura', icon: 'coverage' },
  { to: '/damage', label: 'Calculadora', icon: 'damage' },
  { to: '/optimizer', label: 'Optimizador', icon: 'optimizer' },
  { to: '/analysis', label: 'Análisis', icon: 'analysis' },
  { to: '/replays', label: 'Repeticiones', icon: 'replays' },
  { to: '/tournament', label: 'Equipos de torneo', icon: 'tournament' },
];

const visibleNavItems = (isAdmin) => NAV_ITEMS.filter((i) => !i.dev || canSeeDevPages(isAdmin));

// Enlaces de navegación, reutilizados en la barra de escritorio y en el menú móvil.
function NavLinks({ t, onNavigate }) {
  const { user } = useAuth();
  const location = useLocation();
  const ref = useRef(null);
  // Indicador deslizante: se mide sobre el enlace activo y se anima a su posición.
  const [ind, setInd] = useState({ top: 0, height: 0, show: false });

  useLayoutEffect(() => {
    const c = ref.current;
    const el = c?.querySelector('[aria-current="page"]');
    if (c && el) setInd({ top: el.offsetTop, height: el.offsetHeight, show: true });
    else setInd((s) => ({ ...s, show: false }));
  }, [location.pathname, user?.isAdmin]);

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span
        aria-hidden
        className={`absolute left-0 right-0 z-0 rounded-lg bg-poke-pink/20 border border-poke-pink/30 transition-all duration-300 ease-out ${ind.show ? 'opacity-100' : 'opacity-0'}`}
        style={{ top: ind.top, height: ind.height }}
      />
      {visibleNavItems(!!user?.isAdmin).map(({ to, label, icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `nav-link relative z-10 w-full justify-start inline-flex items-center gap-2.5 whitespace-nowrap ${isActive ? 'nav-link-active' : ''}`
          }
        >
          <NavIcon name={icon} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </div>
  );
}

// Contenido del menú lateral: marca arriba, navegación, y abajo la cuenta.
function SidebarContent({ t, onNavigate }) {
  return (
    <div className="flex flex-col h-full">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-4 h-16 border-b border-poke-accent/40 hover:bg-poke-accent/20 transition-colors">
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

const PRESET_TEAM_TAGS = ['Rain', 'Sun', 'Trick Room', 'Tailwind', 'Balance', 'Torneo', 'Pruebas'];

export function Layout() {
  const { teams, activeTeamId, setActiveTeamId, createTeam, deleteTeam, renameTeam, setTeamTags, duplicateTeam } = useTeam();
  const { t, lang, toggle } = useLang();
  const activeTeam = teams.find((t) => t.id === activeTeamId);
  // Actualiza title/description/canonical/OG según la ruta y el idioma.
  useRouteSeo();

  // Diálogo activo y valor del input.
  const [dialog, setDialog] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  // Menú de navegación colapsable en móvil.
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Todas las etiquetas usadas actualmente en los equipos guardados.
  const allUsedTags = [...new Set(teams.flatMap((tm) => tm.tags ?? []))].sort();
  const effectiveTagFilter = tagFilter && allUsedTags.includes(tagFilter) ? tagFilter : '';
  const visibleTeams = effectiveTagFilter
    ? teams.filter((tm) => (tm.tags ?? []).includes(effectiveTagFilter))
    : teams;

  const openCreate = () => { setNameInput(`Equipo ${teams.length + 1}`); setDialog('create'); };
  const openRename = () => { if (activeTeam) { setNameInput(activeTeam.name); setDialog('rename'); } };
  const openTags = () => { if (activeTeam) { setTagInput(''); setDialog('tags'); } };
  const closeDialog = () => setDialog(null);

  const toggleTeamTag = (tag) => {
    if (!activeTeam) return;
    const cur = activeTeam.tags ?? [];
    const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
    setTeamTags(activeTeam.id, next);
  };

  const addCustomTag = () => {
    const clean = tagInput.trim();
    if (!clean || !activeTeam) return;
    const cur = activeTeam.tags ?? [];
    if (!cur.includes(clean)) setTeamTags(activeTeam.id, [...cur, clean]);
    setTagInput('');
  };

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
        <header className="sticky top-0 z-40 bg-poke-panel/95 backdrop-blur">
          <div className="px-4 py-3 lg:py-0 min-h-16 lg:h-16 flex items-center gap-3 flex-wrap border-b border-poke-accent/50">
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
                options={visibleTeams.map((tm) => tm.id)}
                onChange={(id) => setActiveTeamId(id)}
                render={(id) => teams.find((tm) => tm.id === id)?.name ?? id}
              />
              {allUsedTags.length > 0 && (
                <Dropdown
                  className="w-auto min-w-[125px]"
                  value={effectiveTagFilter}
                  options={['', ...allUsedTags]}
                  placeholder={t('Todas')}
                  onChange={(tg) => {
                    setTagFilter(tg);
                    if (tg) {
                      const match = teams.find((tm) => (tm.tags ?? []).includes(tg));
                      if (match && !(activeTeam?.tags ?? []).includes(tg)) setActiveTeamId(match.id);
                    }
                  }}
                  render={(tg) => (tg ? `#${tg}` : t('Todas'))}
                />
              )}
              <button type="button" className="btn-secondary text-sm py-1 border border-transparent active:scale-95" onClick={openCreate}>
                {t('+ Nuevo')}
              </button>
              <button type="button" className="btn-secondary text-sm py-1 border border-transparent active:scale-95" onClick={openRename}>
                {t('Renombrar')}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm py-1 border border-transparent active:scale-95"
                onClick={() => { if (activeTeamId) duplicateTeam(activeTeamId); }}
              >
                {t('Duplicar')}
              </button>
              <button
                type="button"
                className={`btn-secondary text-sm py-1 border active:scale-95 ${
                  (activeTeam?.tags?.length ?? 0) > 0
                    ? 'border-poke-pink/50 text-poke-pink'
                    : 'border-transparent'
                }`}
                onClick={openTags}
              >
                {t('Etiquetas')}
                {(activeTeam?.tags?.length ?? 0) > 0 ? ` (${activeTeam.tags.length})` : ''}
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
          <div key={location.pathname} className="route-enter">
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
                {t('Constructor y análisis de equipos para VGC Champions.')}
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
                { href: 'https://github.com/pkmn', label: '@pkmn' },
                { href: 'https://pokepast.es', label: 'Poképaste' },
                { href: 'https://twitter.com/VGCPastes', label: 'VGCPastes' },
                { href: 'https://www.championslab.xyz', label: 'ChampionsLab' },
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

      {/* Etiquetas del equipo */}
      <Modal open={dialog === 'tags'} onClose={closeDialog} title={`${t('Etiquetas')} — ${activeTeam?.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-gray-400 uppercase mb-2">{t('Etiquetas rápidas')}</div>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...PRESET_TEAM_TAGS, ...(activeTeam?.tags ?? [])])].map((tg) => {
                const active = (activeTeam?.tags ?? []).includes(tg);
                return (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => toggleTeamTag(tg)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      active
                        ? 'bg-poke-pink/20 border-poke-pink text-poke-pink font-medium'
                        : 'bg-poke-dark/60 border-poke-accent text-gray-300 hover:border-poke-pink/50'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}{tg}
                  </button>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); addCustomTag(); }}
            className="flex gap-2"
          >
            <input
              className="input-field flex-1 text-sm"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={t('Añadir etiqueta personalizada…')}
              maxLength={24}
            />
            <button type="submit" className="btn-primary text-sm" disabled={!tagInput.trim()}>
              {t('Añadir')}
            </button>
          </form>

          <div className="flex justify-end">
            <button type="button" className="btn-secondary text-sm border border-transparent" onClick={closeDialog}>
              {t('Cerrar')}
            </button>
          </div>
        </div>
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
