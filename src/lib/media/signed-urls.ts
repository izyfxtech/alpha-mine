import { supabase } from "@/integrations/supabase/client";

/**
 * Signed URLs for the private screenshots bucket, cached for the session.
 *
 * Every call to createSignedUrls returns NEW urls, and a browser treats a new url as a new image: it downloads the file
 * again even though nothing changed. Refetching the screenshot list (after saving a trade, changing tabs) therefore
 * re-downloaded every image. Here a url is reused until it is close to expiring, so the browser's own cache serves the
 * image and the app only asks Storage to sign what it has not signed yet.
 */
const TTL = 3600;               // seconds a signed url is valid
const REUSE_FOR = 50 * 60_000;  // ms it is handed out again; leaves 10 minutes of validity for the person looking at it
const cache = new Map<string, { url: string; at: number }>();

/** url per path; a path Storage cannot sign (no such file) is simply missing from the result. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const need = [...new Set(paths)].filter((p) => {
    const hit = cache.get(p);
    if (hit && now - hit.at < REUSE_FOR) { out.set(p, hit.url); return false; }
    return true;
  });
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const { data } = await supabase.storage.from("screenshots").createSignedUrls(chunk, TTL);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) { cache.set(row.path, { url: row.signedUrl, at: now }); out.set(row.path, row.signedUrl); }
    }
  }
  return out;
}

/** Forget everything, e.g. on sign-out. */
export const clearSignedUrls = () => cache.clear();
