import { type Ctx, verifyPassword, createSession, sessionCookie, json, normEmail, rateOk, rateFail, rateClear } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }

  const email = normEmail(body.email);
  const password = String(body.password ?? '');
  if (!email || !password) return json({ error: 'invalid_credentials' }, { status: 401 });

  if (!(await rateOk(env, email))) return json({ error: 'rate_limited' }, { status: 429 });

  const u = await env.DB.prepare('SELECT id, email, pw_hash, pw_salt, pw_iters FROM users WHERE email = ?')
    .bind(email).first<{ id: string; email: string; pw_hash: string; pw_salt: string; pw_iters: number }>();

  if (!u || !(await verifyPassword(password, env.SESSION_SECRET, u.pw_salt, u.pw_iters, u.pw_hash))) {
    await rateFail(env, email);
    return json({ error: 'invalid_credentials' }, { status: 401 });
  }

  await rateClear(env, email);
  const token = await createSession(env, u.id);
  return json({ user: { id: u.id, email: u.email } }, { headers: { 'Set-Cookie': sessionCookie(token) } });
};
