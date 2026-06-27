import { type Ctx, getUser, json } from '../_lib/auth';

// GET /api/replays → { data } (historial de repeticiones del usuario, o null).
export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const row = await env.DB.prepare('SELECT data FROM user_replays WHERE user_id = ?')
    .bind(user.id).first<{ data: string }>();
  let data: unknown = null;
  if (row) { try { data = JSON.parse(row.data); } catch { data = null; } }
  return json({ data });
};

// PUT /api/replays  body { data } → guarda el blob de repeticiones del usuario.
export const onRequestPut = async ({ request, env }: Ctx): Promise<Response> => {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  let body: { data?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }
  const data = JSON.stringify(body.data ?? {});
  if (data.length > 2_000_000) return json({ error: 'too_large' }, { status: 400 });

  await env.DB.prepare('INSERT OR REPLACE INTO user_replays (user_id, data, updated_at) VALUES (?, ?, ?)')
    .bind(user.id, data, Date.now()).run();
  return json({ ok: true });
};
