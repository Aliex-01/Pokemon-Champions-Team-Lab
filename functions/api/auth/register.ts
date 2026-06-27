import { type Ctx, hashPassword, createSession, sessionCookie, json, uuid, normEmail, validEmail, normUsername, validUsername } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let body: { email?: string; username?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }

  const email = normEmail(body.email);
  const username = normUsername(body.username);
  const password = String(body.password ?? '');
  if (!validEmail(email)) return json({ error: 'invalid_email' }, { status: 400 });
  if (!validUsername(username)) return json({ error: 'invalid_username' }, { status: 400 });
  if (password.length < 8) return json({ error: 'weak_password' }, { status: 400 });

  const emailTaken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (emailTaken) return json({ error: 'email_taken' }, { status: 409 });
  const nameTaken = await env.DB.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').bind(username).first();
  if (nameTaken) return json({ error: 'username_taken' }, { status: 409 });

  const { hash, salt, iters } = await hashPassword(password, env.SESSION_SECRET);
  const id = uuid();
  await env.DB.prepare('INSERT INTO users (id, email, username, pw_hash, pw_salt, pw_iters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, username, hash, salt, iters, Date.now()).run();

  const token = await createSession(env, id);
  return json({ user: { id, email, username } }, { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } });
};
