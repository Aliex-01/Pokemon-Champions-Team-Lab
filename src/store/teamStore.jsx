import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { createEmptyTeam, createEmptyPokemon } from '../types/pokemon';

const STORAGE_KEY = 'champions-teams';

const TeamContext = createContext(null);

function loadTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const teams = JSON.parse(raw);
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

function saveTeams(teams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function TeamProvider({ children }) {
  const [teams, setTeams] = useState(loadTeams);
  const [activeTeamId, setActiveTeamId] = useState(
    () => loadTeams()[0]?.id ?? null
  );

  useEffect(() => {
    saveTeams(teams);
  }, [teams]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;

  const createTeam = useCallback((name) => {
    const team = createEmptyTeam(name);
    setTeams((prev) => [...prev, team]);
    setActiveTeamId(team.id);
    return team;
  }, []);

  const deleteTeam = useCallback((id) => {
    setTeams((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) filtered.push(createEmptyTeam('Equipo 1'));
      if (activeTeamId === id) setActiveTeamId(filtered[0].id);
      return filtered;
    });
  }, [activeTeamId]);

  const renameTeam = useCallback((id, name) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t))
    );
  }, []);

  const updatePokemon = useCallback((slotIndex, updates) => {
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

  const setActiveTeamPokemon = useCallback((pokemon) => {
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

  const importTeam = useCallback((team) => {
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

export function setPokemonAtSlot(team, slotIndex, speciesId, speciesName) {
  const pokemon = [...team.pokemon];
  pokemon[slotIndex] = {
    ...createEmptyPokemon(pokemon[slotIndex].slotId),
    speciesId,
    speciesName,
  };
  return { ...team, pokemon, updatedAt: new Date().toISOString() };
}
