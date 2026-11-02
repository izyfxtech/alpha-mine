# Changelog

Newest first. Dates are the day the work landed on `main`.

## 2026-11-02

- **R-multiple on every trade**: planned risk now comes from one rule (`src/lib/pnl/risk.ts`): the stored `risk_amount` if there is one, otherwise worked out from the stop loss (shares: distance x quantity; forex pairs quoted in, or based on, the account currency: distance x lots x contract size). Cross pairs that need another currency's rate, unknown units and trailed stops stay blank instead of being guessed. The P&L engine still refines imported trades.
- **Journal creation modal** reduced to Name, Currency, Markets (Forex, Stocks), Initial amount and Deposit date. How quantity is read is decided per instrument (`instruments.asset_class`: forex = lots, stock = units), no longer asked per journal; the journal's own unit is only the fallback for instruments without a class.
- **Date pickers**: new `DatePicker` / `DateTimePicker` (`components/ui/date-picker.tsx`) with month and year dropdowns that keep the day grid on show, replacing every native date input and the old year/month popups; `DateRangeButton` uses the same header.
- **In-app confirmations**: `useDialogs()` (`components/ui/confirm.tsx`) replaces every `window.confirm` / `prompt`.
- **Trade details**: a trade with no exit date is open (the checkbox is gone); commission, swap and other fees are separate columns (`trades.other_fees`; `fees` stays the total cost and is derived by the trigger).
- **Chart x-axis**: Trade No. or Date on the Equity graph and the per-trade Chart Lab charts (Drawdown, Efficiency, SQN, Win rate, Trade management); the choice is remembered in the browser.
- Migration `20261102090000_core_fixes.sql` also reloads the API schema cache. If `create_journal` is "not found in the schema cache", the earlier migrations were never applied to the Supabase project: run `pnpm db:push`.

## 2026-10-30

- **Rule compliance**: define trading rules (Settings → Trading Rules), rate each trade Followed / Partial / Violated in the trade drawer, and see adherence and a "cost of rule-breaking" card on the new Rule Compliance page and in Edge Finder. The estimate is withheld below 5 followed and 3 violated trades. Migration `20261030090000_rules_and_saved_filters.sql`.
- **Drill-down and search**: journal search box (instrument, setup, notes, ticket, dates, comments, rule names), saved filter sets, a "Filters active" chip, and click-through from Chart Lab bars/rows (instrument, setup, weekday, month, year, hour, day) to the trades behind them.
- **Open trades**: tick "Trade is still open" in the drawer; open trades are excluded from all statistics and listed on the new Open Trades page with risk, exposure and what-if results at a price you type. Adjustment history is not tracked.

- **Folder structure**: `src/lib` and `src/components` grouped by domain (`pnl`, `journal`, `media`, `errors`, `content`; `layout`, `journal`, `analytics`, `marketing`). Moves and import rewrites only, no logic changes.

- **MetaTrader import hardening**: MT4 statements; shared DOM-free parser in `supabase/functions/_shared/mt/` (works in an Edge Function); coded errors for translated terminals and reports without Positions.
- **Atomic import**: new `import_mt_report` database function (one transaction, updates late commission/swap, never overwrites notes or the trader's stops); `sync_jobs` records inserted/updated/deposit counts.
- Explicit grants for `sync_jobs`, `trade_pnl_audit` and `rate_observations`; pgTAP test and `pnpm db:test`; CI runs database tests.

## 2026-10-29

- Added path aliases `@engine` and `@shared`, grouped the import modules under `src/lib/import/`.
- Added CI (typecheck, lint, tests, build), the `typecheck`, `lint` and `check` scripts, and oxlint.
- Added `docs/ARCHITECTURE.md`; moved the staged patch files to `docs/patches/`.

## 2026-10-28

- **Execution legs**: fills are grouped into positions (scale-in, partial exits, flips); `trade_executions` table; Executions tab in the trade drawer; CSV mode "each row is a single fill".
- **CSV import**: header-row detection, column suggestions, proper CSV parsing.
- **Prop challenge tracking**: profit target, static/EOD/intraday trailing drawdown, daily loss, minimum days, consistency.
- **MetaTrader 5 report import** (HTML and Excel), optional deposits and withdrawals, idempotent by position ticket.
- **P&L engine**: opt-in `apply` writes planned risk to imported trades; automatic audit after an MT5 import.

## Before

Landing and marketing pages, auth, the exact-decimal P&L engine in audit mode, and the journal, analytics, Chart Lab, Strategy Lab and reports pages. The staged patches in `docs/patches/` record that history.
