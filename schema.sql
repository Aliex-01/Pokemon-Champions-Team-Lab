-- Esquema de la base de datos D1 (Cloudflare) para cuentas y equipos en la nube.
-- Ejecutar con:  npx wrangler d1 execute champions-db --remote --file=schema.sql

-- Usuarios. La contraseña se guarda como hash PBKDF2 (Web Crypto), nunca en claro.
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- uuid
  email        TEXT NOT NULL UNIQUE,        -- en minúsculas
  username     TEXT UNIQUE,                 -- nombre de usuario (3-20, único)
  pw_hash      TEXT NOT NULL,               -- hash PBKDF2 en base64
  pw_salt      TEXT NOT NULL,               -- salt aleatorio en base64
  pw_iters     INTEGER NOT NULL,            -- nº de iteraciones PBKDF2
  created_at   INTEGER NOT NULL             -- epoch ms
);

-- Sesiones (token de servidor; permite revocar y caducar). Cookie HttpOnly.
CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,            -- aleatorio, 256 bits
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Equipos en la nube, ligados al usuario. `data` es el JSON del equipo.
CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,            -- uuid (coincide con el id local)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  data         TEXT NOT NULL,               -- JSON.stringify(SavedTeam)
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);

-- Control de intentos de login (rate limiting anti fuerza bruta).
CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,            -- email|ip
  count        INTEGER NOT NULL,
  reset_at     INTEGER NOT NULL
);
