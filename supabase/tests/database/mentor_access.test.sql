-- Mentor access: who can read and write what, for every actor against every view and scope.
-- Run with `supabase test db` (pgTAP). One transaction, rolled back.
--
-- Actors
--   s1  student who owns journal j1 (two trades, one screenshot, one cashflow, one diary session)
--   s2  another student who owns j2 (one trade)
--   m1  mentor, granted j1 with trades, screenshots, plans, money
--   m4  mentor, granted j1 with trades only (no money, no screenshots)
--   m2  mentor whose grant was revoked
--   m3  mentor whose grant expired
--   x   a stranger with no mentorship
begin;
create extension if not exists pgtap;
select plan(100);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 's1@test.local'), ('00000000-0000-0000-0000-0000000000a2', 's2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'm1@test.local'), ('00000000-0000-0000-0000-0000000000b2', 'm2@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'm3@test.local'), ('00000000-0000-0000-0000-0000000000b4', 'm4@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'x@test.local');
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Mia Mentor' where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.journals (id, owner_id, name, currency, starting_balance, quantity_unit, broker, mt_login) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'S1 journal', 'USD', 10000, 'lots', 'Acme FX', '123456'),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'S2 journal', 'USD', 5000, 'lots', null, null);
insert into public.trades (id, journal_id, direction, entry_at, exit_at, entry_price, exit_price, quantity, gross_pnl, pnl_manual, external_id) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1, 1.2, 0.1, 10, true, 'T-1'),
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'long', '2026-10-22T08:00Z', '2026-10-22T09:00Z', 1.1, 1.0, 0.1, -4, true, 'T-2'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', 'long', '2026-10-21T08:00Z', '2026-10-21T09:00Z', 1.1, 1.2, 0.1, 7, true, 'T-3');
insert into public.trade_screenshots (trade_id, journal_id, path) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'a1/shot.webp'),
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', 'a2/shot.webp');
insert into public.journal_cashflows (journal_id, amount) values ('90000000-0000-0000-0000-000000000001', 500);
insert into public.diary_sessions (id, journal_id, notes) values
  ('92000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'private note');

insert into public.mentorships (id, mentor_id, student_id, status, created_by) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'active', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'active', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'active', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', 'active', '00000000-0000-0000-0000-0000000000a1');
insert into public.journal_access (mentorship_id, journal_id, scopes, expires_at, revoked_at) values
  ('a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '{trades,screenshots,plans,money}', null, null),
  ('a0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '{trades,screenshots,plans,money}', null, now() - interval '1 day'),
  ('a0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', '{trades,screenshots,plans,money}', now() - interval '1 hour', null),
  ('a0000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000001', '{trades}', null, null);

create function pg_temp.act(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
end $$;

-- ---- the views, actor by actor --------------------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.mentee_trades), 2, 'm1 reads the two trades of the journal shared with them');
select is((select count(*)::int from public.mentee_trades where journal_id = '90000000-0000-0000-0000-000000000002'), 0, 'm1 reads nothing of another student');
select is((select net_pnl from public.mentee_trades where id = '91000000-0000-0000-0000-000000000001'), 10::numeric, 'with the money scope the P&L is there');
select is((select count(*)::int from public.mentee_trade_screenshots), 1, 'm1 reads the screenshot rows');
select is((select count(*)::int from public.mentee_journal_cashflows), 1, 'm1 reads the cashflows (money scope)');
select is((select count(*)::int from public.mentee_diary_sessions), 0, 'm1 has no notes scope, so no diary');
select is((select starting_balance from public.mentee_journals), 10000::numeric, 'm1 sees the starting balance');
select is((select count(*)::int from public.trades), 0, 'm1 cannot read the base trades table at all');
select is((select count(*)::int from public.journals), 0, 'm1 cannot read the base journals table at all');
select is((select count(*)::int from public.trade_screenshots), 0, 'm1 cannot read the base screenshots table');
select is((select external_id from (select to_jsonb(t) ->> 'external_id' as external_id from public.mentee_trades t limit 1) q), null, 'the broker ticket is not exposed');
select throws_ok($$insert into public.mentorships (mentor_id, student_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2')$$, '42501', null, 'a mentor cannot create a mentorship by hand');
select throws_ok($$update public.journal_access set scopes = '{trades,notes}'$$, '42501', null, 'a mentor cannot widen a grant');
select throws_ok($$update public.mentee_trades set notes = 'hacked'$$, '55000', null, 'a mentor cannot write through the views: they are not updatable');
select lives_ok($$update public.trades set notes = 'hacked'$$, 'an update of the base table is not an error, it just matches no rows');
reset role;
select is((select count(*)::int from public.trades where notes = 'hacked'), 0, 'and no trade was changed');

select pg_temp.act('00000000-0000-0000-0000-0000000000b4');
select is((select count(*)::int from public.mentee_trades), 2, 'm4 (trades only) still sees the trades');
select is((select count(*)::int from public.mentee_trades where net_pnl is null and quantity is null and gross_pnl is null and fees is null and risk_amount is null), 2, 'without the money scope every money column is null');
select is((select count(*)::int from public.mentee_trades where entry_price is not null and direction is not null), 2, 'prices and direction are not money, so they stay');
select is((select starting_balance from public.mentee_journals), null, 'without money there is no starting balance');
select is((select count(*)::int from public.mentee_journal_cashflows), 0, 'without money there are no cashflows');
select is((select count(*)::int from public.mentee_trade_screenshots), 0, 'without the screenshots scope there are no screenshots');
select is((select count(*)::int from public.mentee_trade_executions), 0, 'executions follow the trades scope (none in the fixture)');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.mentee_trades), 0, 'a revoked mentor reads no trades');
select is((select count(*)::int from public.mentee_journals), 0, 'a revoked mentor sees no journal');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from public.mentee_trades), 0, 'an expired grant reads no trades');
select is((select count(*)::int from public.my_grants), 0, 'and has no live grants');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.mentee_trades), 0, 'a stranger reads no trades');
select is((select count(*)::int from public.mentee_trade_screenshots), 0, 'a stranger reads no screenshots');
select is((select count(*)::int from public.mentee_journals), 0, 'a stranger sees no journals');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.trades), 2, 'the owner still reads their own trades from the base table');
select is((select count(*)::int from public.mentee_trades), 0, 'and is not a mentor of anyone through the views');
reset role;

