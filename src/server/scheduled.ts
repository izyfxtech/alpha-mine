import { supabaseConfig } from "./auth";
import { adminClient, sweepQueue } from "./sweep";

/** The daily Cron Trigger: empties the whole screenshot clean-up queue, including files left by deleted accounts. */
export async function runDailySweep(env: Cloudflare.Env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const admin = adminClient(supabaseConfig().url, env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await sweepQueue(admin, env.SCREENSHOTS, null);
  console.log("daily sweep", result);
}
