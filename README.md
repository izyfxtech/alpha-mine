# AlphaMine Trading Journal

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

1. Put your Supabase project details in `.env`:

   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   VITE_SUPABASE_PROJECT_ID=
   SUPABASE_URL=
   SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_PROJECT_ID=
   ```

2. Link the Supabase CLI and push the migrations (see "Database workflow" below).
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

## Database workflow

Drizzle Kit generates SQL into `supabase/migrations/`; the Supabase CLI applies and tracks it.

```
pnpm install
pnpm supabase login
pnpm supabase link --project-ref <your-project-ref>   # once
pnpm db:push                                          # apply migrations to the linked project
pnpm db:start                                         # optional: local stack (needs Docker)
pnpm db:types                                         # regenerate src/integrations/supabase/types.ts
```

Changing the schema:

1. First time only: `pnpm db:pull` (needs `DATABASE_URL`) to fill `drizzle/schema.ts` from the live database.
2. Edit `drizzle/schema.ts`, then `pnpm db:generate`. This writes `supabase/migrations/<timestamp>_<name>.sql`.
3. Review the SQL, then `pnpm db:push`. RLS policies, triggers and functions are not modelled by Drizzle, so add those as hand written migrations (`pnpm supabase migration new <name>`).

If your remote database already has the old manual migrations applied, mark them as done instead of re-running them:

```
pnpm supabase migration repair --status applied 20261003080104 20261004074640 20261005113320 20261006152000
```

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
