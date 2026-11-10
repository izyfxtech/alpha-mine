import { supabase } from "@/integrations/supabase/client";

/**
 * The browser's side of the screenshot store (R2, behind the Worker's /api/screenshots routes). Every call carries the
 * signed-in user's access token; the Worker checks it and keeps each user to their own folder.
 */
async function authorization(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error ?? `Storage request failed (${res.status})`);
}

/** Stores an image at `path` (which must start with the user's id). Fails if the path is already taken. */
export async function uploadImage(path: string, image: Blob): Promise<void> {
  const res = await fetch(`/api/screenshots/${encodePath(path)}`, {
    method: "PUT",
    headers: {
      ...(await authorization()),
      "Content-Type": image.type || "application/octet-stream",
    },
    body: image,
  });
  if (!res.ok) throw await failure(res);
}

/** Links, valid for an hour, to the user's own files. A path that is not theirs is left out of the result. */
export async function signImagePaths(paths: string[]): Promise<Record<string, string>> {
  const res = await fetch("/api/screenshots/sign", {
    method: "POST",
    headers: { ...(await authorization()), "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { urls: Record<string, string> }).urls;
}

/** Deletes the user's own files. */
export async function removeImages(paths: string[]): Promise<void> {
  const res = await fetch("/api/screenshots/remove", {
    method: "POST",
    headers: { ...(await authorization()), "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) throw await failure(res);
}

/** Deletes the files queued for removal under the user's folder (see src/server/sweep.ts). */
export async function sweepMyFiles(): Promise<void> {
  const res = await fetch("/api/storage/sweep", { method: "POST", headers: await authorization() });
  if (!res.ok) throw await failure(res);
}
