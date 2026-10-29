-- Atomic MetaTrader report import. One call = one transaction: instruments, account link, trades, deposits and
-- the job record all land together or not at all. Replaces the browser's five sequential writes.
-- Additive and safe to re-run.
--
-- Re-importing a report is idempotent on (journal_id, external_id) and now also UPDATES what the broker books late:
-- gross profit, commission, swap (and therefore fees and net). It never touches what the user owns: times, prices,
-- size, notes, setups, screenshots. Stop loss / take profit are only filled in when the journal has none, so a
-- planned stop the trader entered is never replaced by the broker's.

alter table public.sync_jobs
  add column if not exists trades_updated int not null default 0,
  add column if not exists cashflows_imported int not null default 0;

-- The table had a row level security policy but no grant, so it was unreadable on projects without default
-- table grants. Users may read their own jobs; only the service role and security definer functions write them.
grant select on public.sync_jobs to authenticated;
grant all on public.sync_jobs to service_role;
-- Same gap in the P&L engine tables: policies exist, grants did not.
grant select on public.trade_pnl_audit, public.rate_observations to authenticated;
grant all on public.trade_pnl_audit, public.rate_observations to service_role;
grant usage, select on all sequences in schema public to service_role;

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

  -- Serialises concurrent imports into the same journal.
  select * into j from public.journals where id = _journal_id for update;

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
    order by p.external_id
  ), up as (
    insert into public.trades as t (
      journal_id, instrument_id, direction, entry_at, exit_at, entry_price, exit_price, quantity,
      stop_loss, take_profit, gross_pnl, fees, commission, swap, pnl_manual, source, external_id, raw_symbol)
    select
      _journal_id, i.id, s.direction, s.entry_at, s.exit_at, s.entry_price, s.exit_price, s.quantity,
      s.stop_loss, s.take_profit, s.gross_pnl,
      round(-(coalesce(s.commission, 0) + coalesce(s.swap, 0)), 8), coalesce(s.commission, 0), coalesce(s.swap, 0),
      true, v_platform, s.external_id, s.raw_symbol
    from src s
    left join public.instruments i on i.journal_id = _journal_id and i.symbol = s.raw_symbol
    on conflict (journal_id, external_id) do update set
      gross_pnl = excluded.gross_pnl,
      fees = excluded.fees,
      commission = excluded.commission,
      swap = excluded.swap,
      stop_loss = coalesce(t.stop_loss, excluded.stop_loss),
      take_profit = coalesce(t.take_profit, excluded.take_profit),
      instrument_id = coalesce(t.instrument_id, excluded.instrument_id)
    where (t.gross_pnl, t.fees, t.commission, t.swap) is distinct from (excluded.gross_pnl, excluded.fees, excluded.commission, excluded.swap)
       or (t.stop_loss is null and excluded.stop_loss is not null)
       or (t.take_profit is null and excluded.take_profit is not null)
       or (t.instrument_id is null and excluded.instrument_id is not null)
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
