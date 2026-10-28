-- Idempotent import of MetaTrader balance operations (deposits/withdrawals). Additive and safe to re-run.
-- Manual cashflows keep external_id NULL; NULLs never conflict, so they are unaffected.
alter table public.journal_cashflows add column if not exists external_id text;
drop index if exists public.journal_cashflows_external_uidx;
create unique index journal_cashflows_external_uidx on public.journal_cashflows (journal_id, external_id);
