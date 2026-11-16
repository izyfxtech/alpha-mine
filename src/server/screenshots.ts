import { verifyUser, type SupabaseConfig } from "./auth";
import { isCleanPath, isOwnPath } from "./paths";
import { isValidSignature, signPath } from "./signing";

/** What the handlers need from the Worker: the R2 bucket, the signing secret and where to check logins. */
export type ScreenshotDeps = {
  bucket: R2Bucket;
  secret: string;
  supabase: SupabaseConfig;
  /** Seconds since 1970; replaceable in tests. */
  nowSeconds?: () => number;
  /** Replaceable in tests. */
  verify?: (request: Request) => Promise<string | null>;
  /** Which of these files, owned by someone else, the caller may see. Asks the database; replaceable in tests. */
  visible?: (request: Request, paths: string[]) => Promise<string[]>;
};

/**
 * A link is valid for at least this long, and at most twice as long. Expiry is rounded up to a
 * whole bucket (see `expiryFor`) so everyone who asks within the same hour gets the same URL for
 * the same file, and the browser's cache (keyed by URL) can answer repeat views.
 */
const TTL_SECONDS = 3600;
/** Files that belong to someone else (a student's screenshots seen by their mentor) get short links, so a revoked mentor loses access within minutes. */
const SHARED_TTL_SECONDS = 300;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_PATHS = 200;
/** Image types the app produces. SVG is left out on purpose: it can carry script. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const now = (deps: ScreenshotDeps) => (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))();

/**
 * When a link signed at `nowSeconds` expires: the first hour boundary at least TTL_SECONDS ahead.
 * A link signed with `now + TTL` differs on every call, so the browser never reuses a cached image;
 * this one is identical for every call inside the same hour.
 */
export const expiryFor = (nowSeconds: number, ttl = TTL_SECONDS) =>
  Math.ceil((nowSeconds + ttl) / ttl) * ttl;

/**
 * Asks the database which of `paths` the caller may see: the grant rules live there (visible_screenshot_paths) and nowhere else. The
 * call carries the caller's own session, so the answer is the caller's. Any failure answers "none": a file is never signed on a guess.
 */
export async function visibleToCaller(
  request: Request,
  paths: string[],
  { url, anonKey }: SupabaseConfig,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token || !paths.length) return [];
  try {
    const res = await fetcher(`${url}/rest/v1/rpc/visible_screenshot_paths`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ _paths: paths }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    return Array.isArray(body)
      ? body.filter((p): p is string => typeof p === "string" && paths.includes(p))
      : [];
  } catch {
    return [];
  }
}
const who = (request: Request, deps: ScreenshotDeps) =>
  (deps.verify ?? ((r) => verifyUser(r, deps.supabase)))(request);

/** Reads `{ paths: string[] }` from the body; null when it is not that. */
async function readPaths(request: Request): Promise<string[] | null> {
  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = body?.paths;
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) return null;
  return paths.every((p) => typeof p === "string") ? (paths as string[]) : null;
}

/** PUT /api/screenshots/<path>: stores one image in the signed-in user's own folder. A path is never overwritten. */
export async function uploadScreenshot(request: Request, path: string, deps: ScreenshotDeps) {
  const userId = await who(request, deps);
  if (!userId) return json({ error: "Not signed in" }, 401);
  if (!isOwnPath(userId, path)) return json({ error: "That path is not yours" }, 403);
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return json({ error: "Only images can be uploaded" }, 415);
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length <= 0) return json({ error: "Missing file size" }, 411);
  if (length > MAX_UPLOAD_BYTES) return json({ error: "Image is too large" }, 413);
  if (!request.body) return json({ error: "Empty upload" }, 400);
  const stored = await deps.bucket.put(path, request.body, {
    httpMetadata: { contentType: type, cacheControl: "private, max-age=31536000, immutable" },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  return stored ? json({ path }, 201) : json({ error: "That file already exists" }, 409);
}

/**
 * POST /api/screenshots/sign { paths }: links to the signed-in user's own files (one to two hours) and, when the database says the
 * caller may see them, to files a student shared or a mentor attached (five to ten minutes).
 */
export async function signScreenshots(request: Request, deps: ScreenshotDeps) {
  const userId = await who(request, deps);
  if (!userId) return json({ error: "Not signed in" }, 401);
  const paths = await readPaths(request);
  if (!paths) return json({ error: "Expected { paths: string[] }" }, 400);
  const unique = [...new Set(paths)];
  const own = unique.filter((p) => isOwnPath(userId, p));
  const others = unique.filter((p) => !own.includes(p) && isCleanPath(p));
  const shared = new Set(
    others.length
      ? await (deps.visible ?? ((r, p) => visibleToCaller(r, p, deps.supabase)))(request, others)
      : [],
  );
  const urls: Record<string, string> = {};
  const add = async (path: string, expires: number) => {
    const signature = await signPath(deps.secret, path, expires);
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    urls[path] = `/api/screenshots/${encoded}?exp=${expires}&sig=${signature}`;
  };
  for (const path of own) await add(path, expiryFor(now(deps)));
  for (const path of others)
    if (shared.has(path)) await add(path, expiryFor(now(deps), SHARED_TTL_SECONDS));
  return json({ urls });
}

/** GET /api/screenshots/<path>?exp&sig: the file, for anyone holding an unexpired link. */
export async function readScreenshot(request: Request, path: string, deps: ScreenshotDeps) {
  const params = new URL(request.url).searchParams;
  const valid =
    isCleanPath(path) &&
    (await isValidSignature(
      deps.secret,
      path,
      Number(params.get("exp")),
      params.get("sig") ?? "",
      now(deps),
    ));
  if (!valid) return new Response("Link expired or invalid", { status: 403 });
  const object = await deps.bucket.get(path, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // With a matching If-None-Match, R2 returns the object without a body: answer "not modified".
  return "body" in object
    ? new Response(object.body, { headers })
    : new Response(null, { status: 304, headers });
}

/** POST /api/screenshots/remove { paths }: deletes the signed-in user's own files. */
export async function removeScreenshots(request: Request, deps: ScreenshotDeps) {
  const userId = await who(request, deps);
  if (!userId) return json({ error: "Not signed in" }, 401);
  const paths = await readPaths(request);
  if (!paths) return json({ error: "Expected { paths: string[] }" }, 400);
  const own = paths.filter((p) => isOwnPath(userId, p));
  if (own.length) await deps.bucket.delete(own);
  return json({ removed: own.length });
}
