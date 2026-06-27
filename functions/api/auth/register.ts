import { type Ctx, hashPassword, createSession, sessionCookie, json, uuid, normEmail, validEmail } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }

  const email = normEmail(body.email);
  const password = String(body.password ?? '');
  if (!validEmail(email)) return json({ error: 'invalid_email' }, { status: 400 });
  if (password.length < 8) return json({ error: 'weak_password' }, { status: 400 });

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return json({ error: 'email_taken' }, { status: 409 });

  const { hash, salt, iters } = await hashPassword(password, env.SESSION_SECRET);
  const id = uuid();
  await env.DB.prepare('INSERT INTO users (id, email, pw_hash, pw_salt, pw_iters, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, email, hash, salt, iters, Date.now()).run();

  const token = await createSession(env, id);
  return json({ user: { id, email } }, { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } });
};
