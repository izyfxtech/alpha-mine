-- MetaTrader import (one atomic call), trade merging, sync jobs and the P&L audit tables.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.merged_trade_ids (
    journal_id uuid NOT NULL,
    external_id text NOT NULL,
    merged_into uuid NOT NULL,
    CONSTRAINT merged_trade_ids_pkey PRIMARY KEY (journal_id, external_id),
    CONSTRAINT merged_trade_ids_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT merged_trade_ids_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE TABLE public.rate_observations (
    id bigserial NOT NULL,
    base text NOT NULL,
    quote text NOT NULL,
    rate numeric(38,18) NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    kind text NOT NULL,
    side text NOT NULL,
    lineage bigint[],
    CONSTRAINT rate_observations_pkey PRIMARY KEY (id),
    CONSTRAINT rate_observations_base_check CHECK ((base ~ '^[A-Z0-9]{2,10}$'::text)),
    CONSTRAINT rate_observations_kind_check CHECK ((kind = ANY (ARRAY['implied'::text, 'tick'::text, 'minute'::text, 'daily-fix'::text, 'derived'::text]))),
    CONSTRAINT rate_observations_quote_check CHECK ((quote ~ '^[A-Z0-9]{2,10}$'::text)),
    CONSTRAINT rate_observations_rate_check CHECK ((rate > (0)::numeric))
);

CREATE UNIQUE INDEX rate_observations_key_uidx ON public.rate_observations USING btree (base, quote, source, kind, side, observed_at);

CREATE TABLE public.sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform text NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    trades_imported integer DEFAULT 0 NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    journal_id uuid,
    trades_updated integer DEFAULT 0 NOT NULL,
    cashflows_imported integer DEFAULT 0 NOT NULL,
    CONSTRAINT sync_jobs_pkey PRIMARY KEY (id),
    CONSTRAINT sync_jobs_mode_check CHECK ((mode = ANY (ARRAY['file_import'::text, 'ea_push'::text, 'worker_pull'::text]))),
    CONSTRAINT sync_jobs_platform_check CHECK ((platform = ANY (ARRAY['mt4'::text, 'mt5'::text]))),
    CONSTRAINT sync_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT sync_jobs_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT sync_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX sync_jobs_queue_idx ON public.sync_jobs USING btree (status, created_at);

CREATE TABLE public.trade_pnl_audit (
    id bigserial NOT NULL,
    trade_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    engine_version text NOT NULL,
    status text NOT NULL,
    skip_reason text,
    prev_gross_pnl numeric,
    prev_net_pnl numeric,
    prev_fees numeric,
    prev_risk_amount numeric,
    gross_account numeric,
    net_account numeric,
    planned_risk numeric,
    r_multiple numeric,
    conversion_rate_id bigint,
    open_conversion_rate_id bigint,
    gross_source text,
    recon_status text,
    recon_diagnosis text[],
    warnings text[],
    applied boolean DEFAULT false NOT NULL,
    applied_at timestamp with time zone,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_pnl_audit_pkey PRIMARY KEY (id),
    CONSTRAINT trade_pnl_audit_trade_id_engine_version_key UNIQUE (trade_id, engine_version),
    CONSTRAINT trade_pnl_audit_recon_status_check CHECK ((recon_status = ANY (ARRAY['OK'::text, 'WARN'::text, 'MISMATCH'::text]))),
    CONSTRAINT trade_pnl_audit_status_check CHECK ((status = ANY (ARRAY['computed'::text, 'skipped'::text, 'error'::text]))),
    CONSTRAINT trade_pnl_audit_conversion_rate_id_fkey FOREIGN KEY (conversion_rate_id) REFERENCES public.rate_observations(id),
    CONSTRAINT trade_pnl_audit_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_pnl_audit_open_conversion_rate_id_fkey FOREIGN KEY (open_conversion_rate_id) REFERENCES public.rate_observations(id),
    CONSTRAINT trade_pnl_audit_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_pnl_audit_journal_idx ON public.trade_pnl_audit USING btree (journal_id, status);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.import_mt_report(_journal_id uuid, _payload jsonb, _repair boolean default false, _force boolean default false)
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

  if not _force and v_login is null and j.mt_login is not null then
    raise exception 'This report has no account number, but this journal is linked to account %. Import it into a journal that is not linked to an account.', j.mt_login;
  end if;
  if not _force and j.mt_platform is not null and j.mt_platform <> v_platform then
    raise exception 'This is an % report, but this journal is linked to an % account.', upper(v_platform), upper(j.mt_platform);
  end if;
  if not _force and j.mt_login is not null and v_login is not null and j.mt_login <> v_login then
    raise exception 'This report is for account %, but this journal is linked to account %.', v_login, j.mt_login;
  end if;
  if not _force and v_currency is not null and upper(j.currency) <> v_currency then
    raise exception 'This report is in %, but the journal currency is %.', v_currency, upper(j.currency);
  end if;

  -- Link the journal to the account on first import. Never when the caller has accepted a mismatch (_force): a journal that
  -- holds trades of several accounts, or an account already linked to another journal, is left as it is.
  if j.mt_login is null and v_login is not null then
    if exists (select 1 from public.journals o where o.owner_id = j.owner_id and o.id <> j.id and o.mt_platform = v_platform and o.mt_login = v_login and o.mt_server is not distinct from v_server) then
      if not _force then raise exception 'This MetaTrader account is already linked to another journal.'; end if;
    else
      begin
        update public.journals set mt_platform = v_platform, mt_server = v_server, mt_login = v_login where id = _journal_id;
      exception when unique_violation then
        if not _force then raise exception 'This MetaTrader account is already linked to another journal.'; end if;
      end;
    end if;
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
      entry_price numeric, exit_price numeric, quantity numeric, stop_loss numeric, initial_stop numeric, take_profit numeric,
      gross_pnl numeric, commission numeric, swap numeric)
    where p.external_id is not null
      and not exists (select 1 from public.merged_trade_ids m where m.journal_id = _journal_id and m.external_id = p.external_id)
    order by p.external_id
  ), up as (
    insert into public.trades as t (
      journal_id, instrument_id, direction, entry_at, exit_at, entry_price, exit_price, quantity,
      stop_loss, initial_stop, take_profit, gross_pnl, fees, commission, swap, pnl_manual, source, external_id, raw_symbol)
    select
      _journal_id, i.id, s.direction, s.entry_at, s.exit_at, s.entry_price, s.exit_price, s.quantity,
      s.stop_loss, s.initial_stop, s.take_profit, s.gross_pnl,
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
      initial_stop = coalesce(excluded.initial_stop, t.initial_stop),
      take_profit = coalesce(t.take_profit, excluded.take_profit),
      instrument_id = coalesce(t.instrument_id, excluded.instrument_id)
    where not exists (select 1 from public.merged_trade_ids m where m.journal_id = t.journal_id and m.merged_into = t.id)
      and ((t.gross_pnl, t.fees, t.commission, t.swap) is distinct from
           (excluded.gross_pnl, round(-(coalesce(coalesce(excluded.commission, t.commission), 0) + coalesce(coalesce(excluded.swap, t.swap), 0)), 8), coalesce(excluded.commission, t.commission), coalesce(excluded.swap, t.swap))
       or (_repair and (t.entry_at, t.exit_at, t.entry_price, t.exit_price, t.quantity, t.direction, t.raw_symbol) is distinct from
                        (excluded.entry_at, excluded.exit_at, excluded.entry_price, excluded.exit_price, excluded.quantity, excluded.direction, excluded.raw_symbol))
       or (t.stop_loss is null and excluded.stop_loss is not null)
       or (excluded.initial_stop is not null and t.initial_stop is distinct from excluded.initial_stop)
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

create function public.merge_trades(_ids uuid[], _mode text default 'combine', _keep uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rows public.trades[];
  k public.trades;
  v_journal uuid;
  v_journals uuid[];
  v_ids uuid[];
  v_qty numeric; v_entry numeric; v_exit numeric; v_risk numeric;
  v_notes text;
  v_exec_from uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if _mode is null or _mode not in ('combine', 'duplicate') then raise exception 'Unknown merge mode.'; end if;
  select array_agg(distinct x) into v_ids from unnest(_ids) x;
  if v_ids is null or cardinality(v_ids) < 2 then raise exception 'Select at least two trades to merge.'; end if;

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

  -- The survivor: the earliest trade when combining; the chosen (default: an imported) trade for a duplicate.
  if _mode = 'duplicate' and _keep is not null then
    if not (_keep = any (v_ids)) then raise exception 'The trade to keep is not one of the selected trades.'; end if;
    select r.* into k from unnest(rows) r where r.id = _keep;
  elsif _mode = 'duplicate' then
    select r.* into k from unnest(rows) r order by (r.external_id is null), r.entry_at, r.id limit 1;
  else
    k := rows[1];
  end if;

  if _mode = 'combine' then
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
      other_fees = (select sum(r.other_fees) from unnest(rows) r),
      risk_amount = v_risk,
      notes = nullif((select string_agg(r.notes, E'\n\n' order by r.entry_at, r.id) from unnest(rows) r where nullif(btrim(r.notes), '') is not null), ''),
      is_favorite = (select bool_or(r.is_favorite) from unnest(rows) r),
      is_break_even = (select bool_and(r.is_break_even) from unnest(rows) r),
      setup_id = coalesce(k.setup_id, (select r.setup_id from unnest(rows) r where r.setup_id is not null order by r.entry_at, r.id limit 1)),
      trading_plan_id = coalesce(k.trading_plan_id, (select r.trading_plan_id from unnest(rows) r where r.trading_plan_id is not null order by r.entry_at, r.id limit 1)),
      stop_loss = coalesce(k.stop_loss, (select r.stop_loss from unnest(rows) r where r.stop_loss is not null order by r.entry_at, r.id limit 1)),
      initial_stop = coalesce(k.initial_stop, (select r.initial_stop from unnest(rows) r where r.initial_stop is not null order by r.entry_at, r.id limit 1)),
      take_profit = coalesce(k.take_profit, (select r.take_profit from unnest(rows) r where r.take_profit is not null order by r.entry_at, r.id limit 1)),
      high_price = (select max(r.high_price) from unnest(rows) r),
      low_price = (select min(r.low_price) from unnest(rows) r),
      otp_hit = coalesce(k.otp_hit, (select r.otp_hit from unnest(rows) r where r.otp_hit is not null order by r.entry_at, r.id limit 1)),
      pnl_manual = true
    where id = k.id;
  else
    -- Same trade logged twice: the keeper's numbers stand; only what it lacks (or the notes) comes across.
    select string_agg(d.notes, E'\n\n' order by d.ord) into v_notes from (
      select distinct on (btrim(q.notes)) q.notes, q.ord from (
        select r.notes, row_number() over (order by (r.id <> k.id), r.entry_at, r.id) as ord
        from unnest(rows) r where nullif(btrim(r.notes), '') is not null
      ) q order by btrim(q.notes), q.ord
    ) d;

    update public.trades set
      notes = v_notes,
      is_favorite = (select bool_or(r.is_favorite) from unnest(rows) r),
      instrument_id = coalesce(k.instrument_id, (select r.instrument_id from unnest(rows) r where r.instrument_id is not null order by r.entry_at, r.id limit 1)),
      setup_id = coalesce(k.setup_id, (select r.setup_id from unnest(rows) r where r.setup_id is not null order by r.entry_at, r.id limit 1)),
      trading_plan_id = coalesce(k.trading_plan_id, (select r.trading_plan_id from unnest(rows) r where r.trading_plan_id is not null order by r.entry_at, r.id limit 1)),
      stop_loss = coalesce(k.stop_loss, (select r.stop_loss from unnest(rows) r where r.stop_loss is not null order by r.entry_at, r.id limit 1)),
      initial_stop = coalesce(k.initial_stop, (select r.initial_stop from unnest(rows) r where r.initial_stop is not null order by r.entry_at, r.id limit 1)),
      take_profit = coalesce(k.take_profit, (select r.take_profit from unnest(rows) r where r.take_profit is not null order by r.entry_at, r.id limit 1)),
      high_price = coalesce(k.high_price, (select r.high_price from unnest(rows) r where r.high_price is not null order by r.entry_at, r.id limit 1)),
      low_price = coalesce(k.low_price, (select r.low_price from unnest(rows) r where r.low_price is not null order by r.entry_at, r.id limit 1)),
      otp_hit = coalesce(k.otp_hit, (select r.otp_hit from unnest(rows) r where r.otp_hit is not null order by r.entry_at, r.id limit 1)),
      risk_amount = coalesce(k.risk_amount, (select r.risk_amount from unnest(rows) r where r.risk_amount is not null order by r.entry_at, r.id limit 1))
    where id = k.id;
  end if;

  -- Broker tickets of the trades that go away are remembered, so a re-import does not bring them back.
  insert into public.merged_trade_ids (journal_id, external_id, merged_into)
  select v_journal, r.external_id, k.id from unnest(rows) r where r.external_id is not null and r.id <> k.id
  on conflict (journal_id, external_id) do nothing;
  -- ... and tickets merged into one of the going-away trades earlier now point at the survivor (the FK would cascade them away).
  update public.merged_trade_ids set merged_into = k.id where merged_into = any (v_ids) and merged_into <> k.id;

  update public.trade_comments c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_comments x where x.trade_id = k.id and x.comment_definition_id = c.comment_definition_id);
  update public.trade_custom_stats c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_custom_stats x where x.trade_id = k.id and x.option_id = c.option_id);
  update public.trade_rule_checks c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_rule_checks x where x.trade_id = k.id and x.rule_id = c.rule_id);

  -- Execution legs: parts of one position are all kept; for a duplicate the same fills would be counted twice, so the keeper's
  -- own legs stand, and if it has none the legs of one other trade are adopted.
  if _mode = 'combine' then
    update public.trade_executions set trade_id = k.id where trade_id = any (v_ids) and trade_id <> k.id;
  elsif not exists (select 1 from public.trade_executions where trade_id = k.id) then
    select e.trade_id into v_exec_from from public.trade_executions e where e.trade_id = any (v_ids) and e.trade_id <> k.id order by e.executed_at, e.id limit 1;
    if v_exec_from is not null then update public.trade_executions set trade_id = k.id where trade_id = v_exec_from; end if;
  end if;

  -- A trade holds at most 10 screenshots (the cap trigger only checks inserts, so enforce it here).
  update public.trade_screenshots s set trade_id = k.id
  where s.id in (
    select id from (
      select id, row_number() over (order by created_at, id) as rn from public.trade_screenshots where trade_id = any (v_ids) and trade_id <> k.id
    ) q where q.rn <= greatest(10 - (select count(*) from public.trade_screenshots where trade_id = k.id), 0));

  delete from public.trades where id = any (v_ids) and id <> k.id;
  return k.id;
