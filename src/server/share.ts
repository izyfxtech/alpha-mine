import type { SupabaseConfig } from "./auth";

/** How long a shared journal is served from the cache. KV will not hold a key for less than 60 seconds. */
const CACHE_SECONDS = 60;

export type ShareDeps = {
  cache: KVNamespace;
  limiter: RateLimit;
  supabase: SupabaseConfig;
  fetcher?: typeof fetch;
};

const json = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

/**
 * GET /api/share/<token>: the public summary of a shared journal. Visitors are rate limited, and the answer is cached for a
 * minute so a link that is passed around does not reach the database on every view. Revoking a link therefore takes up to a
 * minute to show.
 */
export async function sharedJournal(request: Request, token: string, deps: ShareDeps) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json("null", 404);
  const visitor = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await deps.limiter.limit({ key: visitor });
  if (!success) return json('{"error":"Too many requests"}', 429, { "retry-after": "60" });

  const key = `share:${token}`;
  const cached = await deps.cache.get(key);
  if (cached !== null) return json(cached, 200, { "x-cache": "hit" });

  const { url, anonKey } = deps.supabase;
  const res = await (deps.fetcher ?? fetch)(`${url}/rest/v1/rpc/shared_journal`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      // New-style publishable keys are not JWTs and must not be sent as a bearer token.
      ...(anonKey.startsWith("sb_") ? {} : { Authorization: `Bearer ${anonKey}` }),
      "content-type": "application/json",
    },
    body: JSON.stringify({ _token: token }),
  });
  if (!res.ok) return json('{"error":"Could not load this journal"}', 502);
  const body = await res.text();
  await deps.cache.put(key, body, { expirationTtl: CACHE_SECONDS });
  return json(body, 200, { "x-cache": "miss" });
}
