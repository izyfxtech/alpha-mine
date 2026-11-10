/** Where the Supabase project lives. The values are the same build-time variables the browser uses. */
export type SupabaseConfig = { url: string; anonKey: string };

export function supabaseConfig(): SupabaseConfig {
  const url = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const anonKey =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !anonKey) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return { url, anonKey };
}

/**
 * The signed-in user's id for a request, or null. The browser sends its Supabase access token as `Authorization: Bearer ...`;
 * Supabase Auth is asked who it belongs to, so a forged, expired or revoked token is refused.
 */
export async function verifyUser(
  request: Request,
  { url, anonKey }: SupabaseConfig,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return null;
  const res = await fetcher(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: unknown };
  return typeof user.id === "string" ? user.id : null;
}
