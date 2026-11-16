import { signImagePaths } from "@/lib/media/storage-api";

/**
 * Signed URLs for the private screenshot store, cached for the session.
 *
 * A browser caches an image by its url, so a url that changes is a new image and is downloaded again. The server therefore
 * signs with an expiry rounded to the hour (src/server/screenshots.ts): asking again within the same hour returns the SAME
 * url. Here a url is also kept until it is close to expiring, so the app only asks the server to sign what it has not
 * signed yet, and the browser's own cache serves every image it has already seen.
 */
// A link is valid for one to two hours (a student's file seen by a mentor: five to ten minutes). One is handed out again for 50
// minutes after it was signed and, when its expiry is readable, only while at least 2 minutes of validity remain.
const REUSE_FOR = 50 * 60_000;
const MIN_REMAINING = 2 * 60_000;
const cache = new Map<string, { url: string; at: number }>();

/** The `exp` (seconds since 1970) in a signed url; null when the url has none. */
function expiresAtMs(url: string): number | null {
  const m = /[?&]exp=(\d+)/.exec(url);
  return m ? Number(m[1]) * 1000 : null;
}

function reusable(hit: { url: string; at: number }, now: number): boolean {
  if (now - hit.at >= REUSE_FOR) return false;
  const exp = expiresAtMs(hit.url);
  return exp == null || exp - now >= MIN_REMAINING;
}

/** url per path; a path that is not the user's own is simply missing from the result. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const need = [...new Set(paths)].filter((p) => {
    const hit = cache.get(p);
    if (hit && reusable(hit, now)) {
      out.set(p, hit.url);
      return false;
    }
    return true;
  });
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    for (const [path, url] of Object.entries(await signImagePaths(chunk))) {
      cache.set(path, { url, at: now });
      out.set(path, url);
    }
  }
  return out;
}

/** Forget everything, e.g. on sign-out. */
export const clearSignedUrls = () => cache.clear();
