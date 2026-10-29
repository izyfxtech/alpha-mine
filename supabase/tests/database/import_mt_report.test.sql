-- Run with `supabase test db` (pgTAP). Everything happens in one transaction that is rolled back.
begin;
create extension if not exists pgtap;
select plan(29);

-- ---------------------------------------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'b@test.local');
insert into public.journals (id, owner_id, name, currency) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'J1', 'USD'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'J2', 'USD'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2', 'Someone else', 'USD'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'EUR journal', 'EUR'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'J5', 'USD');

create function pg_temp.pos(_id text, _sym text, _dir text, _gross numeric, _comm numeric, _swap numeric, _sl numeric)
returns jsonb language sql as $$
  select jsonb_build_object('external_id', _id, 'raw_symbol', _sym, 'direction', _dir,
    'entry_at', '2026-10-20T06:15:00Z', 'exit_at', '2026-10-20T10:40:10Z', 'entry_price', 1.085, 'exit_price', 1.0912,
    'quantity', 0.10, 'stop_loss', _sl, 'take_profit', null, 'gross_pnl', _gross, 'commission', _comm, 'swap', _swap)
$$;

create function pg_temp.payload(_platform text, _login text, _comm1 numeric default -0.70, _broker_sl numeric default 1.08, _cur text default 'USD')
returns jsonb language sql as $$
  select jsonb_build_object(
    'platform', _platform,
    'account', jsonb_build_object('login', _login, 'server', 'Test-Server', 'currency', _cur),
    'instruments', jsonb_build_array(jsonb_build_object('symbol', 'EURUSD', 'digits', 5), jsonb_build_object('symbol', 'USDJPY', 'digits', 3)),
    'positions', jsonb_build_array(
      pg_temp.pos('1001', 'EURUSD', 'long', 62.00, _comm1, 0, _broker_sl),
      pg_temp.pos('1002', 'USDJPY', 'short', 333.89, -7.00, -1.25, null)),
    'cashflows', jsonb_build_array(jsonb_build_object('external_id', _platform || '-deal:1', 'occurred_on', '2026-10-01', 'amount', 10000, 'note', 'Deposit'))
  )
$$;

-- ---------------------------------------------------------------------------------------- as the owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

create temp table r1 as select public.import_mt_report('10000000-0000-0000-0000-000000000001', pg_temp.payload('mt5', '5012345')) as r;

select is((select r from r1), '{"inserted":2,"updated":0,"unchanged":0,"cashflows":1}'::jsonb, 'first import inserts every trade and the deposit');
select results_eq(
  $$ select mt_platform, mt_login, mt_server, quantity_unit from public.journals where id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('mt5'::text, '5012345'::text, 'Test-Server'::text, 'lots'::text) $$,
  'the journal is linked to the account and marked as lots');
select is((select digits from public.instruments where journal_id = '10000000-0000-0000-0000-000000000001' and symbol = 'EURUSD'), 5, 'instrument digits come from the report');
select results_eq(
  $$ select fees, net_pnl, pnl_manual, source, (instrument_id is not null) from public.trades where external_id = '1001' $$,
  $$ values (0.70::numeric, 61.30::numeric, true, 'mt5'::text, true) $$,
  'net = gross - fees, broker profit is kept, instrument is linked');
select is((select net_pnl from public.trades where external_id = '1002'), 325.64::numeric, 'costs on a short with swap: 333.89 - 8.25');
select results_eq(
  $$ select platform, mode, status, trades_imported, trades_updated, cashflows_imported from public.sync_jobs where journal_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('mt5'::text, 'file_import'::text, 'succeeded'::text, 2, 0, 1) $$,
  'the import is recorded as a sync job');

-- idempotent re-import
create temp table r2 as select public.import_mt_report('10000000-0000-0000-0000-000000000001', pg_temp.payload('mt5', '5012345')) as r;
select is((select r from r2), '{"inserted":0,"updated":0,"unchanged":2,"cashflows":0}'::jsonb, 're-importing the same report changes nothing');
select is((select count(*)::int from public.trades where journal_id = '10000000-0000-0000-0000-000000000001'), 2, 'no duplicate trades');
select is((select count(*)::int from public.journal_cashflows where journal_id = '10000000-0000-0000-0000-000000000001'), 1, 'no duplicate deposits');

-- the user edits a trade, and an engine audit exists for it
update public.trades set notes = 'my note', stop_loss = 1.0700 where external_id = '1001';
reset role;
insert into public.trade_pnl_audit (trade_id, journal_id, engine_version, status, applied)
  select id, journal_id, 'v-open', 'computed', false from public.trades where external_id = '1001';
