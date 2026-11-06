# Changelog

Newest first. Dates are the day the work landed on `main`.

## 2026-11-06 (onboarding)

- **Setup guide**: the journal step no longer asks again for what you entered when you created the journal. It shows the journal for confirmation ("Looks right"), asks only what creation does not (what you trade), and keeps "Change journal details" for edits. The untouched default journal still shows the form.
- **Quick tour**: the last step is now a six-card tour (Journal, Analytics and Chart Lab, Rules and Plans, Diary, Reports, Strategy Lab), each with a shortcut to the page.
- **Getting started checklist** on Home: add trades, write rules, plan a trade, record a session. Steps tick themselves from your real data, and the checklist can be hidden. No migration.

## 2026-11-06 (compare charts, audit rest)

- **Compare Charts**: the two sides now default to Long vs Short (not All vs Long, which looked like one line); a pick that disappears after a filter or journal change falls back to a group that has trades instead of drawing an empty line; both lines start from 0 and use straight segments (the smoothing made curves overshoot); an empty group shows a message; identical groups show a note; the legend colour matches the line; group statistics no longer include account deposits and withdrawals.
- **Plans**: Duplicate keeps custom-statistic tags, and Move to Journal carries them into the trade form (L35).
- **Missed trades**: Return (%) uses the same base as Home (starting balance plus deposits less withdrawals).
- **Analytics**: Avg. Qty, MAE and MFE are blank on rows that mix instruments (different units); the Ordering list has Move up / Move down buttons, usable from the keyboard (L29, L39).
- **Efficiency / "Followed Trade Plan"**: only commented trades are judged, so uncommented trades no longer count as followed. Applies to Home, Portfolio, Monthly report, Chart Lab and Edge Finder.

## 2026-11-06 (your data)

- Settings, Account: **Download all data (JSON)** (every table you own, one file), **Download trades (CSV)**, and **Delete my account**, which asks you to type "delete my account", removes your screenshot files, journals and sign-in, and cannot be undone. New migration `20261106100000_delete_my_account.sql` (run `pnpm db:push`); covered by a pgTAP test and a guard test that fails if a new table is not in the export.

## 2026-11-04 (failed saves)

## 2026-11-06 (merge modes, screenshots)

- **Merge trades** asks whether the trades are parts of one position (sizes and P&L added) or the same trade logged twice (one set of numbers kept, notes, screenshots, comments, tags and rule checks carried over). Also fills a survivor's empty setup, plan, stops and target from the others, repoints earlier merge records so a re-import cannot bring old tickets back, and sets break-even only when every part was. Migration `20261105090000_merge_modes.sql`.
- **Screenshots: up to 10** per trade, missed trade and plan (was 6; the database now caps missed trades and plans as well). Migration `20261106090000_screenshot_limit.sql`.
- **Fewer downloads.** Signed URLs are cached and reused for 50 minutes, so a refetch no longer gives every image a new address and the browser keeps its cached copy; the list no longer refetches on window focus; uploads carry a one-year cache header. Galleries, cards, the Chart Book and the trade form load a 640 px preview (about 15 KB) and only the viewer loads the full image; older screenshots without a preview fall back to the full image.
- **Smaller uploads.** Every upload (trade form, Screenshots tab, missed trades, plans, Chart Book) now goes through one pipeline: longest side 1920 px, WebP at 0.82, kept as-is if already under 300 KB. The Screenshots tab, missed trades and plans used to upload the raw file.
- **Links.** A pasted image link must load as an image before it is added (no more silent broken thumbnails); TradingView share links (`tradingview.com/x/...`) are turned into their picture; link images are loaded lazily and send no referrer. A deleted screenshot now also queues its preview file for removal.

- Audit remainder: Lightbox now takes focus, traps Tab and restores focus (L29); date-range day cells have labels (L29); the gallery Win/Loss filter excludes break-even like every other page (L37); renaming a session category stops if any session update fails instead of leaving a ghost category (L30); the Strategy Lab copy no longer claims the simulator runs on your trade history (L40).
- Chart Lab, Ratios: added MAR, Sterling, Burke and K-ratio (running per trade), each pinned to a hand calculation in tests; formulas listed in docs/CALCULATIONS.md. Treynor and Information ratio need a market benchmark and are not offered.

## 2026-11-05 (metrics review)

- **Portfolio vs Home**: with one journal the Portfolio headline cards are now that journal's own statistics, identical to Home's (before, they were recomputed on a per-trade % or R series, so profit factor, average win/loss, drawdown, score and, in R mode, win rate all differed). With several journals the cards use the % or R series, which now leaves out trades that have no R or no balance instead of counting them as 0 (a missing R made a win look like break-even). A note on the page says it ignores the top-bar filters, which Home applies.
- **One Return (%)**: the headline return on Home and Portfolio cards, the Home per-day figure and the Trade Analytics Return (%) column are now the journal's ROI (net over starting balance plus deposits), the figure Portfolio's table, Equity and Reports already used. Before, the cards summed each trade's own % of its running balance (3.38%) while the table showed ROI (3.39%). Per-trade averages still average each trade's own %. Chart Lab's Return (%) divides by the starting balance only, so it differs from ROI only when deposits or withdrawals exist.
- Formula review: win rate, profit factor, average win/loss, expectancy, ROI, balance, max drawdown and Sortino re-derived by hand and pinned in a test; no formula errors found.
- **L35**: Missed and Plans forms disable Save while the Entry Date is empty or invalid (it used to throw silently). **I13**: stray Windows `desktop.ini` removed. L36 and the CI time-zone matrix (I10) were already in place.

- **M03**: re-checked. Every user-visible day, week and month already goes through the local-time helpers (earlier batches); the last UTC slices (Portfolio curve labels, the Settings deposit-date fallback) now use `localDay`. Added a midnight-crossing test; the suite passes in UTC, Lagos, New York and Auckland.

- **L24**: screenshot preview object URLs are released when a pending screenshot is removed or the drawer resets. **L38**: a Chart Book upload whose database insert fails removes the stored file instead of orphaning it.

- **L32**: the onboarding guide waits for the trade count and no longer opens when the count is loading or fails to load, so it cannot flash for existing users or stay open after a query error. **L41**: the error-capture module and generated Supabase client are platform scaffolding, left unchanged.

- **L27**: Monthly week grouping and the Annual grid follow the first-day-of-week setting. **L33**: the placeholder Home newsfeed (dated 2025, dead links, an author not on the About page) is removed. **L34**: Missed Trades Analysis compares missed trades with all real trades (top-bar filters no longer skew Missed vs Real) and uses the shared planned-RRR calc.

- **M29**: contact address set (privacy and terms pages show it). **L29**: trade-form fields and selects have accessible names; the filter clear button is a focusable button. **L43**: images pasted into a text field stay there; screenshot links must be https; skipped non-image files are reported. **L38**: Chart Book delete asks first and is reachable by keyboard. **L37**: Exit Analysis says when it shows only the last 30 trades; its dots follow the theme.

- Reset password (L42): shows an invalid/expired-link message when there is no recovery session. Marketing copy says seventeen charts (L40). L35 (empty Entry Date) was already validated.

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
