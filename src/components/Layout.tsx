import { useState, Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { useTeam } from '../store/teamStore';
import { useLang } from '../lib/i18n';
import { Dropdown } from './Dropdown';
import { Modal } from './Modal';

const NAV_ITEMS = [
  { to: '/', label: 'Equipo', end: true },
  { to: '/speed', label: 'Speed Tier' },
  { to: '/builds', label: 'Builds Meta' },
  { to: '/coverage', label: 'Cobertura' },
  { to: '/damage', label: 'Calculadora' },
  { to: '/analysis', label: 'Análisis', beta: true },
];

export function Layout() {
  const { teams, activeTeamId, setActiveTeamId, createTeam, deleteTeam, renameTeam } = useTeam();
  const { t, lang, toggle } = useLang();
  const activeTeam = teams.find((t) => t.id === activeTeamId);

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
    <div className="min-h-screen flex flex-col">
      <header className="bg-poke-panel border-b border-poke-accent/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8 shrink-0" />
            <h1 className="text-xl font-bold text-white">
              Pokémon Champions <span className="text-poke-pink">Team Lab</span>
            </h1>
          </div>

          {/* Botón hamburguesa: solo en móvil */}
          <button
            type="button"
            aria-label={t('Menú')}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
            className="md:hidden ml-auto p-2 rounded-lg border border-poke-accent text-gray-200 hover:bg-poke-accent/40 transition-colors active:scale-95"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {navOpen ? (
                <><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>

          <nav
            className={`${navOpen ? 'flex' : 'hidden'} md:flex w-full md:w-auto md:ml-auto order-last md:order-none flex-col md:flex-row flex-wrap gap-1`}
          >
            {NAV_ITEMS.map(({ to, label, end, beta }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={beta ? 'Beta' : undefined}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link-active' : ''} ${beta ? 'relative' : ''}`
                }
              >
                {t(label)}
                {beta && (
                  <span className="absolute -bottom-1.5 -right-1 text-[10px] font-bold uppercase leading-none px-1 py-0.5 rounded bg-[#4b2a47] text-poke-pink border border-poke-pink/40 pointer-events-none">
                    beta
                  </span>
                )}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={toggle}
              title={lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              className="md:ml-1 px-3 py-2 rounded-lg text-sm font-medium border border-poke-accent text-gray-200 hover:bg-poke-accent/40 hover:border-poke-pink/60 transition-all duration-150 active:scale-95 min-w-[68px] text-center"
            >
              🌐 {lang.toUpperCase()}
            </button>
          </nav>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap items-center gap-2">
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

      <footer className="text-center text-xs text-gray-500 py-4 border-t border-poke-accent/30">
        {t('Datos: PokéAPI · Pokémon Showdown · Smogon Stats · Solo Pokémon legal en Champions Reg M-B')}
      </footer>

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
