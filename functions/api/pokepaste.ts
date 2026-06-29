// Proxy para importar Poképastes desde el navegador sin problemas de CORS:
// descarga el `…/raw` de pokepast.es en el servidor y devuelve el texto.

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const target = new URL(request.url).searchParams.get('url') ?? '';
  const m = target.match(/pokepast\.es\/([a-zA-Z0-9]+)/);
  if (!m) return json({ error: 'invalid_url' }, 400);
  const res = await fetch(`https://pokepast.es/${m[1]}/raw`, { headers: { 'User-Agent': 'champions-team-lab' } });
  if (!res.ok) return json({ error: 'fetch_failed' }, 502);
  return json({ paste: await res.text() });
};
