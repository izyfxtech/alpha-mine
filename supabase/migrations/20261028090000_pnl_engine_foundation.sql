-- P&L engine foundation. Additive only: no existing column, trigger or row is changed.

-- 1. What the engine needs to know about an instrument. All nullable: missing values are inferred.
alter table public.instruments
  add column if not exists contract_size numeric check (contract_size > 0),
  add column if not exists digits int check (digits between 0 and 8),
  add column if not exists profit_currency text check (profit_currency ~ '^[A-Z0-9]{2,10}$'),
  add column if not exists kind text check (kind in ('fx', 'metal', 'crypto', 'index', 'cfd'));

-- 2. How `trades.quantity` is expressed. NULL means unknown, and the engine skips such trades
--    instead of guessing (lots read as units would be wrong by a factor of 100,000).
alter table public.journals
  add column if not exists quantity_unit text check (quantity_unit in ('lots', 'units'));
-- Journals linked to a MetaTrader account hold platform volumes, which are lots.
update public.journals set quantity_unit = 'lots' where mt_login is not null and quantity_unit is null;

-- 3. Rates the engine used. Global market data, append only: readable by signed in users,
--    written only by the Edge Function (service role bypasses RLS, so no write policy exists).
create table if not exists public.rate_observations (
  id bigserial primary key,
  base text not null check (base ~ '^[A-Z0-9]{2,10}$'),
  quote text not null check (quote ~ '^[A-Z0-9]{2,10}$'),
  rate numeric(38, 18) not null check (rate > 0),
  observed_at timestamptz not null,
  source text not null,
  kind text not null check (kind in ('implied', 'tick', 'minute', 'daily-fix', 'derived')),
  side text not null,
  lineage bigint[]
);
create unique index if not exists rate_observations_key_uidx
  on public.rate_observations (base, quote, source, kind, side, observed_at);
alter table public.rate_observations enable row level security;
drop policy if exists "signed in users read rates" on public.rate_observations;
create policy "signed in users read rates" on public.rate_observations for select to authenticated using (true);

-- 4. One row per trade per engine version: what the engine computed next to what was stored before.
--    prev_* lets any applied change be rolled back exactly.
create table if not exists public.trade_pnl_audit (
  id bigserial primary key,
  trade_id uuid not null references public.trades(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  engine_version text not null,
  status text not null check (status in ('computed', 'skipped', 'error')),
  skip_reason text,
  prev_gross_pnl numeric,
  prev_net_pnl numeric,
  prev_fees numeric,
  prev_risk_amount numeric,
  gross_account numeric,
  net_account numeric,
  planned_risk numeric,
  r_multiple numeric,
  conversion_rate_id bigint references public.rate_observations(id),
  open_conversion_rate_id bigint references public.rate_observations(id),
  gross_source text,
  recon_status text check (recon_status in ('OK', 'WARN', 'MISMATCH')),
  recon_diagnosis text[],
  warnings text[],
  applied boolean not null default false,
  applied_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (trade_id, engine_version)
);
create index if not exists trade_pnl_audit_journal_idx on public.trade_pnl_audit (journal_id, status);
alter table public.trade_pnl_audit enable row level security;
drop policy if exists "owners read own pnl audit" on public.trade_pnl_audit;
create policy "owners read own pnl audit" on public.trade_pnl_audit for select to authenticated
  using (exists (select 1 from public.journals j where j.id = trade_pnl_audit.journal_id and j.owner_id = auth.uid()));
