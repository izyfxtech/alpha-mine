-- Screenshots: up to 10 per trade, record or plan, and a preview file next to each stored screenshot.
--   1. trade_screenshot_cap: 10 instead of 6, and it now also counts missed trades and plans (before, only trades were capped in the
--      database and the other two were limited by the browser alone).
--   2. queue_screenshot_file: when a screenshot is deleted its preview file (<path>.thumb.webp) is queued for removal too, so no
--      preview is left behind in storage.
--   3. merge_trades keeps up to 10 screenshots on the survivor (it used to keep 6).
-- Existing rows are not touched; a trade that already has more than 10 (impossible before) would simply accept no more.

create or replace function public.trade_screenshot_cap() returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if NEW.trade_id is not null then
    select count(*) into n from public.trade_screenshots where trade_id = NEW.trade_id;
  elsif NEW.missed_trade_id is not null then
    select count(*) into n from public.trade_screenshots where missed_trade_id = NEW.missed_trade_id;
  elsif NEW.planned_trade_id is not null then
    select count(*) into n from public.trade_screenshots where planned_trade_id = NEW.planned_trade_id;
  else
    return NEW;
  end if;
  if n >= 10 then raise exception 'A trade can have at most 10 screenshots'; end if;
  return NEW;
end $$;

create or replace function public.queue_screenshot_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A copied journal re-uses the same files, so a path is only queued once NO screenshot row points at it any more.
  if old.path is not null and old.path !~* '^https?:'
     and not exists (select 1 from public.trade_screenshots s where s.path = old.path) then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path), ('screenshots', old.path || '.thumb.webp') on conflict do nothing;
  end if;
  return old;
end $$;

create or replace function public.merge_trades(_ids uuid[], _mode text default 'combine', _keep uuid default null) returns uuid
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
revoke execute on function public.merge_trades(uuid[], text, uuid) from public, anon;
grant execute on function public.merge_trades(uuid[], text, uuid) to authenticated;

notify pgrst, 'reload schema';
