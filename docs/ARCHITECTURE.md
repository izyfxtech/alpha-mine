# Architecture

AlphaMine is a TanStack Start (React 19, Vite, Tailwind) app on Supabase (Postgres, Auth, Storage, Edge Functions).
Every journal-owned table carries `journal_id` and is protected by the `owns_journal()` row level security policy.

## Folder map

| Path | What lives there |
| --- | --- |
| `src/routes/` | File-based routes. `_authenticated/` holds the signed-in app; the rest is the marketing site, auth and legal pages. `routeTree.gen.ts` is generated, never edit it. |
| `src/components/` | Shared UI. `ui/` is the shadcn-style primitive layer; `layout/` (sidebar, top bar, command palette), `journal/` (import dialog, trade drawer, picker, sharing, `trade-form/`), `analytics/` (KPI cards, calendar, filters, charts), `marketing/` (public site shell and legal pages). `kit.tsx` holds the app's panels and stats. |
| `src/lib/` | App logic with no UI, by domain: `pnl/` (`metrics.ts` is the one place performance numbers come from; audit, insights, edge finder, prop challenge), `journal/` (`journal-context.tsx` for journal, filters and trades; `crud.ts` table helper; demo data), `media/` (screenshots), `errors/`, `content/` (posts, news, site copy). `utils.ts` and `nav.ts` stay at the root because shadcn expects `@/lib/utils`. |
| `src/lib/import/` | Everything that turns files into trades: `mt/` (report reader and mapping; parsing itself is in `_shared/mt/`), `fills-import.ts`, `csv-mapping.ts`. All pure, no network. |
| `src/integrations/supabase/` | Client and generated `types.ts` (regenerate with `pnpm db:types`). |
| `src/test/` | Vitest. `pnl-engine/` covers the engine, the rest mirrors `src/lib`. |
| `supabase/migrations/` | Ordered SQL, applied with `pnpm db:push`. Written to be safe to re-run. |
| `supabase/functions/` | Edge Functions (Deno). `_shared/pnl-engine/` is also imported by the app and tests through the `@engine` alias. |
| `docs/` | This guide, the changelog source and `patches/` (the original staged patches, kept for history). |

Path aliases: `@/` is `src/`, `@engine/` is `supabase/functions/_shared/pnl-engine/`, `@shared/` is `supabase/functions/_shared/`.
Code in `supabase/functions/` keeps relative imports with `.ts` extensions because Deno resolves them directly.

## Data model (main tables)

- `journals`: one per trading account. Currency, starting balance, optional MetaTrader link (`mt_platform`, `mt_server`, `mt_login`), `quantity_unit` (`lots` or `units`).
- `trades`: one row per closed or open trade. Weighted entry/exit, size, costs, `gross_pnl`/`fees`/`net_pnl` (kept consistent by the `trades_compute_pnl` trigger), `source`, `external_id` (idempotency key, unique per journal), `pnl_manual`.
- `trade_executions`: entry and exit legs behind a trade (scale-in, partial exits).
- `instruments`, `setups`, `comment_definitions`, `custom_stat_*`: the user's vocabulary.
- `journal_cashflows`: deposits and withdrawals, with `external_id` for idempotent imports.
- `prop_challenges`: prop firm rule sets as JSON.
- `trade_pnl_audit`, `rate_observations`: output of the P&L engine and the exchange rates it used.
- `sync_jobs`: queue for MetaTrader sync (`file_import`, `ea_push`, `worker_pull`).

## P&L engine

`supabase/functions/_shared/pnl-engine/` is pure TypeScript on exact decimals (`decimal.js`), shared by the Edge Function and the app.

- `calc.ts`, `instruments.ts`, `currency.ts`: price move, pips, contract sizes, digits.
- `rates/`: rate providers (Frankfurter daily, Massive minute, broker-implied) behind one resolver, with triangulation.
- `engine.ts`: computes gross/net/R for a trade, and reconciles the broker's own profit against an independent calculation.
- `matching.ts`: FIFO and average-cost lot matching. `positions.ts`: fills grouped into positions (scale-in, partial exits, flips).
- `time.ts`: MetaTrader server time to UTC.

The `compute-pnl` Edge Function audits trades into `trade_pnl_audit`. It never changes gross, net or fees. With `apply: true` it only fills an empty `risk_amount`.

## Importing trades

1. **MetaTrader 4 statement or MetaTrader 5 report** (HTML or Excel): `_shared/mt/` parses the Positions (MT5) or Closed Transactions (MT4) table by anchors, not header index; `lib/import/mt/to-trades.ts` builds an RPC payload of broker facts. The `import_mt_report` database function writes instruments, account link, trades, deposits and a `sync_jobs` row in one transaction. Imported rows keep the broker's profit (`pnl_manual`, `source` = `mt4`/`mt5`, `external_id` = ticket). After the import the app runs `compute-pnl` with `apply`.
2. **CSV, one row per trade**: `csv-mapping.ts` finds the header row and suggests columns; the dialog maps them.
3. **CSV, one row per fill**: `fills-import.ts` groups fills into closed trades with legs. Still-open positions are reported, never imported.

All imports are idempotent through `(journal_id, external_id)`.

## Conventions

- Performance numbers come from `src/lib/pnl/metrics.ts` only.
- Simple journal-scoped tables go through `useJournalTable` in `src/lib/journal/crud.ts`.
- Migrations are additive and re-runnable; add RLS policies and triggers by hand, Drizzle does not model them.
- Run `pnpm check` (typecheck, lint, tests, build) before pushing. CI runs the same steps.
- Lint findings in older code are warnings, new code should not add to them.
