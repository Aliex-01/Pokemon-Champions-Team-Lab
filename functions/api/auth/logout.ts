import { type Ctx, deleteSession, clearCookie, json } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  await deleteSession(env, request);
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
};
