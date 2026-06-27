import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser { id: string; email: string; username: string | null; }

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Sube los equipos locales (localStorage) a la nube. */
  pushTeams: () => Promise<number>;
  /** Descarga los equipos de la nube y recarga la app. */
  pullTeams: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TEAMS_KEY = 'champions-teams';

async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'error');
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: AuthUser | null }>('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier: string, password: string) => {
    const d = await api<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
    setUser(d.user);
  };
  const register = async (email: string, username: string, password: string) => {
    const d = await api<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) });
    setUser(d.user);
  };
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };
  const pushTeams = async () => {
    const raw = localStorage.getItem(TEAMS_KEY);
    const teams = raw ? JSON.parse(raw) : [];
    const d = await api<{ count: number }>('/api/teams', { method: 'PUT', body: JSON.stringify({ teams }) });
    return d.count;
  };
  const pullTeams = async () => {
    const d = await api<{ teams: unknown[] }>('/api/teams');
    localStorage.setItem(TEAMS_KEY, JSON.stringify(d.teams));
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
export function authErrorMessage(code: string): string {
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
