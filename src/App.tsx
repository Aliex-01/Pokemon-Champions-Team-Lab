import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState, lazy } from 'react';
import { TeamProvider } from './store/teamStore';
import { Layout } from './components/Layout';
import { Logo } from './components/Logo';
import { LanguageProvider, useLang } from './lib/i18n';
import { loadChampionsData } from './lib/championsData';
import type { ChampionsData } from './types/pokemon';

// Carga diferida por ruta: cada vista (y sus dependencias pesadas, como
// @smogon/calc en la Calculadora) se descarga solo cuando se visita.
const TeamBuilder = lazy(() => import('./views/TeamBuilder').then((m) => ({ default: m.TeamBuilder })));
const SpeedTierView = lazy(() => import('./views/SpeedTier').then((m) => ({ default: m.SpeedTierView })));
const BuildsView = lazy(() => import('./views/BuildsView').then((m) => ({ default: m.BuildsView })));
const CoverageView = lazy(() => import('./views/CoverageView').then((m) => ({ default: m.CoverageView })));
const DamageCalcView = lazy(() => import('./views/DamageCalcView').then((m) => ({ default: m.DamageCalcView })));
const TeamAnalysisView = lazy(() => import('./views/TeamAnalysisView').then((m) => ({ default: m.TeamAnalysisView })));
const ReplaysView = lazy(() => import('./views/ReplaysView').then((m) => ({ default: m.ReplaysView })));

function AppRoutes({ data }: { data: ChampionsData }) {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TeamBuilder data={data} />} />
        <Route path="speed" element={<SpeedTierView data={data} />} />
        <Route path="builds" element={<BuildsView data={data} />} />
        <Route path="coverage" element={<CoverageView data={data} />} />
        <Route path="damage" element={<DamageCalcView data={data} />} />
        <Route path="analysis" element={<TeamAnalysisView data={data} />} />
        <Route path="replays" element={<ReplaysView data={data} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  const { t } = useLang();
  return (
    <div className="page-enter flex flex-col items-center justify-center text-center py-20">
      <Logo className="w-16 h-16 mb-6 opacity-60" />
      <p className="text-5xl font-bold text-poke-pink mb-2">404</p>
      <h2 className="text-xl font-semibold mb-2">{t('Página no encontrada')}</h2>
      <p className="text-gray-400 mb-6 max-w-sm">
        {t('La página que buscas no existe o se ha movido.')}
      </p>
      <Link to="/" className="btn-primary">{t('Volver al Constructor')}</Link>
    </div>
  );
}

function AppInner() {
  const { t } = useLang();
  const [data, setData] = useState<ChampionsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChampionsData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-poke-dark">
        <div className="panel p-8 text-center max-w-md">
          <p className="text-red-400 mb-4">{error}</p>
          <p className="text-sm text-gray-400">{t('Ejecuta: npm run generate-data')}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoadingSkeleton message={t('Cargando datos de Champions...')} />;
  }

  return (
    <TeamProvider>
      <BrowserRouter>
        <AppRoutes data={data} />
      </BrowserRouter>
    </TeamProvider>
  );
}

/**
 * Pantalla de carga con skeleton: dibuja la silueta de la cabecera y de la
 * rejilla de 6 Pokémon para que la app se perciba más rápida al arrancar.
 */
function LoadingSkeleton({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-poke-dark" aria-busy="true" aria-label={message}>
      {/* Cabecera simulada */}
      <header className="bg-poke-panel border-b border-poke-accent/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo className="w-8 h-8 shrink-0 animate-pulse" />
          <div className="skeleton h-6 w-56" />
          <div className="ml-auto hidden md:flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-9 w-20" />
            ))}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-3 flex items-center gap-2">
          <div className="skeleton h-8 w-44" />
          <div className="skeleton h-8 w-24" />
          <div className="skeleton h-8 w-24" />
        </div>
      </header>

      {/* Rejilla de 6 tarjetas simuladas */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="skeleton h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel p-3 flex flex-col items-center gap-2">
              <div className="skeleton w-16 h-16 rounded-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
        <p className="text-center text-gray-500 text-sm mt-8">{message}</p>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
