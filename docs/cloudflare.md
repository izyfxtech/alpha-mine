# Cloudflare deployment

AlphaMine runs as one Cloudflare Worker (`wrangler.jsonc`, entry `src/server.ts`). Supabase keeps Postgres, Auth and row level security.

| Cloudflare product              | Used for                                                  |
| ------------------------------- | --------------------------------------------------------- |
| Workers                         | Serves the app (server rendering) and the `/api/*` routes |
| R2 (`SCREENSHOTS`)              | Trade screenshots                                         |
| KV (`EDGE_CACHE`)               | 60-second cache of public share links                     |
| Rate Limiting (`SHARE_LIMITER`) | 30 share-link requests per minute per visitor             |
| Cron Trigger                    | Daily clean-up of deleted screenshots (03:17 UTC)         |
| Turnstile                       | Bot check on the sign-in form                             |
| Observability, Web Analytics    | Logs and traffic, switched on in Cloudflare               |

## One-time setup

1. `pnpm install`, then `pnpm exec wrangler login`.
2. Create the bucket: `pnpm exec wrangler r2 bucket create alphamine-screenshots`.
3. Set the two secrets (Worker only, never in the browser bundle):
   ```
   pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Supabase > Settings > API
   pnpm exec wrangler secret put SCREENSHOT_SIGNING_KEY      # any long random string, e.g. `openssl rand -hex 32`
   ```
   The first deploy creates the Worker; if `secret put` asks to create it, say yes.
4. Build-time variables (read by `vite build`, so set them in the shell or your CI before deploying):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`.
5. `pnpm cf:deploy`. The KV namespace is created automatically on the first deploy.
6. Turnstile: in the Cloudflare dashboard open **Turnstile** > **Add widget**. Give it a name, add your Worker's hostname
   (`alphamine.<your-subdomain>.workers.dev`, or your own domain; add it after the first deploy if you do not know it yet) and
   choose the **Managed** widget mode. After **Create**, copy the site key and the secret key straight away. Put the site key in
   `VITE_TURNSTILE_SITE_KEY` and redeploy. Only then, in Supabase, open the Authentication settings > **Bot and Abuse Protection**,
   turn on **Enable CAPTCHA protection**, choose **Turnstile**, paste the secret key and **Save**. Supabase checks the token; the
   Worker does not. Turning CAPTCHA on before the deployed site carries the site key blocks every sign-in.
7. Add your Worker URL or custom domain to Supabase's redirect URLs (Authentication > URL Configuration) for Google sign-in.
8. Web Analytics: Cloudflare dashboard > Analytics & Logs > Web Analytics > add your site. No code is needed on a Cloudflare-proxied domain.

## Moving existing screenshots

R2 keys are the same paths Supabase Storage used (`<user_id>/…`), so the database needs no change. Copy the files once with
R2 Super Slurper (Cloudflare dashboard > R2 > Data Migration), using Supabase's S3-compatible endpoint
(Supabase > Storage > S3 Connection) as the source and `alphamine-screenshots` as the destination. Until a file is copied, its screenshot shows as missing.

## Local development

`pnpm dev` runs the Worker locally with a simulated R2 bucket and KV. Put the secrets in `.dev.vars` (gitignored):

```
SUPABASE_SERVICE_ROLE_KEY=...
SCREENSHOT_SIGNING_KEY=...
```

To try the production build, run `pnpm build`, copy `.dev.vars` to `dist/server/.dev.vars`, then `pnpm preview`.
After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen`.

## Limits worth knowing

- The free Workers plan allows 3 MB per Worker (compressed; the app is about 1.3 MB) and 50 outgoing requests per call, which is why
  one clean-up run handles at most 8 batches. The daily run simply continues next day if more is queued.
- A revoked share link keeps working for up to 60 seconds because of the KV cache.
- Signed screenshot links expire after one hour; the app re-signs them as needed.