end $$;

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.merged_trade_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads merged ids" ON public.merged_trade_ids FOR SELECT USING (public.owns_journal(journal_id));

ALTER TABLE public.rate_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signed in users read rates" ON public.rate_observations FOR SELECT TO authenticated USING (true);

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own sync jobs" ON public.sync_jobs FOR SELECT USING ((user_id = auth.uid()));

ALTER TABLE public.trade_pnl_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read own pnl audit" ON public.trade_pnl_audit FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.journals j
  WHERE ((j.id = trade_pnl_audit.journal_id) AND (j.owner_id = auth.uid())))));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.merged_trade_ids, public.rate_observations, public.sync_jobs, public.trade_pnl_audit from public, anon, authenticated;
grant select on public.merged_trade_ids, public.rate_observations, public.sync_jobs, public.trade_pnl_audit to authenticated;
grant all on public.merged_trade_ids, public.rate_observations, public.sync_jobs, public.trade_pnl_audit to service_role;

revoke all on sequence public.trade_pnl_audit_id_seq, public.rate_observations_id_seq from public, anon, authenticated;
grant select, usage on sequence public.trade_pnl_audit_id_seq, public.rate_observations_id_seq to service_role;

revoke all on function public.import_mt_report(uuid, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.import_mt_report(uuid, jsonb, boolean, boolean) to authenticated, service_role;

revoke all on function public.merge_trades(uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.merge_trades(uuid[], text, uuid) to authenticated, service_role;
