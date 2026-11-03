-- Simple calculations. The database no longer works out risk: R is a ratio of prices computed in the app (src/lib/pnl/calc.ts),
-- and money at risk is shown from the instrument's asset class (src/lib/pnl/instrument-catalogue.ts). The trigger keeps only what
-- must hold for every writer: P&L for spot stock trades without a typed P&L, the three-part cost split, and net = gross - fees.
-- Additive and safe to re-run.

-- 1. Instrument classes the catalogue uses.
alter table public.instruments drop constraint if exists instruments_asset_class_known;
alter table public.instruments add constraint instruments_asset_class_known
  check (asset_class is null or asset_class in ('forex', 'metal', 'crypto', 'index', 'energy', 'stock', 'future', 'futures', 'options', 'indices', 'commodities')) not valid;

-- 2. Trigger without any risk logic.
create or replace function public.trades_compute_pnl() returns trigger language plpgsql set search_path = public as $$
declare auto boolean; junit text; iclass text; unit text;
begin
  select j.auto_pnl, j.quantity_unit, i.asset_class into auto, junit, iclass
  from public.journals j left join public.instruments i on i.id = new.instrument_id
  where j.id = new.journal_id;
  -- Stocks are units; every other class is lots / contracts and needs a contract size, which only the app knows: it supplies the P&L.
  unit := case when iclass = 'stock' then 'units' when iclass is not null then 'lots' else junit end;

  if new.is_break_even then
    new.gross_pnl := coalesce(new.gross_pnl, 0);
  elsif new.exit_price is not null and coalesce(auto, true) and not new.pnl_manual
        and unit = 'units' and lower(new.trade_type) = 'spot' then
    new.gross_pnl := round(((new.exit_price - new.entry_price) * new.quantity * case when new.direction = 'short' then -1 else 1 end)::numeric, 2);
  end if;
  new.gross_pnl := coalesce(new.gross_pnl, 0);

  -- commission and swap are broker-signed (negative = a cost), other_fees is a plain cost, fees is the total cost.
  new.other_fees := coalesce(new.other_fees, 0);
  if new.commission is null and new.swap is null and new.other_fees = 0 then
    new.other_fees := coalesce(new.fees, 0);
  else
    new.fees := round(-(coalesce(new.commission, 0) + coalesce(new.swap, 0)) + new.other_fees, 8);
  end if;
  new.fees := coalesce(new.fees, 0);
  new.net_pnl := new.gross_pnl - new.fees;
  return new;
end $$;

-- 3. The journal-level "quantity is in ..." switch no longer drives risk.
drop trigger if exists journals_backfill_risk on public.journals;
drop function if exists public.journals_backfill_risk();

notify pgrst, 'reload schema';
