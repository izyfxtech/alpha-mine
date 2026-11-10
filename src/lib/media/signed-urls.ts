import { signImagePaths } from "@/lib/media/storage-api";

/**
 * Signed URLs for the private screenshot store, cached for the session.
 *
 * Every signing returns NEW urls, and a browser treats a new url as a new image: it downloads the file again even though
 * nothing changed. Refetching the screenshot list (after saving a trade, changing tabs) therefore re-downloaded every
 * image. Here a url is reused until it is close to expiring, so the browser's own cache serves the image and the app only
 * asks the server to sign what it has not signed yet.
 */
// Links are valid for an hour (src/server/screenshots.ts). One is handed out again for 50 minutes, which leaves 10 minutes of
// validity for the person looking at it.
const REUSE_FOR = 50 * 60_000;
const cache = new Map<string, { url: string; at: number }>();

/** url per path; a path that is not the user's own is simply missing from the result. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const need = [...new Set(paths)].filter((p) => {
    const hit = cache.get(p);
    if (hit && now - hit.at < REUSE_FOR) {
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
