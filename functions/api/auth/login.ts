import { type Ctx, verifyPassword, createSession, sessionCookie, json, rateOk, rateFail, rateClear, isAdminEmail } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let body: { identifier?: string; email?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }

  // El identificador puede ser el correo o el nombre de usuario.
  const id = String(body.identifier ?? body.email ?? '').trim();
  const password = String(body.password ?? '');
  if (!id || !password) return json({ error: 'invalid_credentials' }, { status: 401 });

  const rateKey = id.toLowerCase();
  if (!(await rateOk(env, rateKey))) return json({ error: 'rate_limited' }, { status: 429 });

  const u = await env.DB.prepare(
    'SELECT id, email, username, pw_hash, pw_salt, pw_iters FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)',
  ).bind(id, id).first<{ id: string; email: string; username: string | null; pw_hash: string; pw_salt: string; pw_iters: number }>();

  if (!u || !(await verifyPassword(password, env.SESSION_SECRET, u.pw_salt, u.pw_iters, u.pw_hash))) {
    await rateFail(env, rateKey);
    return json({ error: 'invalid_credentials' }, { status: 401 });
  }

  await rateClear(env, rateKey);
  const token = await createSession(env, u.id);
  return json({ user: { id: u.id, email: u.email, username: u.username, isAdmin: isAdminEmail(env, u.email) } }, { headers: { 'Set-Cookie': sessionCookie(token) } });
};
