-- Screenshots: at most 10 per trade, missed trade or plan, and a deleted screenshot queues its preview file too.
-- Run with `supabase test db` (pgTAP). One transaction, rolled back.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local');
insert into public.journals (id, owner_id, name, currency, quantity_unit) values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Shots', 'USD', 'lots');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual)
values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1, 1.2, 0.1, 10, true);
insert into public.missed_trades (id, journal_id) values ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001');
insert into public.planned_trades (id, journal_id) values ('73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001');

insert into public.trade_screenshots (trade_id, journal_id, path) select '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/t/' || g || '.webp' from generate_series(1, 10) g;
select is((select count(*)::int from public.trade_screenshots where trade_id = '71000000-0000-0000-0000-000000000001'), 10, 'a trade accepts 10 screenshots');
select throws_ok($$insert into public.trade_screenshots (trade_id, journal_id, path) values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/t/11.webp')$$, 'P0001', 'A trade can have at most 10 screenshots', 'the 11th is refused');

insert into public.trade_screenshots (missed_trade_id, journal_id, path) select '72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/m/' || g || '.webp' from generate_series(1, 10) g;
select throws_ok($$insert into public.trade_screenshots (missed_trade_id, journal_id, path) values ('72000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/m/11.webp')$$, 'P0001', 'A trade can have at most 10 screenshots', 'a missed trade is capped too');
insert into public.trade_screenshots (planned_trade_id, journal_id, path) select '73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/p/' || g || '.webp' from generate_series(1, 10) g;
select throws_ok($$insert into public.trade_screenshots (planned_trade_id, journal_id, path) values ('73000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'd1/p/11.webp')$$, 'P0001', 'A trade can have at most 10 screenshots', 'a plan is capped too');

-- deleting a screenshot queues the file and its preview; a link queues nothing
delete from public.trade_screenshots where path = 'd1/t/1.webp';
select is((select count(*)::int from public.storage_cleanup where path in ('d1/t/1.webp', 'd1/t/1.webp.thumb.webp')), 2, 'a deleted screenshot queues the file and its preview');
insert into public.trade_screenshots (trade_id, journal_id, path) values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'https://s3.tradingview.com/snapshots/a/abc.png');
delete from public.trade_screenshots where path like 'https://%';
select is((select count(*)::int from public.storage_cleanup where path like 'https://%'), 0, 'an external link queues nothing');

-- merging keeps up to 10 screenshots on the survivor
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual)
values ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'long', '2026-10-22T08:00Z', '2026-10-22T09:00Z', 1.1, 1.2, 0.1, 10, true);
insert into public.trade_screenshots (trade_id, journal_id, path) select '71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'd1/u/' || g || '.webp' from generate_series(1, 4) g;
select public.merge_trades(array['71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002']::uuid[]);
select is((select count(*)::int from public.trade_screenshots where trade_id = '71000000-0000-0000-0000-000000000001'), 10, 'a merge fills the survivor to 10 and no more');
select is((select count(*)::int from public.trade_screenshots where trade_id is null and missed_trade_id is null and planned_trade_id is null), 0, 'screenshots that did not fit are removed with their trade, not orphaned');

select * from finish();
rollback;
