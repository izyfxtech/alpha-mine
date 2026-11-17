# EdgeWhiz Trading Journal

A private trading journal built with TanStack Start, React, Tailwind and Supabase.
Journals, trades, plans, backtests and analytics are stored per user in Supabase
with owner-scoped row level security.

## Scripts

```
pnpm dev          # dev server
pnpm check        # typecheck + lint + tests + build (what CI runs)
pnpm typecheck    # tsc --noEmit
pnpm lint         # oxlint (findings in older code are warnings)
pnpm test         # vitest
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the folder map, data model, P&L engine and import pipeline,
and [CHANGELOG.md](CHANGELOG.md) for what changed.

## Getting started

1. Copy `.env.example` to `.env` and fill in the three `VITE_` values (Supabase URL, publishable key, Turnstile site key).

2. Link the Supabase CLI and push the migrations (see "Database workflow" below).
3. Install and run:

   ```
   pnpm install
   pnpm dev
   ```

## Server-side secrets

- `SUPABASE_SERVICE_ROLE_KEY`: used only by the daily screenshot clean-up (Cloudflare secret).
- `SCREENSHOT_SIGNING_KEY`: signs screenshot links (Cloudflare secret, see `docs/cloudflare.md`).
- `DATABASE_URL`: Postgres connection string, only for `drizzle-kit` (`pnpm db:pull`, `pnpm db:generate`).

## Google sign-in

Enable the Google provider in Supabase (Authentication > Providers) and add your site
URL and `<site>/auth` to the allowed redirect URLs.

## Database workflow

Drizzle Kit generates SQL into `supabase/migrations/`; the Supabase CLI applies and tracks it.

```
pnpm install
pnpm supabase login
pnpm supabase link --project-ref <your-project-ref>   # once
pnpm db:push                                          # apply migrations to the linked project (the CLI targets the local database unless --remote is given)
pnpm db:start                                         # optional: local stack (needs Docker)
pnpm db:types                                         # regenerate src/integrations/supabase/types.ts
```

Changing the schema:

1. First time only: `pnpm db:pull` (needs `DATABASE_URL`) to fill `drizzle/schema.ts` from the live database.
2. Edit `drizzle/schema.ts`, then `pnpm db:generate`. This writes `supabase/migrations/<timestamp>_<name>.sql`.
3. Review the SQL, then `pnpm db:push`. RLS policies, triggers and functions are not modelled by Drizzle, so add those as hand written migrations (`pnpm supabase migration new <name>`).

The migrations are one baseline, grouped by area (`core_journal`, `lookups`, `trades`, `plans_and_notebook`, `screenshots`,
`metatrader_import`, `sharing`, `account`, `mentorship`) and meant for a fresh project. A project that ran the earlier,
patch-by-patch migrations must be reset first (`pnpm supabase db reset --linked`, which wipes its data). From here on a
pushed migration is never edited: add a new file.

## P&L engine (audit mode)

An exact decimal P&L engine with currency conversion and broker reconciliation runs in the `compute-pnl`
Edge Function (`supabase/functions/_shared/pnl-engine`). In this phase it **never writes to `trades`**. It records
what it computed next to the values currently stored, in `trade_pnl_audit`, so the two can be compared first.

```
pnpm supabase db push                                   # adds instrument/journal columns and the audit tables
pnpm supabase functions deploy compute-pnl
pnpm supabase secrets set MASSIVE_API_KEY=...           # optional: minute rates (Frankfurter daily rates need no key)
```

Run it for a journal (the client calls it until `remaining` is 0):

```ts
const { data } = await supabase.functions.invoke("compute-pnl", { body: { journal_id } });
```

Journals linked to a MetaTrader account are set to `lots`. For any other journal set `journals.quantity_unit`
to `lots` or `units`; until then its trades are skipped, never guessed. Trades with hand typed P&L are never touched.
Review: `select status, recon_status, count(*) from trade_pnl_audit group by 1, 2;`

## Importing trades

The Import dialog accepts a MetaTrader 4 statement or MetaTrader 5 history report (HTML or Excel) or a CSV. For CSVs it finds the header row and
suggests the column mapping; tick "Each row is a single fill" for execution files (scale-ins and partial exits are grouped
into trades). Re-importing a file never duplicates trades (late commission or swap is updated; your notes and stops are not touched). After a MetaTrader import the app runs the P&L audit and fills in
R-multiples where a stop loss was set.

## Prop challenges

`/prop-challenge` replays your closed trades against a firm's rules (profit target, drawdown, daily loss, minimum days,
consistency). It uses closed trades only and does not model payouts or scaling plans.

## Hosting (Cloudflare)

EdgeWhiz runs as a Cloudflare Worker. Screenshots live in an R2 bucket, shared journal links are cached in KV, and a
Cron Trigger empties the screenshot clean-up queue every day. Setup and deploy steps are in `docs/cloudflare.md`.

## Storage clean-up (screenshots)

Deleting a screenshot row (directly, or through a deleted trade, merged trade, journal or account) queues its file in
`storage_cleanup`. The app asks the Worker to empty the queue after deletes. Files of deleted accounts have no signed-in
user, so the daily Cron Trigger (`wrangler.jsonc`) empties the queue for everyone.
