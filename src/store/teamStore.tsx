import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { SavedTeam, TeamPokemon } from '../types/pokemon';
import { createEmptyTeam, createEmptyPokemon } from '../types/pokemon';

const STORAGE_KEY = 'champions-teams';

interface TeamContextValue {
  teams: SavedTeam[];
  activeTeamId: string | null;
  activeTeam: SavedTeam | null;
  setActiveTeamId: (id: string) => void;
  createTeam: (name: string) => SavedTeam;
  deleteTeam: (id: string) => void;
  renameTeam: (id: string, name: string) => void;
  updatePokemon: (slotIndex: number, updates: Partial<TeamPokemon>) => void;
  setActiveTeamPokemon: (pokemon: TeamPokemon[]) => void;
  importTeam: (team: SavedTeam) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

function loadTeams(): SavedTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const teams = JSON.parse(raw) as SavedTeam[];
      return teams.map((team) => ({
        ...team,
        pokemon: team.pokemon.map((p) => ({
          ...p,
          level: 50,
          evMode: p.evMode ?? 'champions',
          nature: p.nature === 'Serious' || p.nature === 'Hardy' ? 'Docile' : (p.nature ?? 'Docile'),
        })),
      }));
    }
  } catch { /* ignore */ }
  return [createEmptyTeam('Equipo 1')];
}

function saveTeams(teams: SavedTeam[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<SavedTeam[]>(loadTeams);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(
    () => loadTeams()[0]?.id ?? null
  );

  useEffect(() => {
    saveTeams(teams);
  }, [teams]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;

  const createTeam = useCallback((name: string) => {
    const team = createEmptyTeam(name);
    setTeams((prev) => [...prev, team]);
    setActiveTeamId(team.id);
    return team;
  }, []);

  const deleteTeam = useCallback((id: string) => {
    setTeams((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) filtered.push(createEmptyTeam('Equipo 1'));
      if (activeTeamId === id) setActiveTeamId(filtered[0].id);
      return filtered;
    });
  }, [activeTeamId]);

  const renameTeam = useCallback((id: string, name: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t))
    );
  }, []);

  const updatePokemon = useCallback((slotIndex: number, updates: Partial<TeamPokemon>) => {
    if (!activeTeamId) return;
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== activeTeamId) return t;
        const pokemon = [...t.pokemon];
        pokemon[slotIndex] = { ...pokemon[slotIndex], ...updates };
        return { ...t, pokemon, updatedAt: new Date().toISOString() };
      })
    );
  }, [activeTeamId]);

  const setActiveTeamPokemon = useCallback((pokemon: TeamPokemon[]) => {
    if (!activeTeamId) return;
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== activeTeamId) return t;
        const filled = pokemon.slice(0, 6).map((p, i) => ({
          ...p,
          slotId: t.pokemon[i]?.slotId ?? `slot-${i}`,
        }));
        while (filled.length < 6) {
          const i = filled.length;
          filled.push(createEmptyPokemon(t.pokemon[i]?.slotId ?? `slot-${i}`));
        }
        return { ...t, pokemon: filled, updatedAt: new Date().toISOString() };
      })
    );
  }, [activeTeamId]);

  const importTeam = useCallback((team: SavedTeam) => {
    setTeams((prev) => {
      const existing = prev.findIndex((t) => t.id === team.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = team;
        return updated;
      }
      return [...prev, team];
    });
    setActiveTeamId(team.id);
  }, []);

  return (
    <TeamContext.Provider
      value={{
        teams,
        activeTeamId,
        activeTeam,
        setActiveTeamId,
        createTeam,
        deleteTeam,
        renameTeam,
        updatePokemon,
        setActiveTeamPokemon,
        importTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used within TeamProvider');
  return ctx;
}

export function setPokemonAtSlot(team: SavedTeam, slotIndex: number, speciesId: string, speciesName: string): SavedTeam {
  const pokemon = [...team.pokemon];
  pokemon[slotIndex] = {
    ...createEmptyPokemon(pokemon[slotIndex].slotId),
    speciesId,
    speciesName,
  };
  return { ...team, pokemon, updatedAt: new Date().toISOString() };
}
