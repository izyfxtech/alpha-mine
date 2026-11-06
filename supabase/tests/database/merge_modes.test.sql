-- merge_trades: 'combine' (parts of one position) and 'duplicate' (the same trade logged twice).
-- Run with `supabase test db` (pgTAP). One transaction, rolled back.
begin;
create extension if not exists pgtap;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@test.local');
insert into public.journals (id, owner_id, name, currency, quantity_unit) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Merge', 'USD', 'lots'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'Other user', 'USD', 'lots');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

insert into public.setups (id, journal_id, name) values ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Breakout');

-- ------------------------------------------------------------------------------ duplicate: typed by hand + imported
-- M = typed by hand (setup, stop, target, note, 2 screenshots); I = the broker's import of the same trade (ticket, money, 5 screenshots would be too many so 1)
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss, take_profit, setup_id, gross_pnl, pnl_manual, notes, is_favorite, source)
values ('62000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1000, 1.1100, 0.10, 1.0950, 1.1200, '61000000-0000-0000-0000-000000000001', 100, true, 'my read', true, 'manual');
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, commission, swap, pnl_manual, source, external_id, notes)
values ('62000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-21T10:00Z', '2026-10-21T11:00Z', 1.10002, 1.10998, 0.10, 99.60, -0.70, -0.10, true, 'mt5', 'D1', 'imported note');
insert into public.trade_screenshots (trade_id, journal_id, path) values
  ('62000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'c1/a1.png'),
  ('62000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'c1/a2.png'),
  ('62000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'c1/b1.png');
insert into public.trade_executions (trade_id, journal_id, kind, side, quantity, price, executed_at)
values ('62000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'entry', 'buy', 0.10, 1.10, '2026-10-21T08:00Z');

select is(public.merge_trades(array['62000000-0000-0000-0000-00000000000a','62000000-0000-0000-0000-00000000000b']::uuid[], 'duplicate'), '62000000-0000-0000-0000-00000000000b'::uuid, 'duplicate: the imported trade survives by default');
select is((select count(*)::int from public.trades where id in ('62000000-0000-0000-0000-00000000000a','62000000-0000-0000-0000-00000000000b')), 1, 'duplicate: one trade is left');
select is((select (quantity, gross_pnl, entry_price)::text from public.trades where id = '62000000-0000-0000-0000-00000000000b'), '(0.10,99.60,1.10002)', 'duplicate: nothing is added up, the keeper''s numbers stand');
select is((select net_pnl from public.trades where id = '62000000-0000-0000-0000-00000000000b'), 98.80::numeric, 'duplicate: net is still gross minus the broker''s costs');
select is((select (setup_id, stop_loss, take_profit)::text from public.trades where id = '62000000-0000-0000-0000-00000000000b'), '(61000000-0000-0000-0000-000000000001,1.0950,1.1200)', 'duplicate: setup, stop and target come across from the typed trade');
select is((select initial_stop from public.trades where id = '62000000-0000-0000-0000-00000000000b'), 1.0950::numeric, 'duplicate: the initial stop is set from the carried stop');
select is((select notes from public.trades where id = '62000000-0000-0000-0000-00000000000b'), E'imported note\n\nmy read', 'duplicate: both notes are kept, the keeper''s first');
select is((select is_favorite from public.trades where id = '62000000-0000-0000-0000-00000000000b'), true, 'duplicate: a star on either trade stays');
select is((select count(*)::int from public.trade_screenshots where trade_id = '62000000-0000-0000-0000-00000000000b'), 3, 'duplicate: screenshots from both trades are kept');
select is((select count(*)::int from public.trade_executions where trade_id = '62000000-0000-0000-0000-00000000000b'), 1, 'duplicate: the keeper adopts the legs when it has none');
select is((select pnl_manual from public.trades where id = '62000000-0000-0000-0000-00000000000b'), true, 'duplicate: broker money stays as imported');

-- keeper chosen explicitly: the typed trade's numbers win, the import's ticket is remembered so a re-import cannot bring it back
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, notes, source)
values ('62000000-0000-0000-0000-00000000000c', '60000000-0000-0000-0000-000000000001', 'short', '2026-10-22T08:00Z', '2026-10-22T09:00Z', 1.2000, 1.1900, 0.20, 200, true, 'same note', 'manual');
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, source, external_id, notes)
values ('62000000-0000-0000-0000-00000000000d', '60000000-0000-0000-0000-000000000001', 'short', '2026-10-22T08:00Z', '2026-10-22T09:00Z', 1.2000, 1.1900, 0.20, 200, true, 'mt5', 'D2', 'same note');
select is(public.merge_trades(array['62000000-0000-0000-0000-00000000000c','62000000-0000-0000-0000-00000000000d']::uuid[], 'duplicate', '62000000-0000-0000-0000-00000000000c'), '62000000-0000-0000-0000-00000000000c'::uuid, 'duplicate: the trade named in _keep survives');
select is((select notes from public.trades where id = '62000000-0000-0000-0000-00000000000c'), 'same note', 'duplicate: identical notes are not repeated');
select is((select count(*)::int from public.merged_trade_ids where journal_id = '60000000-0000-0000-0000-000000000001' and external_id = 'D2' and merged_into = '62000000-0000-0000-0000-00000000000c'), 1, 'duplicate: the removed ticket is remembered');
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual)
values ('65000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-25T08:00Z', '2026-10-25T09:00Z', 1.1, 1.2, 0.1, 10, true),
       ('65000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-25T08:00Z', '2026-10-25T09:00Z', 1.1, 1.2, 0.1, 10, true);
select throws_ok($$select public.merge_trades(array['65000000-0000-0000-0000-00000000000a','65000000-0000-0000-0000-00000000000b']::uuid[], 'duplicate', '62000000-0000-0000-0000-0000000000ff')$$, 'P0001', 'The trade to keep is not one of the selected trades.', 'duplicate: _keep must be one of the selected trades');
select throws_ok($$select public.merge_trades(array['62000000-0000-0000-0000-00000000000b','62000000-0000-0000-0000-00000000000c']::uuid[], 'sideways')$$, 'P0001', 'Unknown merge mode.', 'an unknown mode is rejected');

-- ------------------------------------------------------------------------------ combine: still adds up, and no longer loses the survivor's gaps
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, is_break_even)
values ('63000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-23T06:00Z', '2026-10-23T07:00Z', 1.10, 1.11, 0.1, 10, true, true);
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, stop_loss, setup_id, gross_pnl, pnl_manual)
values ('63000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-23T08:00Z', '2026-10-23T09:00Z', 1.12, 1.14, 0.3, 1.0900, '61000000-0000-0000-0000-000000000001', 60, true);
select public.merge_trades(array['63000000-0000-0000-0000-00000000000a','63000000-0000-0000-0000-00000000000b']::uuid[]);
select is((select (quantity, gross_pnl)::text from public.trades where id = '63000000-0000-0000-0000-00000000000a'), '(0.4,70)', 'combine: quantity and money are added up (default mode)');
select is((select (stop_loss, setup_id)::text from public.trades where id = '63000000-0000-0000-0000-00000000000a'), '(1.0900,61000000-0000-0000-0000-000000000001)', 'combine: a gap on the first trade is filled from the others');
select is((select is_break_even from public.trades where id = '63000000-0000-0000-0000-00000000000a'), false, 'combine: break-even only if every part was break-even');

