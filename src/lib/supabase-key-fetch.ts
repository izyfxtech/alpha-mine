/**
 * Supabase's newer API keys (`sb_publishable_…`, `sb_secret_…`) are opaque strings, not JWTs. They belong in the `apikey`
 * header only; sent as `Authorization: Bearer` the gateway refuses them. supabase-js sends the key both ways, so this wrapper
 * drops the Authorization header when it is just the key (a signed-in user's own token is kept).
 */
export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return base(input, { ...init, headers });
  };
}
