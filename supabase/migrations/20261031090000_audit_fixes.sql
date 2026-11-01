-- Audit fixes (AlphaMine forensic audit, commit bb02502). Additive and safe to re-run.
--   AM-H02/H03/L01  trades_compute_pnl: typed P&L is kept, lots are never treated as units, risk is never wiped
--   AM-H08          share links die when sharing is switched off (trigger) and the public RPC checks the setting
--   AM-H07          merge_trades(): atomic server-side merge, merged tickets are remembered so re-import skips them
--   AM-M13/M15      import_mt_report: account guard, no zero-profit trades, absent costs left unchanged
--   AM-M18/M19/M20  cascading owner foreign keys, storage clean-up QUEUE (swept through the Storage API), CHECK constraints (NOT VALID: see notes)
--   AM-L09/L10      missing grant and foreign-key indexes

-- ---------------------------------------------------------------------------------------------------------------
-- Trade trigger
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.trades_compute_pnl() returns trigger language plpgsql set search_path = public as $$
declare auto boolean; unit text;
begin
  select j.auto_pnl, j.quantity_unit into auto, unit from public.journals j where j.id = new.journal_id;
  if new.is_break_even then
    new.gross_pnl := coalesce(new.gross_pnl, 0);
  -- (exit - entry) * quantity is only money for spot trades whose journal states that quantity is in UNITS. A typed,
  -- imported or file-supplied P&L (pnl_manual) is never replaced; lots, and a journal whose unit is not set yet, are
  -- never multiplied as if they were units.
  elsif new.exit_price is not null and coalesce(auto, true) and not new.pnl_manual
        and unit = 'units' and lower(new.trade_type) = 'spot' then
    new.gross_pnl := round(((new.exit_price - new.entry_price) * new.quantity * case when new.direction = 'short' then -1 else 1 end)::numeric, 2);
  end if;
  new.gross_pnl := coalesce(new.gross_pnl, 0);
  new.fees := coalesce(new.fees, 0);
  new.net_pnl := new.gross_pnl - new.fees;

  if new.stop_loss is null then
    -- A risk figure derived from a stop that no longer exists is stale.
    if tg_op = 'UPDATE' and old.stop_loss is not null then new.risk_amount := null; end if;
  elsif tg_op = 'UPDATE' and new.risk_amount is null and old.risk_amount is not null
        and new.stop_loss is not distinct from old.stop_loss and new.entry_price is not distinct from old.entry_price
        and new.quantity is not distinct from old.quantity then
    -- A client that sends null for a column it does not own must not wipe a stored value (the engine owns the
    -- risk of imported trades).
    new.risk_amount := old.risk_amount;
  elsif new.source = 'manual' and unit = 'units' and (
          (tg_op = 'INSERT' and new.risk_amount is null)
       or (tg_op = 'UPDATE' and (new.stop_loss is distinct from old.stop_loss or new.entry_price is distinct from old.entry_price or new.quantity is distinct from old.quantity)
           and (new.risk_amount is null or new.risk_amount is not distinct from old.risk_amount))) then
    new.risk_amount := abs(new.entry_price - new.stop_loss) * new.quantity;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Sharing (AM-H08)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.shared_journal(_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', j.name, 'currency', j.currency, 'starting_balance', j.starting_balance,
    'trades', coalesce((select jsonb_agg(jsonb_build_object('entry_at', t.entry_at, 'net_pnl', t.net_pnl, 'direction', t.direction,
        'instrument', i.symbol, 'setup', s.name) order by t.entry_at)
      from public.trades t left join public.instruments i on i.id = t.instrument_id left join public.setups s on s.id = t.setup_id
      where t.journal_id = j.id and t.exit_price is not null), '[]'::jsonb))
  from public.journals j
  left join public.profiles p on p.id = j.owner_id
  where _token is not null and j.share_token = _token
    and (p.settings -> 'allowSharing') is distinct from 'false'::jsonb
$$;
revoke all on function public.shared_journal(uuid) from public;
grant execute on function public.shared_journal(uuid) to anon, authenticated;

create or replace function public.revoke_shares_when_sharing_off() returns trigger language plpgsql set search_path = public as $$
begin
  if (new.settings -> 'allowSharing') = 'false'::jsonb and (old.settings -> 'allowSharing') is distinct from 'false'::jsonb then
    update public.journals set share_token = null where owner_id = new.id and share_token is not null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_revoke_shares on public.profiles;
