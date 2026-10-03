## Architecture rules
- Journal table layout preferences are browser-persisted per journal; this keeps sizing and order responsive without changing trading data.
- Shared chart cards own bounded responsive heights; charts fill their pane instead of defining page height.
- All performance numbers come from `src/lib/metrics.ts` — one engine so every page agrees.
- Simple journal-scoped tables use the `useJournalTable` helper in `src/lib/crud.ts` — keeps CRUD/invalidation consistent.
- Every journal-owned table carries `journal_id` and uses the `owns_journal()` RLS policy — single ownership check.
- Trade P&L (gross/net/risk) is recomputed by a DB trigger from prices — stored numbers can't drift from inputs.
- Trade screenshots live in a private storage bucket under `<user_id>/…` and are shown via signed URLs; rows whose path starts with `http` are external URLs.
- Custom stats are category → option rows linked to trades via `trade_custom_stats` — user-defined tags without schema changes.
- tsconfig has `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/`noImplicitReturns` off — ported code was written without them.