-- ------------------------------------------------------------------------------ re-import tickets survive a later merge of their trade
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, source, external_id)
values ('64000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-24T06:00Z', '2026-10-24T07:00Z', 1.10, 1.11, 0.1, 10, true, 'mt5', 'T1'),
       ('64000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-24T08:00Z', '2026-10-24T09:00Z', 1.12, 1.14, 0.3, 60, true, 'mt5', 'T2'),
       ('64000000-0000-0000-0000-00000000000c', '60000000-0000-0000-0000-000000000001', 'long', '2026-10-24T05:00Z', '2026-10-24T05:30Z', 1.09, 1.10, 0.1, 10, true, 'manual', null);
select public.merge_trades(array['64000000-0000-0000-0000-00000000000a','64000000-0000-0000-0000-00000000000b']::uuid[]);
select public.merge_trades(array['64000000-0000-0000-0000-00000000000a','64000000-0000-0000-0000-00000000000c']::uuid[]);
select is((select count(*)::int from public.merged_trade_ids where external_id = 'T2' and merged_into = '64000000-0000-0000-0000-00000000000c'), 1, 'a ticket merged earlier now points at the trade that absorbed its survivor (it used to cascade away)');

-- ------------------------------------------------------------------------------ guards
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select throws_ok($$select public.merge_trades(array['62000000-0000-0000-0000-00000000000b','62000000-0000-0000-0000-00000000000c']::uuid[], 'duplicate')$$, '42501', 'You do not have access to this journal.', 'another user cannot merge your trades');

select * from finish();
rollback;