select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'mentee_journals' and column_name in ('share_token', 'mt_login', 'mt_server', 'broker')),
          0, 'the journal view leaves out the share token, broker and MetaTrader login');

-- ---- feedback --------------------------------------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                   values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000001', auth.uid(), 'Good patience on the entry.')$$,
                'a granted mentor can comment on a trade');
select is((select author_name from public.trade_feedback), 'Mia Mentor', 'the author name comes from the profile, not from the client');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'as the student')$$,
                 '42501', null, 'a mentor cannot write as someone else');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000002', 'trade', '91000000-0000-0000-0000-000000000003', auth.uid(), 'other student')$$,
                 '42501', null, 'a mentor cannot comment in a journal that was not shared with them');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000003', auth.uid(), 'wrong journal')$$,
                 '23514', null, 'a comment cannot point at a trade from another journal');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000001', 'diary_session', '92000000-0000-0000-0000-000000000001', auth.uid(), 'peeking')$$,
                 '42501', null, 'without the notes scope a mentor cannot comment on a diary session');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000001', auth.uid(), '   ')$$,
                 '23514', null, 'an empty comment is refused');
select lives_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body, parent_id)
                   select journal_id, target_type, target_id, auth.uid(), 'Follow-up', id from public.trade_feedback$$,
                'a reply joins the thread');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body, parent_id)
                    select journal_id, target_type, target_id, auth.uid(), 'Reply to a reply', id from public.trade_feedback where parent_id is not null$$,
                 '23514', null, 'threads are one level deep');
select lives_ok($$select public.edit_feedback((select id from public.trade_feedback where parent_id is null), 'Good patience on the entry, and the stop.')$$,
                'the author edits within 15 minutes');
reset role;
update public.trade_feedback set created_at = now() - interval '20 minutes' where parent_id is null;

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.edit_feedback((select id from public.trade_feedback where parent_id is null), 'too late')$$,
                 '42501', null, 'after 15 minutes the author cannot edit');
select throws_ok($$select public.delete_feedback((select id from public.trade_feedback where parent_id is null))$$,
                 '42501', null, 'or delete');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.trade_feedback), 2, 'the student reads the feedback on their trade');
select is((select count(*)::int from public.notifications where kind = 'feedback'), 2, 'and was notified of both comments');
select lives_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body, parent_id)
                   select journal_id, target_type, target_id, auth.uid(), 'Thanks!', id from public.trade_feedback where parent_id is null$$,
                'the student can reply');
