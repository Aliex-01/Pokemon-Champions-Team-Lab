import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);
const TEAMS_KEY = 'champions-teams';
const REPLAYS_KEY = 'champions-replays';
const SDUSER_KEY = 'champions-sd-username';

function safeParse(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data).error || 'error');
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
    setUser(d.user);
  };
  const register = async (email, username, password) => {
    const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) });
    setUser(d.user);
  };
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };
  const pushTeams = async () => {
    // Equipos.
    const teams = safeParse(localStorage.getItem(TEAMS_KEY), []);
    const d = await api('/api/teams', { method: 'PUT', body: JSON.stringify({ teams }) });
    // Repeticiones + usuario de Showdown.
    const replays = safeParse(localStorage.getItem(REPLAYS_KEY), []);
    const sdUsername = safeParse(localStorage.getItem(SDUSER_KEY), '');
    await api('/api/replays', { method: 'PUT', body: JSON.stringify({ data: { replays, sdUsername } }) });
    return d.count;
  };
  const pullTeams = async () => {
    const dt = await api('/api/teams');
    localStorage.setItem(TEAMS_KEY, JSON.stringify(dt.teams));
    const dr = await api('/api/replays');
    if (dr.data) {
      if (Array.isArray(dr.data.replays)) localStorage.setItem(REPLAYS_KEY, JSON.stringify(dr.data.replays));
      if (typeof dr.data.sdUsername === 'string') localStorage.setItem(SDUSER_KEY, JSON.stringify(dr.data.sdUsername));
    }
    location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, pushTeams, pullTeams }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

// Traduce los códigos de error del backend a mensajes (claves de i18n en español).
export function authErrorMessage(code) {
  switch (code) {
    case 'invalid_email': return 'Correo no válido.';
    case 'invalid_username': return 'El usuario debe tener 3-20 caracteres (letras, números, - o _).';
    case 'weak_password': return 'La contraseña debe tener al menos 8 caracteres.';
    case 'email_taken': return 'Ese correo ya está registrado.';
    case 'username_taken': return 'Ese nombre de usuario ya está cogido.';
    case 'invalid_credentials': return 'Correo o contraseña incorrectos.';
    case 'rate_limited': return 'Demasiados intentos. Espera unos minutos.';
    default: return 'Algo ha ido mal. Inténtalo de nuevo.';
  }
}
