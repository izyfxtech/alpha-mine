-- Regression tests for the forensic audit fixes (trade trigger, sharing, merge, import guards, integrity).
-- Run with `supabase test db` (pgTAP). One transaction, rolled back.
begin;
create extension if not exists pgtap;
select plan(33);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.local');
insert into public.journals (id, owner_id, name, currency, quantity_unit) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Units', 'USD', 'units'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'Lots', 'USD', 'lots'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1', 'Import', 'USD', null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2', 'Other user', 'USD', null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

-- ------------------------------------------------------------------------------ P&L ownership (AM-H03)
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 1.0850, 1.0912, 0.10, 62.00, true);
select is((select gross_pnl from public.trades where id = '30000000-0000-0000-0000-000000000001'), 62.00::numeric, 'typed P&L (pnl_manual) is kept');

insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl)
values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 1.0850, 1.0912, 0.10, 62.00);
select is((select gross_pnl from public.trades where id = '30000000-0000-0000-0000-000000000002'), 62.00::numeric, 'lots: P&L is never recomputed as units, even without pnl_manual');

insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 100, 110, 2, 0);
select is((select gross_pnl from public.trades where id = '30000000-0000-0000-0000-000000000003'), 20.00::numeric, 'spot in units: P&L is still derived from prices');

-- ------------------------------------------------------------------------------ risk (AM-H02, AM-L01)
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss, gross_pnl, pnl_manual, source, risk_amount)
values ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 1.0850, 1.0912, 0.10, 1.0800, 61.30, true, 'mt5', 50);
update public.trades set notes = 'edited', risk_amount = null where id = '30000000-0000-0000-0000-000000000004';
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000004'), 50::numeric, 'editing an imported trade keeps its engine-computed risk');

insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss)
values ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 100, 110, 2, 95);
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000005'), 10::numeric, 'manual spot trade: risk derived from the stop');
update public.trades set stop_loss = null where id = '30000000-0000-0000-0000-000000000005';
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000005'), null, 'clearing the stop clears the derived risk');

insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss)
values ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 1.0850, 1.0912, 0.10, 1.0800);
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000006'), null, 'lots: risk is not derived from price distance times lots');

-- ------------------------------------------------------------------------------ unknown unit (AM-M09, AM-H01)
update public.journals set quantity_unit = null where id = '20000000-0000-0000-0000-000000000003';
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss, gross_pnl)
values ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 1.0850, 1.0912, 0.10, 1.0800, 62.00);
select is((select gross_pnl from public.trades where id = '30000000-0000-0000-0000-000000000007'), 62.00::numeric, 'unit not set: the P&L the user supplied is kept, never recomputed');
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000007'), null, 'unit not set: no risk is derived from price distance times quantity');
update public.journals set quantity_unit = 'lots' where id = '20000000-0000-0000-0000-000000000003';

insert into public.journals (id, owner_id, name, currency, quantity_unit) values ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b1', 'Later units', 'USD', null);
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss, gross_pnl, pnl_manual)
values ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000005', 'long', '2026-10-20T08:00Z', '2026-10-20T09:00Z', 100, 110, 2, 95, 20, true);
update public.journals set quantity_unit = 'units' where id = '20000000-0000-0000-0000-000000000005';
select is((select risk_amount from public.trades where id = '30000000-0000-0000-0000-000000000008'), 10::numeric, 'choosing "units" gives existing manual trades their risk');
select is((select gross_pnl from public.trades where id = '30000000-0000-0000-0000-000000000008'), 20::numeric, 'the backfill never changes money');

-- ------------------------------------------------------------------------------ sharing (AM-H08)
update public.journals set share_token = '40000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000001';
select isnt(public.shared_journal('40000000-0000-0000-0000-000000000001'), null, 'a share link works while sharing is allowed');
update public.profiles set settings = settings || '{"allowSharing": false}' where id = '00000000-0000-0000-0000-0000000000b1';
select is((select share_token from public.journals where id = '20000000-0000-0000-0000-000000000001'), null, 'switching sharing off clears the owner''s tokens');
select is(public.shared_journal('40000000-0000-0000-0000-000000000001'), null, 'the old link no longer serves data');
update public.journals set share_token = '40000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001';
select is(public.shared_journal('40000000-0000-0000-0000-000000000002'), null, 'a link created while sharing is off serves nothing');
update public.profiles set settings = settings || '{"allowSharing": true}' where id = '00000000-0000-0000-0000-0000000000b1';
select isnt(public.shared_journal('40000000-0000-0000-0000-000000000002'), null, 'sharing back on re-enables a link that exists');