create trigger profiles_revoke_shares after update of settings on public.profiles
  for each row execute function public.revoke_shares_when_sharing_off();

-- ---------------------------------------------------------------------------------------------------------------
-- Merge trades (AM-H07)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.merged_trade_ids (
  journal_id uuid not null references public.journals(id) on delete cascade,
  external_id text not null,
  merged_into uuid not null references public.trades(id) on delete cascade,
  primary key (journal_id, external_id)
);
alter table public.merged_trade_ids enable row level security;
drop policy if exists "owner reads merged ids" on public.merged_trade_ids;
create policy "owner reads merged ids" on public.merged_trade_ids for select using (public.owns_journal(journal_id));
grant select on public.merged_trade_ids to authenticated;
grant all on public.merged_trade_ids to service_role;

create or replace function public.merge_trades(_ids uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rows public.trades[];
  k public.trades;
  v_journal uuid;
  v_journals uuid[];
  v_qty numeric; v_entry numeric; v_exit numeric; v_risk numeric;
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  select array_agg(distinct x) into v_ids from unnest(_ids) x;
  if v_ids is null or cardinality(v_ids) < 2 then raise exception 'Select at least two trades to merge.'; end if;

  -- Ownership first (this function runs with the owner's rights), then lock in id order, then read: reading before
  -- locking would let two merges of overlapping trades both work from stale rows.
  select array_agg(distinct t.journal_id) into v_journals from public.trades t where t.id = any (v_ids);
  if v_journals is null then raise exception 'One or more trades were not found.'; end if;
  if cardinality(v_journals) <> 1 then raise exception 'Trades from different journals cannot be merged.'; end if;
  v_journal := v_journals[1];
  if not public.owns_journal(v_journal) then raise exception 'You do not have access to this journal.' using errcode = '42501'; end if;
  perform 1 from public.trades where id = any (v_ids) order by id for update;
  select array_agg(t order by t.entry_at, t.id) into rows from public.trades t where t.id = any (v_ids);
  if rows is null or cardinality(rows) <> cardinality(v_ids) then raise exception 'One or more trades were not found.'; end if;
  if exists (select 1 from unnest(rows) r where r.exit_price is null or r.exit_at is null) then raise exception 'Close open trades before merging them.'; end if;
  if (select count(distinct r.direction) from unnest(rows) r) > 1 then raise exception 'Trades in opposite directions cannot be merged.'; end if;

  k := rows[1];
  select sum(r.quantity), sum(r.entry_price * r.quantity) / nullif(sum(r.quantity), 0), sum(r.exit_price * r.quantity) / nullif(sum(r.quantity), 0)
    into v_qty, v_entry, v_exit from unnest(rows) r;
  select case when bool_and(r.risk_amount is not null) then sum(r.risk_amount) end into v_risk from unnest(rows) r;

  update public.trades set
    entry_at = (select min(r.entry_at) from unnest(rows) r),
    exit_at = (select max(r.exit_at) from unnest(rows) r),
    quantity = v_qty, entry_price = v_entry, exit_price = v_exit,
    gross_pnl = (select sum(r.gross_pnl) from unnest(rows) r),
    fees = (select sum(r.fees) from unnest(rows) r),
    commission = (select sum(r.commission) from unnest(rows) r),
    swap = (select sum(r.swap) from unnest(rows) r),
    risk_amount = v_risk,
    notes = nullif((select string_agg(r.notes, E'\n\n' order by r.entry_at, r.id) from unnest(rows) r where nullif(btrim(r.notes), '') is not null), ''),
    is_favorite = (select bool_or(r.is_favorite) from unnest(rows) r),
    pnl_manual = true
  where id = k.id;

  -- Imported tickets that are merged away must not come back on the next import.
  insert into public.merged_trade_ids (journal_id, external_id, merged_into)
  select v_journal, r.external_id, k.id from unnest(rows) r where r.external_id is not null and r.id <> k.id
  on conflict (journal_id, external_id) do nothing;

  -- Children of the merged trades move to the surviving trade instead of being cascaded away.
  update public.trade_comments c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_comments x where x.trade_id = k.id and x.comment_definition_id = c.comment_definition_id);
  update public.trade_custom_stats c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_custom_stats x where x.trade_id = k.id and x.option_id = c.option_id);
  update public.trade_rule_checks c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_rule_checks x where x.trade_id = k.id and x.rule_id = c.rule_id);
  update public.trade_executions set trade_id = k.id where trade_id = any (v_ids) and trade_id <> k.id;
  -- A trade holds at most 6 screenshots (the cap trigger only checks inserts, so enforce it here).
  update public.trade_screenshots s set trade_id = k.id
  where s.id in (
    select id from (
      select id, row_number() over (order by created_at, id) as rn from public.trade_screenshots where trade_id = any (v_ids) and trade_id <> k.id
    ) q where q.rn <= greatest(6 - (select count(*) from public.trade_screenshots where trade_id = k.id), 0));

  delete from public.trades where id = any (v_ids) and id <> k.id;
  return k.id;
