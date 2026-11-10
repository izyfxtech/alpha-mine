import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Rows taken from the clean-up queue per round. */
const BATCH = 200;
/** Rounds per run. Each round makes a handful of requests, and a Worker on the free plan may make 50 in all. */
const MAX_ROUNDS = 8;

type QueueRow = { id: number; path: string };

/**
 * Deletes the screenshot files whose rows are gone. The database cannot delete files itself, so a trigger queues each
 * removed path in `storage_cleanup`; this empties that queue from R2. A path leaves the queue only after its file is
 * deleted, and a path some screenshot row still points at (copied journals share files) is dropped from the queue untouched.
 *
 * `prefix` limits the sweep to one user's folder (`<user id>/`); without it the whole queue is swept, which includes files of
 * deleted accounts. Returns how many files were deleted and how many paths are still queued.
 */
export async function sweepQueue(
  admin: SupabaseClient,
  bucket: R2Bucket,
  prefix: string | null,
  rounds = MAX_ROUNDS,
): Promise<{ removed: number; remaining: number }> {
  let removed = 0;
  for (let round = 0; round < rounds; round++) {
    let query = admin
      .from("storage_cleanup")
      .select("id,path")
      .eq("bucket", "screenshots")
      .order("id")
      .limit(BATCH);
    if (prefix) query = query.like("path", `${prefix}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as QueueRow[];
    if (!rows.length) break;

    const used = await admin
      .from("trade_screenshots")
      .select("path")
      .in(
        "path",
        rows.map((r) => r.path),
      );
    if (used.error) throw new Error(used.error.message);
    const inUse = new Set((used.data ?? []).map((u) => u.path as string));

    const doomed = rows.filter((r) => !inUse.has(r.path));
    if (doomed.length) await bucket.delete(doomed.map((r) => r.path));
    const done = await admin
      .from("storage_cleanup")
      .delete()
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (done.error) throw new Error(done.error.message);
    removed += doomed.length;
    if (rows.length < BATCH) break;
  }

  let count = admin.from("storage_cleanup").select("id", { count: "exact", head: true });
  if (prefix) count = count.like("path", `${prefix}%`);
  const { count: remaining } = await count;
  return { removed, remaining: remaining ?? 0 };
}

/** A Supabase client that bypasses row-level security. Server-only: the key never reaches the browser. */
export const adminClient = (url: string, serviceRoleKey: string) =>
  createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
