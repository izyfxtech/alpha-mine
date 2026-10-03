# AlphaMine Trading Journal

A private trading journal built with TanStack Start, React, Tailwind and Supabase.
Journals, trades, plans, backtests and analytics are stored per user in Supabase
with owner-scoped row level security.

## Getting started

1. Put your Supabase project details in `.env`:

   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   VITE_SUPABASE_PROJECT_ID=
   SUPABASE_URL=
   SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_PROJECT_ID=
   ```

2. Apply the SQL files in `drizzle/migrations/` (in order) to your Supabase project,
   via the SQL editor or `pnpm drizzle-kit migrate` with `DATABASE_URL` set to your
   Postgres connection string.
3. Install and run:

   ```
   pnpm install
   pnpm dev
   ```

## Optional server-side variables

- `SUPABASE_SERVICE_ROLE_KEY`: only needed by server code using a service-role client.
- `CRON_SECRET`: bearer token checked by cron endpoints.
- `DATABASE_URL`: Postgres connection string used by `drizzle-kit`.

## Google sign-in

Enable the Google provider in Supabase (Authentication > Providers) and add your site
URL and `<site>/auth` to the allowed redirect URLs.