-- ------------------------------------------------------------------------------ import guards (AM-M13, AM-M15)
create function pg_temp.pl(_login text, _gross jsonb, _comm jsonb) returns jsonb language sql as $$
  select jsonb_build_object('platform', 'mt5',
    'account', case when _login is null then '{}'::jsonb else jsonb_build_object('login', _login, 'server', 'S', 'currency', 'USD') end,
    'instruments', '[]'::jsonb,
    'positions', jsonb_build_array(
      jsonb_build_object('external_id', '9001', 'raw_symbol', 'EURUSD', 'direction', 'long', 'entry_at', '2026-10-20T06:00:00Z', 'exit_at', '2026-10-20T07:00:00Z', 'entry_price', 1.085, 'exit_price', 1.0912, 'quantity', 0.1, 'gross_pnl', _gross, 'commission', _comm, 'swap', 0)
      || case when _comm is null then jsonb_build_object('commission', null) else '{}'::jsonb end),
    'cashflows', '[]'::jsonb)
$$;
select lives_ok($$select public.import_mt_report('20000000-0000-0000-0000-000000000003', pg_temp.pl('777', to_jsonb(62.00), to_jsonb(-0.7)))$$, 'first import succeeds');
select is((select fees from public.trades where journal_id = '20000000-0000-0000-0000-000000000003' and external_id = '9001'), 0.7::numeric, 'fees are minus commission and swap');
select lives_ok($$select public.import_mt_report('20000000-0000-0000-0000-000000000003', pg_temp.pl('777', to_jsonb(62.00), null))$$, 're-import without a commission value succeeds');
select is((select commission from public.trades where journal_id = '20000000-0000-0000-0000-000000000003' and external_id = '9001'), -0.7::numeric, 'absent commission leaves the stored one unchanged');
select throws_ok($$select public.import_mt_report('20000000-0000-0000-0000-000000000003', pg_temp.pl('777', null, to_jsonb(-0.7)))$$, null, null, 'a trade without a profit value is rejected, not imported as 0.00');
select throws_ok($$select public.import_mt_report('20000000-0000-0000-0000-000000000003', pg_temp.pl(null, to_jsonb(-35.00), to_jsonb(-0.7)))$$, null, null, 'a report without an account number cannot be imported into an account-linked journal');
select is((select gross_pnl from public.trades where journal_id = '20000000-0000-0000-0000-000000000003' and external_id = '9001'), 62.00::numeric, 'the existing trade was not overwritten by the rejected report');

-- ------------------------------------------------------------------------------ merge (AM-H07)
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, source, external_id, notes)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'long', '2026-10-21T06:00Z', '2026-10-21T07:00Z', 1.10, 1.11, 0.1, 10, true, 'mt5', 'M1', 'first'),
       ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.12, 1.14, 0.3, 60, true, 'mt5', 'M2', 'second');
select public.merge_trades(array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002']::uuid[]);
select is((select count(*)::int from public.trades where id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002')), 1, 'merge leaves one trade');
select is((select gross_pnl from public.trades where id = '50000000-0000-0000-0000-000000000001'), 70::numeric, 'merged P&L is the sum');
select is((select notes from public.trades where id = '50000000-0000-0000-0000-000000000001'), E'first\n\nsecond', 'notes are concatenated, not dropped');
select lives_ok($$select public.import_mt_report('20000000-0000-0000-0000-000000000003', jsonb_build_object('platform','mt5','account',jsonb_build_object('login','777','server','S','currency','USD'),'instruments','[]'::jsonb,'cashflows','[]'::jsonb,'positions',jsonb_build_array(
  jsonb_build_object('external_id','M1','raw_symbol','EURUSD','direction','long','entry_at','2026-10-21T06:00:00Z','exit_at','2026-10-21T07:00:00Z','entry_price',1.10,'exit_price',1.11,'quantity',0.1,'gross_pnl',10,'commission',0,'swap',0),
  jsonb_build_object('external_id','M2','raw_symbol','EURUSD','direction','long','entry_at','2026-10-21T08:00:00Z','exit_at','2026-10-21T09:00:00Z','entry_price',1.12,'exit_price',1.14,'quantity',0.3,'gross_pnl',60,'commission',0,'swap',0))))$$, 're-importing merged tickets succeeds');
select is((select count(*)::int from public.trades where journal_id = '20000000-0000-0000-0000-000000000003' and external_id in ('M1', 'M2')), 1, 'merged-away tickets are not re-inserted');
select is((select gross_pnl from public.trades where external_id = 'M1'), 70::numeric, 're-import does not overwrite the merged trade with one position''s profit');

-- ------------------------------------------------------------------------------ integrity (AM-M18, M19, M20)
select throws_ok($$insert into public.trades (journal_id, direction, entry_at, entry_price, quantity) values ('20000000-0000-0000-0000-000000000001', 'long', now(), 1, 0)$$, '23514', null, 'quantity 0 is rejected');
select throws_ok($$insert into public.trades (journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity) values ('20000000-0000-0000-0000-000000000001', 'long', now(), now() - interval '1 day', 1, 1, 1)$$, '23514', null, 'exit before entry is rejected');

insert into public.trade_screenshots (trade_id, journal_id, path) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'b1/shot.png');
delete from public.trades where id = '30000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.storage_cleanup where bucket = 'screenshots' and path = 'b1/shot.png'), 1, 'deleting a trade queues its screenshot file for the Storage API sweep');

delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
select is((select count(*)::int from public.journals where owner_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'deleting the account removes its journals (and everything below them)');

select * from finish();
rollback;