select lives_ok($$select public.resolve_feedback((select id from public.trade_feedback where parent_id is null))$$, 'the student resolves the thread');
select ok((select resolved_at is not null from public.trade_feedback where parent_id is null), 'and it is marked resolved');
select lives_ok($$update public.notifications set read_at = now()$$, 'the student can mark notifications read');
select throws_ok($$update public.notifications set kind = 'feedback', user_id = '00000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'but cannot change anything else about them');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.notifications where kind = 'feedback'), 1, 'the mentor was told about the student''s reply (and not about their own comments)');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.trade_feedback), 0, 'a stranger reads no feedback');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.trade_feedback), 0, 'a revoked mentor reads no feedback');
select throws_ok($$insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
                    values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000001', auth.uid(), 'still here?')$$,
                 '42501', null, 'and cannot write any');
reset role;

-- ---- screenshots: which paths may be signed ------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select is(public.visible_screenshot_paths(array['a1/shot.webp', 'a1/shot.webp.thumb.webp', 'a2/shot.webp', 'a1/none.webp']),
          array['a1/shot.webp', 'a1/shot.webp.thumb.webp'], 'a granted mentor may sign the shared screenshot and its preview, nothing else');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000b4');
select is(public.visible_screenshot_paths(array['a1/shot.webp']), '{}'::text[], 'without the screenshots scope nothing is visible');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is(public.visible_screenshot_paths(array['a1/shot.webp', 'a2/shot.webp']), '{}'::text[], 'a stranger may sign none');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select is(public.visible_screenshot_paths(array['a1/shot.webp', 'a2/shot.webp']), array['a1/shot.webp'], 'an owner may sign their own');
reset role;

-- ---- feedback images ---------------------------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
create temp table att (id uuid);
grant all on att to public;
with f as (
  insert into public.trade_feedback (journal_id, target_type, target_id, author_id, body)
  values ('90000000-0000-0000-0000-000000000001', 'trade', '91000000-0000-0000-0000-000000000002', auth.uid(), 'See the chart')
  returning id)
insert into att select id from f;
select lives_ok($$insert into public.feedback_attachments (feedback_id, journal_id, path)
                   select id, '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1/img1.webp' from att$$, 'a mentor attaches an image from their own folder');
select throws_ok($$insert into public.feedback_attachments (feedback_id, journal_id, path)
                    select id, '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1/steal.webp' from att$$, '42501', null, 'but not a file from someone else''s folder');
select lives_ok($$insert into public.feedback_attachments (feedback_id, journal_id, path)
                   select id, '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1/img' || n || '.webp' from att, generate_series(2, 4) n$$, 'up to four images per feedback');
select throws_ok($$insert into public.feedback_attachments (feedback_id, journal_id, path)
                    select id, '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1/img5.webp' from att$$, '54000', null, 'a fifth is refused');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.feedback_attachments), 0, 'a stranger sees no feedback images');
select is(public.visible_screenshot_paths(array['00000000-0000-0000-0000-0000000000b1/img1.webp']), '{}'::text[], 'and may not sign them');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.feedback_attachments), 4, 'the student sees all four');
select is(public.visible_screenshot_paths(array['00000000-0000-0000-0000-0000000000b1/img1.webp', '00000000-0000-0000-0000-0000000000b1/img1.webp.thumb.webp', '00000000-0000-0000-0000-0000000000b1/other.webp']),
          array['00000000-0000-0000-0000-0000000000b1/img1.webp', '00000000-0000-0000-0000-0000000000b1/img1.webp.thumb.webp'], 'and may sign them and their previews, but not a file nothing points to');
select lives_ok($$select public.delete_feedback((select id from att))$$, 'the student can delete the feedback');
reset role;
select is((select count(*)::int from public.storage_cleanup where path like '00000000-0000-0000-0000-0000000000b1/%'), 8, 'its four images and their previews are queued for removal');

-- ---- invites -------------------------------------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
create temp table inv (token text);
grant all on inv to public;
insert into inv select public.create_mentor_invite('student', array['90000000-0000-0000-0000-000000000002']::uuid[], array['trades', 'screenshots']);
select is((select length(token) from inv), 64, 'an invite token has 64 hex characters');
select is((select count(*)::int from public.mentorship_invites where inviter_id = auth.uid()), 1, 'the student can list their own invites');
select throws_ok($$select token_hash from public.mentorship_invites$$, '42501', null, 'but never read the token hash');
select throws_ok($$select public.create_mentor_invite('student', array['90000000-0000-0000-0000-000000000001']::uuid[])$$, '42501', null, 'a student cannot offer someone else''s journal');
select throws_ok($$select public.create_mentor_invite('student', '{}'::uuid[])$$, '22023', null, 'a student invite needs a journal');
select throws_ok($$select public.accept_mentor_invite((select token from inv))$$, '42501', null, 'nobody accepts their own invite');
reset role;
select is((select count(*)::int from public.mentorship_invites where token_hash = (select token from inv)), 0, 'the token itself is not stored');

