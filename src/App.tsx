import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { TeamProvider } from './store/teamStore';
import { Layout } from './components/Layout';
import { TeamBuilder } from './views/TeamBuilder';
import { SpeedTierView } from './views/SpeedTier';
import { BuildsView } from './views/BuildsView';
import { CoverageView } from './views/CoverageView';
import { DamageCalcView } from './views/DamageCalcView';
import { TeamAnalysisView } from './views/TeamAnalysisView';
import { Logo } from './components/Logo';
import { LanguageProvider, useLang } from './lib/i18n';
import { loadChampionsData } from './lib/championsData';
import type { ChampionsData } from './types/pokemon';

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
      </Route>
    </Routes>
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-poke-dark">
        <div className="text-center">
          <Logo className="w-14 h-14 mx-auto mb-4 animate-bounce" />
          <p className="text-gray-400">{t('Cargando datos de Champions...')}</p>
        </div>
      </div>
    );
  }

  return (
    <TeamProvider>
      <BrowserRouter>
        <AppRoutes data={data} />
      </BrowserRouter>
    </TeamProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
