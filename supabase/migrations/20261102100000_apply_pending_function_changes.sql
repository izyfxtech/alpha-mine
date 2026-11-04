-- Catch-up: database objects that were added to 20261031090000_audit_fixes.sql AFTER that migration had already been applied.
--
-- A migration file runs once per project. Editing it afterwards changes the repository but not a database that has already run
-- it, so these three never reached the hosted project and the app failed with
--   "Could not find the function public.create_journal(...) in the schema cache".
-- The definitions below are copied from that file as it stands now; this migration is the one that actually runs them.
-- Safe to run on a fresh database (where the earlier file already created them) and on one that missed them.
--
--   1. queue_screenshot_file   a file is queued for deletion only when no other row still uses it
--   2. create_journal          one atomic call: journal + default comments, statistics and setups (AM-M04)
--   3. import_mt_report        3-argument form with the "repair" option (AM-M14); the old 2-argument form is dropped
--
-- (trades_compute_pnl and merge_trades are redefined by 20261102090000_core_fixes.sql, which did run, so they are not repeated.)
-- Rule from here on: never edit a migration that has been pushed. Add a new file.

-- 1. -------------------------------------------------------------------------------------------------------------
create or replace function public.queue_screenshot_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A copied journal re-uses the same files, so a path is only queued once NO screenshot row points at it any more.
  if old.path is not null and old.path !~* '^https?:'
     and not exists (select 1 from public.trade_screenshots s where s.path = old.path) then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path) on conflict do nothing;
  end if;
  return old;
end $$;

-- 2. -------------------------------------------------------------------------------------------------------------
-- One atomic call creates a journal and its default comments, statistics and setups (AM-M04). With _only_if_none it
-- creates the very first journal at most once per user, however many tabs or retries ask at the same moment: the
-- advisory lock serialises them, so a read of the journal list can never leave a duplicate or a half-seeded journal.
create or replace function public.create_journal(
  _journal jsonb, _comments jsonb default '[]'::jsonb, _stats jsonb default '[]'::jsonb, _setups jsonb default '[]'::jsonb, _only_if_none boolean default false)
returns public.journals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  j public.journals;
  c record;
  v_cat uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('create_journal:' || v_uid::text, 0));
  if _only_if_none then
    select * into j from public.journals where owner_id = v_uid order by created_at limit 1;
    if found then return j; end if;
  end if;

  insert into public.journals (name, starting_balance, currency, broker, markets, deposit_date, trade_type, quantity_unit)
  values (
    coalesce(nullif(trim(_journal ->> 'name'), ''), 'Trading Journal'),
    coalesce((_journal ->> 'starting_balance')::numeric, 10000),
    upper(coalesce(nullif(_journal ->> 'currency', ''), 'USD')),
    nullif(_journal ->> 'broker', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(_journal -> 'markets', '[]'::jsonb))), '{}'::text[]),
    nullif(_journal ->> 'deposit_date', '')::date,
    coalesce(nullif(_journal ->> 'trade_type', ''), 'Spot'),
    nullif(_journal ->> 'quantity_unit', ''))
  returning * into j;

  insert into public.comment_definitions (journal_id, phase, label, sentiment, position)
  select j.id, t.c ->> 'phase', t.c ->> 'label', coalesce(t.c ->> 'sentiment', 'neutral'), (t.ord - 1)::int
  from jsonb_array_elements(coalesce(_comments, '[]'::jsonb)) with ordinality as t(c, ord);

  for c in select t.v, t.ord from jsonb_array_elements(coalesce(_stats, '[]'::jsonb)) with ordinality as t(v, ord) loop
    insert into public.custom_stat_categories (journal_id, name, position) values (j.id, c.v ->> 'name', (c.ord - 1)::int) returning id into v_cat;
    insert into public.custom_stat_options (journal_id, category_id, label, position)
    select j.id, v_cat, o.label, (o.ord - 1)::int from jsonb_array_elements_text(coalesce(c.v -> 'options', '[]'::jsonb)) with ordinality as o(label, ord);
  end loop;

  insert into public.setups (journal_id, name, position)
  select j.id, s.name, (s.ord - 1)::int from jsonb_array_elements_text(coalesce(_setups, '[]'::jsonb)) with ordinality as s(name, ord);
  return j;
end
$$;
revoke execute on function public.create_journal(jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.create_journal(jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;

-- 3. -------------------------------------------------------------------------------------------------------------
-- _repair = true also corrects the BROKER-OWNED fields (times, size, prices, direction) of trades that were imported
-- before with a wrong guess (typically the server time zone). Everything the user wrote stays: notes, setup, tags,
-- comments, screenshots (AM-M14).
drop function if exists public.import_mt_report(uuid, jsonb);
create or replace function public.import_mt_report(_journal_id uuid, _payload jsonb, _repair boolean default false)
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
      entry_at = case when _repair then excluded.entry_at else t.entry_at end,
      exit_at = case when _repair then excluded.exit_at else t.exit_at end,
      entry_price = case when _repair then excluded.entry_price else t.entry_price end,
      exit_price = case when _repair then excluded.exit_price else t.exit_price end,
      quantity = case when _repair then excluded.quantity else t.quantity end,
      direction = case when _repair then excluded.direction else t.direction end,
      raw_symbol = case when _repair then excluded.raw_symbol else t.raw_symbol end,
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
       or (_repair and (t.entry_at, t.exit_at, t.entry_price, t.exit_price, t.quantity, t.direction, t.raw_symbol) is distinct from
                        (excluded.entry_at, excluded.exit_at, excluded.entry_price, excluded.exit_price, excluded.quantity, excluded.direction, excluded.raw_symbol))
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
    -- A repaired trade has new prices or size, so the risk the engine stored for the old ones is stale: clear it and the
    -- audit, and the next compute-pnl run works both out again.
    if _repair then
      delete from public.trade_pnl_audit where trade_id = any (v_changed);
      update public.trades set risk_amount = null where id = any (v_changed) and source in ('mt4', 'mt5');
    end if;
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

revoke execute on function public.import_mt_report(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_mt_report(uuid, jsonb, boolean) to authenticated;

-- Make the new functions visible to the API straight away.
notify pgrst, 'reload schema';
