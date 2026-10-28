-- Execution legs behind a trade: scale-in entries and partial exits. Additive; trades without legs behave as before.
-- A trade row stays the summary (weighted entry/exit, total size, total costs); legs are the detail.
create table if not exists public.trade_executions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  kind text not null check (kind in ('entry', 'exit')),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  executed_at timestamptz not null,
  commission numeric not null default 0,
  swap numeric not null default 0,
  fee numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trade_executions_trade_idx on public.trade_executions (trade_id, executed_at);
create index if not exists trade_executions_journal_idx on public.trade_executions (journal_id);
grant select, insert, update, delete on public.trade_executions to authenticated;
grant all on public.trade_executions to service_role;
alter table public.trade_executions enable row level security;
drop policy if exists "journal owner" on public.trade_executions;
create policy "journal owner" on public.trade_executions for all to authenticated
  using (public.owns_journal(journal_id)) with check (public.owns_journal(journal_id));
