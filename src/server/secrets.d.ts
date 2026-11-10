// Secrets are set with `wrangler secret put` (docs/cloudflare.md), so `wrangler types` cannot see them. Declared here.
declare namespace Cloudflare {
  interface Env {
    /** Bypasses row-level security: used by the daily clean-up only. */
    SUPABASE_SERVICE_ROLE_KEY: string;
    /** Signs screenshot links. Any long random string. */
    SCREENSHOT_SIGNING_KEY: string;
  }
}
