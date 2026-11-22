// Utilidades compartidas para las Pages Functions de auth/equipos.
// (Carpeta con guion bajo: Cloudflare no la trata como ruta.)

// Admin = correo presente en la variable de entorno ADMIN_EMAILS (separada por
// comas). Se define en el panel de Cloudflare Pages, no en el repo.
export function isAdminEmail(env, email) {
  const list = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

const enc = new TextEncoder();
const SESSION_DAYS = 365;
const PBKDF2_ITERS = 100_000;

// ── base64 / base64url ──
function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function b64url(bytes) {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Hash de contraseña: PBKDF2-SHA256 con salt + "pepper" (SESSION_SECRET) ──
async function derive(password, pepper, salt, iters) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password + pepper), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
export async function hashPassword(password, pepper) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, pepper, salt, PBKDF2_ITERS);
  return { hash, salt: b64(salt), iters: PBKDF2_ITERS };
}
export async function verifyPassword(password, pepper, saltB64, iters, hashB64) {
  const hash = await derive(password, pepper, unb64(saltB64), iters);
  return timingSafeEqual(hash, hashB64);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const uuid = () => crypto.randomUUID();
const randToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

// ── Respuestas JSON ──
export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

// ── Cookies ──
const COOKIE = 'session';
export const sessionCookie = (token) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
function getCookie(request, name) {
  const h = request.headers.get('Cookie') ?? '';
  const m = h.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1] : null;
}

// ── Sesiones (tabla `sessions`) ──
export async function createSession(env, userId) {
  const token = randToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, userId, now, now + SESSION_DAYS * 86400000).run();
  return token;
}
export async function getUser(env, request) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT s.expires_at AS exp, u.id AS id, u.email AS email, u.username AS username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
  ).bind(token).first();
  if (!row) return null;
  if (row.exp < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, username: row.username, isAdmin: isAdminEmail(env, row.email) };
}
export async function deleteSession(env, request) {
  const token = getCookie(request, COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// ── Rate limiting de login (tabla `login_attempts`) ──
const RATE_MAX = 8;
const RATE_WINDOW = 15 * 60 * 1000;
export async function rateOk(env, key) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM login_attempts WHERE key = ?')
    .bind(key).first();
  if (!row || row.reset_at < Date.now()) return true;
  return row.count < RATE_MAX;
}
export async function rateFail(env, key) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT reset_at FROM login_attempts WHERE key = ?')
    .bind(key).first();
  if (!row || row.reset_at < now) {
    await env.DB.prepare(
      'INSERT INTO login_attempts (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = ?',
    ).bind(key, now + RATE_WINDOW, now + RATE_WINDOW).run();
  } else {
    await env.DB.prepare('UPDATE login_attempts SET count = count + 1 WHERE key = ?').bind(key).run();
  }
}
export async function rateClear(env, key) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}

export function normEmail(v) {
  return String(v ?? '').trim().toLowerCase();
}
export const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;

export function normUsername(v) {
  return String(v ?? '').trim();
}
// 3-20 caracteres: letras, números, guion y guion bajo.
export const validUsername = (u) => /^[a-zA-Z0-9_-]{3,20}$/.test(u);
