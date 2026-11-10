import { env } from "cloudflare:workers";
import { supabaseConfig } from "./auth";
import type { ScreenshotDeps } from "./screenshots";
import type { ShareDeps } from "./share";

/** A secret that was never set would sign every link with an empty key; refuse to run without it. */
function required(name: "SCREENSHOT_SIGNING_KEY" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set. Add it with: wrangler secret put ${name}`);
  return value;
}

/** The bindings the API routes use, read when a request arrives. */
export const screenshotDeps = (): ScreenshotDeps => ({
  bucket: env.SCREENSHOTS,
  secret: required("SCREENSHOT_SIGNING_KEY"),
  supabase: supabaseConfig(),
});

export const shareDeps = (): ShareDeps => ({
  cache: env.EDGE_CACHE,
  limiter: env.SHARE_LIMITER,
  supabase: supabaseConfig(),
});

export const sweepDeps = () => ({
  bucket: env.SCREENSHOTS,
  supabase: supabaseConfig(),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
});