insert into public.trade_pnl_audit (trade_id, journal_id, engine_version, status, applied)
  select id, journal_id, 'v-applied', 'computed', true from public.trades where external_id = '1001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

-- a late commission arrives
create temp table r3 as select public.import_mt_report('10000000-0000-0000-0000-000000000001', pg_temp.payload('mt5', '5012345', -1.40, 1.08)) as r;
select is((select r from r3), '{"inserted":0,"updated":1,"unchanged":1,"cashflows":0}'::jsonb, 'a changed commission is an update, not a duplicate');
select results_eq(
  $$ select commission, fees, net_pnl from public.trades where external_id = '1001' $$,
  $$ values (-1.40::numeric, 1.40::numeric, 60.60::numeric) $$,
  'commission, fees and net follow the broker');
select is((select notes from public.trades where external_id = '1001'), 'my note', 'notes are never overwritten');
select is((select stop_loss from public.trades where external_id = '1001'), 1.0700::numeric, 'the trader''s own stop loss wins over the broker''s');
select results_eq(
  $$ select engine_version from public.trade_pnl_audit order by engine_version $$,
  $$ values ('v-applied'::text) $$,
  'the stale audit is dropped, the applied one keeps its rollback data');
select is((select sum(trades_updated)::int from public.sync_jobs where journal_id = '10000000-0000-0000-0000-000000000001'), 1, 'the jobs record the update');

-- ---------------------------------------------------------------------------------------------- refusals
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000001', pg_temp.payload('mt5', '9999999')) $$, 'P0001', 'This report is for account 9999999, but this journal is linked to account 5012345.', 'another account is refused');
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000001', pg_temp.payload('mt4', '5012345')) $$, 'P0001', 'This is an MT4 report, but this journal is linked to an MT5 account.', 'another platform is refused');
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000003', pg_temp.payload('mt5', '1')) $$, '42501', 'You do not have access to this journal.', 'someone else''s journal is refused');
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000004', pg_temp.payload('mt5', '777')) $$, 'P0001', 'This report is in USD, but the journal currency is EUR.', 'a currency mismatch is refused');
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000005', pg_temp.payload('mt5', '5012345')) $$, 'P0001', 'This MetaTrader account is already linked to another journal.', 'one account cannot be linked to two journals');
select throws_ok($$ select public.import_mt_report('10000000-0000-0000-0000-000000000002', '{"platform":"mt5","positions":"nope"}') $$, 'P0001', 'The import has no trades array.', 'a malformed payload is refused');

-- ------------------------------------------------------------------------------------------- atomicity
select throws_ok(
  $$ select public.import_mt_report('10000000-0000-0000-0000-000000000002',
       jsonb_set(pg_temp.payload('mt5', '4000001'), '{positions}', jsonb_build_array(pg_temp.pos('2001', 'GBPUSD', 'long', 1, 0, 0, null), pg_temp.pos('2002', 'GBPUSD', 'sideways', 1, 0, 0, null)))) $$,
  '23514', null, 'a bad row fails the whole import');
select is((select mt_login from public.journals where id = '10000000-0000-0000-0000-000000000002'), null, 'nothing was linked');
select is((select count(*)::int from public.trades where journal_id = '10000000-0000-0000-0000-000000000002'), 0, 'no partial trades');
select is((select count(*)::int from public.instruments where journal_id = '10000000-0000-0000-0000-000000000002'), 0, 'no stray instruments');
select is((select count(*)::int from public.sync_jobs where journal_id = '10000000-0000-0000-0000-000000000002'), 0, 'no job recorded for a failed import');

-- ------------------------------------------------------------------------------------------ MT4 + dedupe
create temp table r4 as select public.import_mt_report('10000000-0000-0000-0000-000000000002',
  jsonb_set(pg_temp.payload('mt4', '4000002'), '{positions}', jsonb_build_array(pg_temp.pos('3001', 'EURUSD', 'long', 10, 0, 0, null), pg_temp.pos('3001', 'EURUSD', 'long', 10, 0, 0, null)))) as r;
select is((select r ->> 'inserted' from r4), '1', 'the same ticket twice in one payload is one trade');
select results_eq(
  $$ select mt_platform, source from public.journals j join public.trades t on t.journal_id = j.id where j.id = '10000000-0000-0000-0000-000000000002' $$,
  $$ values ('mt4'::text, 'mt4'::text) $$,
  'an MT4 import links the journal as mt4 and tags the trades');
select is((select external_id from public.journal_cashflows where journal_id = '10000000-0000-0000-0000-000000000002'), 'mt4-deal:1', 'deposit keys carry the platform');

select * from finish();
rollback;