end $$;
revoke execute on function public.merge_trades(uuid[]) from public, anon;
grant execute on function public.merge_trades(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Database integrity (AM-M18, M19, M20, L09, L10)
-- NOT VALID: existing rows are not checked (so the migration cannot fail on legacy data) but every new or updated
-- row is. After auditing existing data run, for each constraint:  alter table <t> validate constraint <name>;
-- ---------------------------------------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journals_owner_fk') then
    alter table public.journals add constraint journals_owner_fk foreign key (owner_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_user_fk') then
    alter table public.profiles add constraint profiles_user_fk foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_quantity_positive') then
    alter table public.trades add constraint trades_quantity_positive check (quantity > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_entry_price_positive') then
    alter table public.trades add constraint trades_entry_price_positive check (entry_price > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_exit_price_positive') then
    alter table public.trades add constraint trades_exit_price_positive check (exit_price is null or exit_price > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_exit_after_entry') then
    alter table public.trades add constraint trades_exit_after_entry check (exit_at is null or exit_at >= entry_at) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journals_starting_balance_nonneg') then
    alter table public.journals add constraint journals_starting_balance_nonneg check (starting_balance >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journals_currency_code') then
    alter table public.journals add constraint journals_currency_code check (currency ~ '^[A-Za-z]{3}$') not valid;
  end if;
end $$;

-- Screenshot files (AM-M19). Supabase refuses a direct DELETE on storage.objects (and even where it ran, the file would
-- stay in the storage backend), so the database only QUEUES the path when a screenshot row disappears, whatever removed
-- it (a trade, a merge, a journal or an account). The sweep-storage Edge Function empties the queue through the Storage
-- API. Rows are never lost: a path stays queued until the API has removed it.
create table if not exists public.storage_cleanup (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  queued_at timestamptz not null default now(),
  unique (bucket, path)
);
alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from public, anon, authenticated;
grant all on public.storage_cleanup to service_role;

create or replace function public.queue_screenshot_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.path is not null and old.path !~* '^https?:' then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path) on conflict do nothing;
  end if;
  return old;
end $$;
revoke execute on function public.queue_screenshot_file() from public, anon, authenticated;
drop trigger if exists trade_screenshots_delete_file on public.trade_screenshots;
drop trigger if exists trade_screenshots_queue_file on public.trade_screenshots;
create trigger trade_screenshots_queue_file after delete on public.trade_screenshots for each row execute function public.queue_screenshot_file();
drop function if exists public.trade_screenshot_delete_file();

-- A journal's quantity unit is the one thing the P&L and risk formulas depend on (AM-M09, AM-H01, AM-H03). When a
-- manual journal is switched to 'units', trades that have a stop but no stored risk get it now. Money is untouched.
create or replace function public.journals_backfill_risk() returns trigger language plpgsql set search_path = public as $$
begin
  if new.quantity_unit = 'units' and old.quantity_unit is distinct from 'units' then
    update public.trades t set risk_amount = abs(t.entry_price - t.stop_loss) * t.quantity
    where t.journal_id = new.id and t.source = 'manual' and t.risk_amount is null and t.stop_loss is not null and t.stop_loss <> t.entry_price;
  end if;
  return new;
end $$;
drop trigger if exists journals_backfill_risk on public.journals;
create trigger journals_backfill_risk after update of quantity_unit on public.journals
  for each row execute function public.journals_backfill_risk();

grant all on public.planned_trade_custom_stats to service_role;

create index if not exists trade_comments_journal_idx on public.trade_comments (journal_id);
create index if not exists trade_custom_stats_journal_idx on public.trade_custom_stats (journal_id);
create index if not exists trade_custom_stats_option_idx on public.trade_custom_stats (option_id);
create index if not exists trade_screenshots_trade_idx on public.trade_screenshots (trade_id);
create index if not exists trade_screenshots_journal_idx on public.trade_screenshots (journal_id);
create index if not exists trades_instrument_idx on public.trades (instrument_id);
create index if not exists trades_setup_idx on public.trades (setup_id);
create index if not exists trade_executions_trade_idx on public.trade_executions (trade_id);
create index if not exists trade_rule_checks_journal_idx on public.trade_rule_checks (journal_id);

-- ---------------------------------------------------------------------------------------------------------------
-- import_mt_report (AM-M13, M15) with merged tickets honoured (AM-H07)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.import_mt_report(_journal_id uuid, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.journals%rowtype;
  v_platform text := _payload ->> 'platform';
  v_login text := nullif(_payload #>> '{account,login}', '');
  v_server text := nullif(_payload #>> '{account,server}', '');
  v_currency text := upper(nullif(_payload #>> '{account,currency}', ''));
  v_total int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_cash int := 0;
  v_changed uuid[] := '{}';
begin
  -- Runs with the owner's rights so it can write sync_jobs, so ownership is checked here, explicitly.
  if auth.uid() is null or not public.owns_journal(_journal_id) then
    raise exception 'You do not have access to this journal.' using errcode = '42501';
  end if;
  if v_platform is null or v_platform not in ('mt4', 'mt5') then
    raise exception 'Unknown MetaTrader platform.';
  end if;
  if jsonb_typeof(_payload -> 'positions') is distinct from 'array' then
    raise exception 'The import has no trades array.';
  end if;
  if jsonb_array_length(_payload -> 'positions') > 20000 then
    raise exception 'Too many trades in one import (limit 20000). Export a shorter date range.';
  end if;

  if exists (select 1 from jsonb_array_elements(_payload -> 'positions') e
             where e ->> 'external_id' is not null and nullif(e ->> 'gross_pnl', '') is null) then
    raise exception 'One or more trades in this import have no profit value. Nothing was imported.';
  end if;

  -- Serialises concurrent imports into the same journal.
  select * into j from public.journals where id = _journal_id for update;

  if v_login is null and j.mt_login is not null then
    raise exception 'This report has no account number, but this journal is linked to account %. Import it into a journal that is not linked to an account.', j.mt_login;
  end if;
  if j.mt_platform is not null and j.mt_platform <> v_platform then
    raise exception 'This is an % report, but this journal is linked to an % account.', upper(v_platform), upper(j.mt_platform);
  end if;
  if j.mt_login is not null and v_login is not null and j.mt_login <> v_login then
    raise exception 'This report is for account %, but this journal is linked to account %.', v_login, j.mt_login;
  end if;
  if v_currency is not null and upper(j.currency) <> v_currency then
    raise exception 'This report is in %, but the journal currency is %.', v_currency, upper(j.currency);
  end if;

  -- Link the journal to the account on first import. Volumes from MetaTrader are lots, which the P&L engine needs to know.
  if j.mt_login is null and v_login is not null then
    -- The unique index cannot catch this when the server is unknown (MT4 statements carry none: NULLs never collide).
    if exists (select 1 from public.journals o where o.owner_id = j.owner_id and o.id <> j.id and o.mt_platform = v_platform and o.mt_login = v_login and o.mt_server is not distinct from v_server) then
      raise exception 'This MetaTrader account is already linked to another journal.';
    end if;
    begin
      update public.journals set mt_platform = v_platform, mt_server = v_server, mt_login = v_login where id = _journal_id;
    exception when unique_violation then
      raise exception 'This MetaTrader account is already linked to another journal.';
    end;
  end if;
  update public.journals set quantity_unit = 'lots' where id = _journal_id and quantity_unit is distinct from 'lots';

  -- Instruments: create the missing ones with the digits the terminal printed, fill digits where still unknown.
  insert into public.instruments (journal_id, symbol, digits)
  select _journal_id, s.symbol, s.digits
  from jsonb_to_recordset(coalesce(_payload -> 'instruments', '[]'::jsonb)) as s(symbol text, digits int)
  where s.symbol is not null and s.symbol <> ''
  on conflict (journal_id, symbol) do update set digits = excluded.digits
  where public.instruments.digits is null and excluded.digits is not null;

  -- Trades.
  select count(distinct e ->> 'external_id') into v_total
  from jsonb_array_elements(_payload -> 'positions') e
  where e ->> 'external_id' is not null;

  with src as (
    select distinct on (p.external_id) p.*
    from jsonb_to_recordset(_payload -> 'positions') as p(
      external_id text, raw_symbol text, direction text, entry_at timestamptz, exit_at timestamptz,
      entry_price numeric, exit_price numeric, quantity numeric, stop_loss numeric, take_profit numeric,
      gross_pnl numeric, commission numeric, swap numeric)
    where p.external_id is not null
      and not exists (select 1 from public.merged_trade_ids m where m.journal_id = _journal_id and m.external_id = p.external_id)
    order by p.external_id
  ), up as (
    insert into public.trades as t (
      journal_id, instrument_id, direction, entry_at, exit_at, entry_price, exit_price, quantity,
      stop_loss, take_profit, gross_pnl, fees, commission, swap, pnl_manual, source, external_id, raw_symbol)
    select
      _journal_id, i.id, s.direction, s.entry_at, s.exit_at, s.entry_price, s.exit_price, s.quantity,
      s.stop_loss, s.take_profit, s.gross_pnl,
      round(-(coalesce(s.commission, 0) + coalesce(s.swap, 0)), 8), s.commission, s.swap,
      true, v_platform, s.external_id, s.raw_symbol
    from src s
    left join public.instruments i on i.journal_id = _journal_id and i.symbol = s.raw_symbol
    on conflict (journal_id, external_id) do update set
      gross_pnl = excluded.gross_pnl,
      fees = round(-(coalesce(coalesce(excluded.commission, t.commission), 0) + coalesce(coalesce(excluded.swap, t.swap), 0)), 8),
      commission = coalesce(excluded.commission, t.commission),
      swap = coalesce(excluded.swap, t.swap),
      stop_loss = coalesce(t.stop_loss, excluded.stop_loss),
      take_profit = coalesce(t.take_profit, excluded.take_profit),
      instrument_id = coalesce(t.instrument_id, excluded.instrument_id)
    where not exists (select 1 from public.merged_trade_ids m where m.journal_id = t.journal_id and m.merged_into = t.id)
      and ((t.gross_pnl, t.fees, t.commission, t.swap) is distinct from
           (excluded.gross_pnl, round(-(coalesce(coalesce(excluded.commission, t.commission), 0) + coalesce(coalesce(excluded.swap, t.swap), 0)), 8), coalesce(excluded.commission, t.commission), coalesce(excluded.swap, t.swap))
       or (t.stop_loss is null and excluded.stop_loss is not null)
       or (t.take_profit is null and excluded.take_profit is not null)
       or (t.instrument_id is null and excluded.instrument_id is not null))
    returning t.id, (t.xmax = 0) as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted),
    coalesce(array_agg(id) filter (where not inserted), '{}')
  into v_inserted, v_updated, v_changed
  from up;

  -- A changed trade's earlier audit no longer describes it. Drop the audit rows that were never applied so the
  -- next compute-pnl run re-checks them. Applied rows keep their rollback data.
  if cardinality(v_changed) > 0 then
    delete from public.trade_pnl_audit where trade_id = any (v_changed) and not applied;
  end if;

  -- Deposits and withdrawals (optional, idempotent on the terminal's deal/ticket number).
  with cf as (
    select distinct on (c.external_id) c.*
    from jsonb_to_recordset(coalesce(_payload -> 'cashflows', '[]'::jsonb)) as c(external_id text, occurred_on date, amount numeric, note text)
    where c.external_id is not null and c.amount is not null and c.amount <> 0 and c.occurred_on is not null
    order by c.external_id
  ), ins as (
    insert into public.journal_cashflows (journal_id, occurred_on, amount, note, external_id)
    select _journal_id, c.occurred_on, c.amount, c.note, c.external_id from cf c
    on conflict (journal_id, external_id) do nothing
    returning 1
  )
  select count(*) into v_cash from ins;

  insert into public.sync_jobs (user_id, platform, mode, status, attempts, trades_imported, trades_updated, cashflows_imported, journal_id, started_at, finished_at)
  values (auth.uid(), v_platform, 'file_import', 'succeeded', 1, v_inserted, v_updated, v_cash, _journal_id, now(), now());

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', greatest(v_total - v_inserted - v_updated, 0),
    'cashflows', v_cash
  );
end
$$;

revoke execute on function public.import_mt_report(uuid, jsonb) from public, anon;
grant execute on function public.import_mt_report(uuid, jsonb) to authenticated;
