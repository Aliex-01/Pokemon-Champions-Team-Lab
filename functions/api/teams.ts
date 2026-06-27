import { type Ctx, getUser, json } from '../_lib/auth';

// GET /api/teams → { teams: SavedTeam[] } del usuario logueado.
export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  const { results } = await env.DB.prepare('SELECT data FROM teams WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(user.id).all<{ data: string }>();
  const teams = results.map((r) => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
  return json({ teams });
};

// PUT /api/teams  body { teams: SavedTeam[] } → reemplaza los equipos del usuario.
export const onRequestPut = async ({ request, env }: Ctx): Promise<Response> => {
  const user = await getUser(env, request);
  if (!user) return json({ error: 'unauthorized' }, { status: 401 });

  let body: { teams?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, { status: 400 }); }
  const teams = Array.isArray(body.teams) ? body.teams : [];
  if (teams.length > 100) return json({ error: 'too_many' }, { status: 400 });

  const now = Date.now();
  const stmts = [env.DB.prepare('DELETE FROM teams WHERE user_id = ?').bind(user.id)];
  for (const t of teams as Array<{ id?: string; name?: string }>) {
    if (!t || typeof t.id !== 'string') continue;
    const data = JSON.stringify(t);
    if (data.length > 50_000) continue; // límite de tamaño por equipo
    stmts.push(
      env.DB.prepare('INSERT OR REPLACE INTO teams (id, user_id, name, data, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(t.id, user.id, String(t.name ?? 'Equipo'), data, now),
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true, count: stmts.length - 1 });
};
