/**
 * sweep-storage: removes the screenshot files whose rows are gone.
 *
 * The database cannot delete storage files itself (Supabase blocks DELETE on storage.objects, and the backend file
 * would stay anyway), so a trigger queues each deleted screenshot path in `storage_cleanup`. This function empties
 * that queue through the Storage API. A path leaves the queue only after the API has removed it.
 *
 * POST with either
 *   - the signed-in user's JWT: sweeps only that user's own folder (paths start with `<user id>/`), or
 *   - `Authorization: Bearer <CRON_SECRET>`: sweeps everything, including files of deleted accounts. Schedule this
 *     (pg_cron + pg_net, or any scheduler) once a day or so.
 *
 * Secrets: CRON_SECRET (for the scheduled call). SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
 * provided by the platform.
 */
import { createClient } from '@supabase/supabase-js';

const BATCH = 200;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Constant-time string comparison, so the secret cannot be guessed from response timing. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Missing Authorization header' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const secret = Deno.env.get('CRON_SECRET');
  const bearer = auth.replace(/^Bearer\s+/i, '');

  let prefix: string | null = null; // null = everything (scheduled run)
  if (!(secret && same(bearer, secret))) {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data, error } = await user.auth.getUser();
    if (error || !data.user) return json({ error: 'Not signed in' }, 401);
    prefix = `${data.user.id}/`;
  }

  try {
    let q = admin.from('storage_cleanup').select('id,bucket,path').order('id').limit(BATCH);
    if (prefix) q = q.like('path', `${prefix}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) return json({ removed: 0, remaining: 0 });

    let removed = 0;
    const failed: string[] = [];
    for (const bucket of [...new Set(rows.map((r) => r.bucket as string))]) {
      const mine = rows.filter((r) => r.bucket === bucket);
      const { error: rmErr } = await admin.storage.from(bucket).remove(mine.map((r) => r.path as string));
      if (rmErr) { failed.push(bucket); continue; }
      const { error: delErr } = await admin.from('storage_cleanup').delete().in('id', mine.map((r) => r.id as number));
      if (delErr) throw new Error(delErr.message);
      removed += mine.length;
    }

    let c = admin.from('storage_cleanup').select('id', { count: 'exact', head: true });
    if (prefix) c = c.like('path', `${prefix}%`);
    const { count } = await c;
    return json({ removed, remaining: count ?? 0, ...(failed.length ? { failed_buckets: failed } : {}) });
  } catch (e) {
    console.error('sweep-storage', e);
    return json({ error: 'Could not sweep storage' }, 500);
  }
});
