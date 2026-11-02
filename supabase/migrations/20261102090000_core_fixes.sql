-- Core fixes (journal creation, fee split, instrument-driven quantity unit). Additive and safe to re-run.
--
--   1. instruments.asset_class ('forex' | 'stock') decides how a trade's quantity is read, per instrument, instead of one
--      "quantity is in ..." switch per journal: forex is lots, stocks are units (shares). The old journal-level
--      quantity_unit stays as the fallback for instruments that have no class (imports, older journals).
--   2. trades.other_fees: commission, swap and "other fees" are kept apart. fees remains the TOTAL COST (positive = cost)
--      and is derived here from the three parts, so the stored total can never drift from its parts.
--   3. merge_trades() adds the new column up.
--   4. Reloads the PostgREST schema cache so functions created by earlier migrations (create_journal, merge_trades ...)
--      are visible to the API straight away. "Could not find the function ... in the schema cache" means the
--      migrations have not been applied to the project, or the cache was not reloaded afterwards: `pnpm db:push`.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Instrument class
-- ---------------------------------------------------------------------------------------------------------------
alter table public.instruments drop constraint if exists instruments_asset_class_known;
-- Not valid: older rows may hold free text from earlier versions. New and edited rows are checked.
alter table public.instruments add constraint instruments_asset_class_known
  check (asset_class is null or asset_class in ('forex', 'stock', 'futures', 'crypto', 'options', 'indices', 'commodities')) not valid;

-- Backfill 1: a journal that trades exactly one of the two supported markets tells us the class of its instruments.
update public.instruments i set asset_class = 'stock'
from public.journals j
where i.journal_id = j.id and i.asset_class is null and j.markets = array['Stocks']::text[];
update public.instruments i set asset_class = 'forex'
from public.journals j
where i.journal_id = j.id and i.asset_class is null and j.markets = array['Forex']::text[];

-- Backfill 2: a symbol made of two known currency / metal codes (EURUSD, GBPJPY.a, XAUUSD) is a forex-style pair.
do $$
declare codes text := 'USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|ZAR|MXN|SGD|HKD|CNH|CNY|ILS|THB|RON|BRL|INR|KRW|AED|SAR|NGN|KES|GHS|XAU|XAG|XPT|XPD';
begin
  update public.instruments set asset_class = 'forex'
  where asset_class is null and upper(regexp_replace(symbol, '[^A-Za-z]', '', 'g')) ~ ('^(' || codes || ')(' || codes || ')');
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Fee split
-- ---------------------------------------------------------------------------------------------------------------
alter table public.trades add column if not exists other_fees numeric not null default 0;

create or replace function public.trades_compute_pnl() returns trigger language plpgsql set search_path = public as $$
declare auto boolean; junit text; iclass text; unit text;
begin
  select j.auto_pnl, j.quantity_unit, i.asset_class into auto, junit, iclass
  from public.journals j left join public.instruments i on i.id = new.instrument_id
  where j.id = new.journal_id;
  -- How quantity is read comes from the instrument: stocks are units (shares), forex pairs are lots. Only an instrument
  -- without a class falls back to what the journal says (MetaTrader imports mark their journal as lots).
  unit := case iclass when 'stock' then 'units' when 'forex' then 'lots' else junit end;

  if new.is_break_even then
    new.gross_pnl := coalesce(new.gross_pnl, 0);
  -- (exit - entry) * quantity is only money for spot trades whose quantity is in UNITS. A typed, imported or
  -- file-supplied P&L (pnl_manual) is never replaced; lots, and an instrument whose unit is not known, are never
  -- multiplied as if they were units.
  elsif new.exit_price is not null and coalesce(auto, true) and not new.pnl_manual
        and unit = 'units' and lower(new.trade_type) = 'spot' then
    new.gross_pnl := round(((new.exit_price - new.entry_price) * new.quantity * case when new.direction = 'short' then -1 else 1 end)::numeric, 2);
  end if;
  new.gross_pnl := coalesce(new.gross_pnl, 0);

  -- Costs. commission and swap are broker-signed (negative = a cost), other_fees is a plain cost (positive = a cost),
  -- and fees is the total cost. A writer that only knows a total (CSV import, older clients) leaves commission and swap
  -- empty: that total is then "other fees", so nothing is lost and later edits of the parts add up correctly.
  new.other_fees := coalesce(new.other_fees, 0);
  if new.commission is null and new.swap is null and new.other_fees = 0 then
    new.other_fees := coalesce(new.fees, 0);
  else
    new.fees := round(-(coalesce(new.commission, 0) + coalesce(new.swap, 0)) + new.other_fees, 8);
  end if;
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
  elsif tg_op = 'UPDATE' and new.source = 'manual' and unit is distinct from 'units'
        and (new.stop_loss is distinct from old.stop_loss or new.entry_price is distinct from old.entry_price or new.quantity is distinct from old.quantity)
        and new.risk_amount is not distinct from old.risk_amount then
    -- Lots (or an unknown unit): the engine / the app works risk out. The old figure described the old stop or size.
    new.risk_amount := null;
  elsif new.source = 'manual' and unit = 'units' and (
          (tg_op = 'INSERT' and new.risk_amount is null)
       or (tg_op = 'UPDATE' and (new.stop_loss is distinct from old.stop_loss or new.entry_price is distinct from old.entry_price or new.quantity is distinct from old.quantity)
           and (new.risk_amount is null or new.risk_amount is not distinct from old.risk_amount))) then
    new.risk_amount := abs(new.entry_price - new.stop_loss) * new.quantity;
  end if;
  return new;
end $$;

-- Existing rows: whatever part of the stored total is not explained by commission and swap becomes "other fees".
-- The trigger is paused for this one statement so prices, P&L and risk of existing trades are not touched.
alter table public.trades disable trigger trades_pnl;
update public.trades
set other_fees = case when abs(round(fees + coalesce(commission, 0) + coalesce(swap, 0), 8)) < 0.00000001 then 0 else round(fees + coalesce(commission, 0) + coalesce(swap, 0), 8) end
where other_fees = 0 and fees is not null;
alter table public.trades enable trigger trades_pnl;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. merge_trades keeps the parts of the cost
-- ---------------------------------------------------------------------------------------------------------------
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
    other_fees = (select sum(r.other_fees) from unnest(rows) r),
    risk_amount = v_risk,
    notes = nullif((select string_agg(r.notes, E'\n\n' order by r.entry_at, r.id) from unnest(rows) r where nullif(btrim(r.notes), '') is not null), ''),
    is_favorite = (select bool_or(r.is_favorite) from unnest(rows) r),
    pnl_manual = true
  where id = k.id;

  insert into public.merged_trade_ids (journal_id, external_id, merged_into)
  select v_journal, r.external_id, k.id from unnest(rows) r where r.external_id is not null and r.id <> k.id
  on conflict (journal_id, external_id) do nothing;

  update public.trade_comments c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_comments x where x.trade_id = k.id and x.comment_definition_id = c.comment_definition_id);
  update public.trade_custom_stats c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_custom_stats x where x.trade_id = k.id and x.option_id = c.option_id);
  update public.trade_rule_checks c set trade_id = k.id where c.trade_id = any (v_ids) and c.trade_id <> k.id
    and not exists (select 1 from public.trade_rule_checks x where x.trade_id = k.id and x.rule_id = c.rule_id);
  update public.trade_executions set trade_id = k.id where trade_id = any (v_ids) and trade_id <> k.id;
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
-- 4. Make every function visible to the API immediately
-- ---------------------------------------------------------------------------------------------------------------
notify pgrst, 'reload schema';
