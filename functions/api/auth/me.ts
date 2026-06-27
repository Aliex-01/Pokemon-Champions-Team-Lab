import { type Ctx, getUser, json } from '../../_lib/auth';

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const user = await getUser(env, request);
  return json({ user });
};
