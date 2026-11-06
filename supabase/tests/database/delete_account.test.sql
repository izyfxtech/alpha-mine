-- delete_my_account(): removes the caller's account and everything below it, and nobody else's.
-- Run with `supabase test db` (pgTAP). One transaction, rolled back.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.local');
insert into public.journals (id, owner_id, name, currency, quantity_unit) values
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Mine', 'USD', 'lots'),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', 'Theirs', 'USD', 'lots');
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1, 1.2, 0.1, 10, true),
  ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1, 1.2, 0.1, 10, true);
insert into public.trade_screenshots (trade_id, journal_id, path) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'e1/a.webp'),
  ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'e2/b.webp');

-- not signed in
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.delete_my_account()$$, '42501', 'Not signed in.', 'it needs a session');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'a signed-in user can delete their account');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000e1'), 0, 'the sign-in is gone');
select is((select count(*)::int from public.journals where owner_id = '00000000-0000-0000-0000-0000000000e1'), 0, 'their journals are gone');
select is((select count(*)::int from public.trades where journal_id = '80000000-0000-0000-0000-000000000001'), 0, 'their trades are gone');
select is((select count(*)::int from public.storage_cleanup where path in ('e1/a.webp', 'e1/a.webp.thumb.webp')), 2, 'their screenshot files and previews are queued for removal');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000e2'), 1, 'another user is untouched');
select is((select count(*)::int from public.trades where journal_id = '80000000-0000-0000-0000-000000000002'), 1, 'and so is their data');

select * from finish();
rollback;