select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is((select usable from public.preview_mentor_invite((select token from inv))), true, 'the invitee can preview a usable invite');
select is((select inviter_name from public.preview_mentor_invite((select token from inv))), 's2'::text, 'with the inviter''s display name');
select lives_ok($$select public.accept_mentor_invite((select token from inv))$$, 'a signed-in person accepts a student''s invite and becomes the mentor');
select is((select count(*)::int from public.mentee_trades), 1, 'and reads exactly what the student offered');
select is((select net_pnl from public.mentee_trades), 7::numeric, 'with money, because Phase 1 always includes it');
select is((select count(*)::int from public.mentee_trade_screenshots), 1, 'and the screenshot scope the student chose');
select throws_ok($$select public.accept_mentor_invite((select token from inv))$$, 'P0001', null, 'an invite works once');
select is((select count(*)::int from public.my_students()), 1, 'my_students lists the new student journal');
select is((select trades from public.my_students()), 1::bigint, 'with a live trade count');
reset role;

select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.notifications where kind = 'invite_accepted'), 1, 'the student is told the invite was accepted');
select is((select count(*)::int from public.my_students()), 0, 'a student is not a mentor of anyone');
select lives_ok($$select public.save_mentor_access((select id from public.mentorships where student_id = auth.uid()), '{}'::uuid[], array['trades'])$$, 'the student can narrow access to nothing');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.mentee_trades), 0, 'and the mentor loses it immediately');
reset role;

-- a mentor-sent invite: the student picks the journals and scopes at acceptance
select pg_temp.act('00000000-0000-0000-0000-0000000000b4');
create temp table inv2 (token text);
grant all on inv2 to public;
insert into inv2 select public.create_mentor_invite('mentor');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.accept_mentor_invite((select token from inv2), array['90000000-0000-0000-0000-000000000001']::uuid[])$$, '42501', null, 'a student cannot share a journal that is not theirs');
select throws_ok($$select public.accept_mentor_invite((select token from inv2), '{}'::uuid[])$$, '22023', null, 'and must choose at least one');
select throws_ok($$select public.accept_mentor_invite((select token from inv2), array['90000000-0000-0000-0000-000000000002']::uuid[], array['everything'])$$, '22023', null, 'unknown scopes are refused');
select lives_ok($$select public.accept_mentor_invite((select token from inv2), array['90000000-0000-0000-0000-000000000002']::uuid[], array['screenshots'])$$, 'the student accepts a mentor''s invite and chooses what to share');
select is((select scopes from public.journal_access ja join public.mentorships m on m.id = ja.mentorship_id where m.mentor_id = '00000000-0000-0000-0000-0000000000b4' and ja.journal_id = '90000000-0000-0000-0000-000000000002'),
          array['trades', 'screenshots', 'money'], 'trades and money are always part of a grant in Phase 1');
select is(public.pause_all_mentors(), 1, 'pause all mentors revokes every live grant the student still has');
reset role;

-- an expired invite is dead
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
create temp table inv3 (token text);
grant all on inv3 to public;
insert into inv3 select public.create_mentor_invite('student', array['90000000-0000-0000-0000-000000000002']::uuid[]);
reset role;
update public.mentorship_invites set expires_at = now() - interval '1 minute' where accepted_at is null and inviter_role = 'student';
select pg_temp.act('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$select public.accept_mentor_invite((select token from inv3))$$, 'P0001', null, 'an expired invite cannot be accepted');
reset role;

-- ---- ending a mentorship -------------------------------------------------------------------------------------------------------
select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.end_mentorship('a0000000-0000-0000-0000-000000000001')$$, 'a mentor can end the mentorship');
select is((select count(*)::int from public.mentee_trades), 0, 'and reads nothing afterwards');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.end_mentorship('a0000000-0000-0000-0000-000000000004')$$, '42501', null, 'a stranger cannot end someone else''s mentorship');
reset role;

select * from finish();
rollback;
