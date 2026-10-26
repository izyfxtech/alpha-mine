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


## Database migration 0002

`drizzle/migrations/0002_plans_missed_option_fields.sql` adds Option Type, Expiry Date and Multiplier to Trading Plans and Missed Trades, and a `planned_trade_custom_stats` table so Trading Plans can carry custom statistics. Apply it to your Supabase project (SQL editor or `pnpm drizzle-kit migrate`) before using those fields. It is safe to run more than once.

New dependency: `html-to-image` (calendar screenshot button). Run `pnpm install`.


## Database migrations 0003 and 0004

- `drizzle/migrations/0003_mt_import.sql` mirrors the MetaTrader import SQL (`sync_jobs`, `journals.mt_*`, `trades.source/external_id/raw_symbol/commission/swap`, the unique `(journal_id, external_id)` index and the updated `trades_compute_pnl` trigger). It is written with `IF NOT EXISTS` / `OR REPLACE`, so it is safe to run on a database where you already applied those statements by hand.
- `drizzle/migrations/0004_disable_items.sql` adds a `disabled` flag to instruments, setups, trade comments and custom statistics, and `journals.disabled_session_categories`. The Settings pages use it for the "Active Items / Disabled Items" switch: the trash icon retires an item (it stays on existing trades) instead of deleting it.
