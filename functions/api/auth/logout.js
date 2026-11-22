import { deleteSession, clearCookie, json } from '../../_lib/auth';

export const onRequestPost = async ({ request, env }) => {
  await deleteSession(env, request);
  return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
};
