-- Rule compliance (trading rules + per-trade checks) and saved filters. Additive and safe to re-run.
--
-- trading_rules:    the trader's own rules ("Stop loss set before entry", "Max 1% risk" ...), per journal.
--                   Retired rules are flagged `disabled`, never deleted, so old trades keep their history.
-- trade_rule_checks: one row per (trade, rule): followed / partial / violated. A rule with no row for a trade
--                   means "not rated". The trade-level status is derived in the app, never stored, so it can
--                   not disagree with the checks.
-- saved_filters:    named sets of the top-bar filters, per journal.

create table if not exists public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text,
  position int not null default 0,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (journal_id, name)
);

create table if not exists public.trade_rule_checks (
  trade_id uuid not null references public.trades(id) on delete cascade,
  rule_id uuid not null references public.trading_rules(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  status text not null check (status in ('followed', 'partial', 'violated')),
  primary key (trade_id, rule_id)
);
create index if not exists trade_rule_checks_journal_idx on public.trade_rule_checks (journal_id);
create index if not exists trade_rule_checks_rule_idx on public.trade_rule_checks (rule_id);

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (journal_id, name)
);

alter table public.trading_rules enable row level security;
alter table public.trade_rule_checks enable row level security;
alter table public.saved_filters enable row level security;

drop policy if exists "journal owner" on public.trading_rules;
create policy "journal owner" on public.trading_rules for all to authenticated
  using (public.owns_journal(journal_id)) with check (public.owns_journal(journal_id));

drop policy if exists "journal owner" on public.saved_filters;
create policy "journal owner" on public.saved_filters for all to authenticated
  using (public.owns_journal(journal_id)) with check (public.owns_journal(journal_id));

-- A check must point at a trade and a rule of the SAME journal the caller owns.
drop policy if exists "journal owner" on public.trade_rule_checks;
create policy "journal owner" on public.trade_rule_checks for all to authenticated
  using (public.owns_journal(journal_id))
  with check (
    public.owns_journal(journal_id)
    and exists (select 1 from public.trades t where t.id = trade_id and t.journal_id = trade_rule_checks.journal_id)
    and exists (select 1 from public.trading_rules r where r.id = rule_id and r.journal_id = trade_rule_checks.journal_id)
  );

grant select, insert, update, delete on public.trading_rules, public.trade_rule_checks, public.saved_filters to authenticated;
grant all on public.trading_rules, public.trade_rule_checks, public.saved_filters to service_role;
