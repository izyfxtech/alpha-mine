import { verifyUser, type SupabaseConfig } from "./auth";
import { adminClient, sweepQueue } from "./sweep";

/** POST /api/storage/sweep: deletes the files queued for removal under the signed-in user's own folder. */
export async function sweepForUser(
  request: Request,
  deps: { bucket: R2Bucket; supabase: SupabaseConfig; serviceRoleKey: string },
) {
  const userId = await verifyUser(request, deps.supabase);
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const admin = adminClient(deps.supabase.url, deps.serviceRoleKey);
    return Response.json(await sweepQueue(admin, deps.bucket, `${userId}/`));
  } catch (error) {
    console.error("sweep-storage", error);
    return Response.json({ error: "Could not sweep storage" }, { status: 500 });
  }
}
