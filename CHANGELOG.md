# Changelog

Newest first. Dates are the day the work landed on `main`.

## 2026-11-04 (failed saves)

- Notebook (L26): an edit is kept until the save succeeds, with a Saved / Saving / Not saved indicator; saves on tab hide and close (with a leave warning if unsaved); renaming a folder moves notes first so no ghost folder remains, and asks before merging into an existing name.

- **L25**: a failed save no longer loses work. Backtester and Sessions keep the sheet open when the save fails; Alternatives, Missed and Plans stop on a failed update. Tags, comments and rule checks on trades, missed trades, plans and alternative results are synced (add what is missing, then remove what is gone) instead of delete-then-insert, so a failure part-way never wipes them. Plan to Missed removes the new missed row if its tags fail, so a retry cannot duplicate it.
- **L30**: a failing "delete journal" shows an error and keeps the dialog; saving a profile before it has loaded no longer throws; sign-up and reset now require 8 characters like Settings. **L44**: a failed lookups fetch shows an error instead of empty pickers.

## 2026-11-04 (audit Lows)

- L31: one `safe-storage` helper replaces nine unguarded `localStorage` uses (private windows no longer throw). L28: rich-text notes are sanitised on load (allow-list; no scripts, handlers or `javascript:` URLs) and the Link/Image prompts accept only http, https and mailto. L24: decoded image bitmaps are closed after compression. L23: ten quadratic grouping sites use `pushTo`. L36/L39: "By Name" sorts naturally (Week 3 before Week 12) and weekdays/months sort in calendar order. L22: the AM score no longer rewards ten wins with no drawdown, and the Equity page shows Return (%) to two decimals instead of rounding to a whole number.

## 2026-11-04

- **Portfolio now agrees with Home** for the same journal: open trades are no longer counted as results, and average R is taken over trades that have an R (it was divided by every trade). Portfolio still ignores the top-bar filters, because it compares journals.
- **Adding an instrument or setup from the trade form** no longer fails when the name already exists in another case or was retired (hidden from the picker): the existing one is reused (and brought back). Errors now say which name could not be added.
- Open Trades removed from the sidebar (the page is still reachable at `/open-trades`).

## 2026-11-03

- **Audit Mediums.** H09: the Alternative Strategies sheet no longer crashes for a setup with trades (`val` used before it was defined). M26: the calendar's padding week uses `addDays`, so a DST change cannot make a 48-day grid. M31: writing to any journal table refetches only what it can change; a notebook autosave no longer reloads the whole trade history. M25: one currency list (47 codes, incl. KES, GHS, BRL, MXN, SGD, AED) and a `safeCurrency` formatter that never throws on a bad code. M28: the public share RPC returns totals over every trade but at most the 2,000 most recent rows (migration `20261104110000_share_cap.sql`); the share page tells a load error from a missing link. M27: Holding Time chart leaves out trades with no R.
- **MetaTrader imports are no longer blocked** when the report's account, platform or currency differs from the journal, or the account is linked to another journal. A confirmation lists the risks; "Import anyway" passes `_force` to `import_mt_report` (migration `20261104100000_import_override.sql`), skips the guards and the account link, and prefixes ticket numbers with the account so they cannot overwrite the journal's own.

- **Initial stop.** `trades.initial_stop` is the stop a trade was opened with; it is set automatically the first time a valid stop is saved and never changed by later edits, so a stop trailed to break-even or into profit no longer blanks R. R uses it (falling back to the current stop). Migration `20261104090000_initial_stop.sql` adds the column, backfills it from stops still on the losing side, and updates `import_mt_report`.
- **MT5 import** reads the stop as placed from the report's Orders table (the Positions table only has the last stop) and a lone S/L cell is no longer dropped. Re-importing a report fills `initial_stop` on trades already in the journal.
- **Estimated R**: a closed trade with no measurable R shows "~1.3R est." (net P&L over the journal's median risk, needs 3+ trades with a real stop). Never counted in R statistics. Hover a "—" to see why a trade has no R.

- **Simple calculations.** R-multiple is now a pure price ratio, `(exit - entry) x side / |entry - stop|` (`src/lib/pnl/calc.ts`): same for every instrument, present for every trade with a stop and an exit, no engine or Edge Function involved. Money (gross P&L, money at risk, open-trade what-ifs, missed trades) is price move x quantity x contract size from the instrument's asset class.
- **Instrument catalogue** (`src/lib/pnl/instrument-catalogue.ts`): forex majors/crosses/exotics, metals, crypto, indices, energies, futures, with aliases (GOLD, DJ30, USTEC...) and broker suffixes (.a, m, .pro). Classes: forex, metal, crypto, index, energy, stock, future. Unknown symbols are stocks. Bare futures roots (ES, NG) need a month code or `1!` so they never shadow stock tickers.
- Removed: `risk.ts`, `asset-class.ts`, the engine calls after saving a trade, after imports and from Settings, and the database risk logic (migration `20261103090000_simple_calculations.sql`, which also drops `journals_backfill_risk`). The pnl-engine and `compute-pnl` stay in the repo, unused by these paths.
- Fixed: backtester counted blank cells as break-even; simulator win rate included break-evens while avg loss did not; Chart Lab "Average (R)" divided by trades without an R.
- R is gross of costs (it measures the trade against its stop); net P&L still includes commission, swap and other fees.

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
