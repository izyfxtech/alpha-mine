# Changelog

Newest first. Dates are the day the work landed on `main`.

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
