import { getUser, json } from '../../_lib/auth';

export const onRequestGet = async ({ request, env }) => {
  const user = await getUser(env, request);
  return json({ user });
};
