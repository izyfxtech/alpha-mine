-- Mentor-student access (Phase 1: foundation).
--
-- A student shares journals with a mentor, per journal and per scope, and can revoke at any time. There is no global mentor role: a
-- person is a mentor only through an active row in `mentorships`. Mentors NEVER read base tables. They read the `mentee_*` views below,
-- which join the caller's live grants (`my_grants`) and blank the money columns when the grant has no 'money' scope. The owner-only
-- policies on every existing table stay exactly as they are, so no existing write path or unfiltered select can touch another
-- person's rows.
--
-- Mentors write into a student's journal in exactly one place: `trade_feedback` (and its attachments). Every write to the access
-- tables goes through a security-definer function; the tables only grant SELECT.
--
-- Phase 1 keeps money always visible: `mentor_scopes()` adds 'money' to every grant. Phase 2 (R-only display) changes that one function
-- and the client; the views already redact, and mentor_access.test.sql proves it.

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Relationships and grants
-- ---------------------------------------------------------------------------------------------------------------------------------

create table public.mentorships (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'ended')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (mentor_id <> student_id),
  unique (mentor_id, student_id)
);
create index mentorships_student on public.mentorships (student_id);

create table public.journal_access (
  mentorship_id uuid not null references public.mentorships(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  scopes text[] not null default '{trades,screenshots,plans,money}'
    check (scopes <@ array['trades', 'screenshots', 'plans', 'notes', 'money'] and 'trades' = any (scopes)),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (mentorship_id, journal_id)
);
create index journal_access_journal on public.journal_access (journal_id);

-- Single-use invite. Only a SHA-256 hash of the token is stored, so a database reader cannot accept someone else's invite.
-- An invite sent by a student carries the journals and scopes they chose; an invite sent by a mentor leaves that choice to the student
-- at acceptance.
create table public.mentorship_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  inviter_role text not null check (inviter_role in ('mentor', 'student')),
  token_hash text not null unique,
  journal_ids uuid[] not null default '{}',
  scopes text[] not null default '{trades,screenshots,plans,money}',
  access_days int check (access_days is null or access_days between 1 and 3650),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index mentorship_invites_inviter on public.mentorship_invites (inviter_id);

alter table public.mentorships enable row level security;
alter table public.journal_access enable row level security;
alter table public.mentorship_invites enable row level security;

create policy "parties read" on public.mentorships for select to authenticated
  using (mentor_id = auth.uid() or student_id = auth.uid());
create policy "parties read" on public.journal_access for select to authenticated
  using (exists (select 1 from public.mentorships m
                  where m.id = mentorship_id and (m.mentor_id = auth.uid() or m.student_id = auth.uid())));
create policy "inviter reads" on public.mentorship_invites for select to authenticated
  using (inviter_id = auth.uid());

-- Reads only. The token hash is never granted. Supabase's default privileges give `authenticated` every right on a new
-- table, so start from nothing: RLS alone would be the only thing between a client and a write.
revoke all on public.mentorships, public.journal_access, public.mentorship_invites from public, anon, authenticated;
grant select on public.mentorships, public.journal_access to authenticated;
grant select (id, inviter_id, inviter_role, journal_ids, scopes, access_days, expires_at, accepted_by, accepted_at, revoked_at, created_at)
  on public.mentorship_invites to authenticated;
grant all on public.mentorships, public.journal_access, public.mentorship_invites to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Access checks
-- ---------------------------------------------------------------------------------------------------------------------------------

-- For row-level policies on small tables (feedback): one call per row is fine there.
create or replace function public.can_read_journal(_j uuid, _scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.journal_access a
    join public.mentorships m on m.id = a.mentorship_id
    where a.journal_id = _j and m.mentor_id = auth.uid() and m.status = 'active'
      and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
      and _scope = any (a.scopes))
$$;
revoke execute on function public.can_read_journal(uuid, text) from public, anon;
grant execute on function public.can_read_journal(uuid, text) to authenticated;

-- For the mentee_* views: the signed-in mentor's live grants, one small row per mentee journal. Joining to it lets Postgres resolve
-- access once per query instead of calling a function for every trade row.
create view public.my_grants as
select a.journal_id, a.scopes
  from public.journal_access a
  join public.mentorships m on m.id = a.mentorship_id
 where m.mentor_id = auth.uid() and m.status = 'active'
   and a.revoked_at is null and (a.expires_at is null or a.expires_at > now());
revoke all on public.my_grants from public, anon, authenticated;
grant select on public.my_grants to authenticated;

-- The scopes a grant really gets. Unknown names are an error. Phase 1 always includes 'money'; see the header.
create or replace function public.mentor_scopes(_s text[]) returns text[]
language plpgsql immutable set search_path = public as $$
declare valid text[] := array['trades', 'screenshots', 'plans', 'notes', 'money'];
begin
  if exists (select 1 from unnest(coalesce(_s, '{}')) x where x <> all (valid)) then
    raise exception 'Unknown access scope.' using errcode = '22023';
  end if;
  return array(select x from unnest(valid) x where x = any (coalesce(_s, '{}') || array['trades', 'money']));
end $$;
revoke execute on function public.mentor_scopes(text[]) from public, anon;
grant execute on function public.mentor_scopes(text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Views the mentor reads. Columns are listed explicitly where money or identifying data lives.
-- ---------------------------------------------------------------------------------------------------------------------------------

create view public.mentee_journals as
select j.id, j.owner_id, j.name, j.currency, j.markets, j.deposit_date, j.trade_type, j.auto_pnl, j.session_categories,
       j.disabled_session_categories, j.quantity_unit, j.created_at,
       case when 'money' = any (g.scopes) then j.starting_balance end as starting_balance,
       g.scopes
  from public.journals j
  join public.my_grants g on g.journal_id = j.id;
revoke all on public.mentee_journals from public, anon, authenticated;
grant select on public.mentee_journals to authenticated;

-- external_id (the broker ticket) is left out. Money columns are null without the 'money' scope.
create view public.mentee_trades as
select t.id, t.journal_id, t.instrument_id, t.setup_id, t.trading_plan_id, t.direction, t.trade_type, t.entry_at, t.exit_at,
       t.entry_price, t.exit_price, t.stop_loss, t.initial_stop, t.take_profit, t.high_price, t.low_price, t.otp_hit,
       t.notes, t.is_favorite, t.is_break_even, t.trade_no, t.pnl_manual, t.source, t.raw_symbol, t.created_at,
       case when 'money' = any (g.scopes) then t.quantity end as quantity,
       case when 'money' = any (g.scopes) then t.gross_pnl end as gross_pnl,
       case when 'money' = any (g.scopes) then t.fees end as fees,
       case when 'money' = any (g.scopes) then t.net_pnl end as net_pnl,
       case when 'money' = any (g.scopes) then t.risk_amount end as risk_amount,
       case when 'money' = any (g.scopes) then t.commission end as commission,
       case when 'money' = any (g.scopes) then t.swap end as swap,
       case when 'money' = any (g.scopes) then t.other_fees end as other_fees
  from public.trades t
  join public.my_grants g on g.journal_id = t.journal_id and 'trades' = any (g.scopes);
revoke all on public.mentee_trades from public, anon, authenticated;
grant select on public.mentee_trades to authenticated;

create view public.mentee_trade_executions as
select e.id, e.trade_id, e.journal_id, e.kind, e.side, e.price, e.executed_at, e.created_at,
       case when 'money' = any (g.scopes) then e.quantity end as quantity,
       case when 'money' = any (g.scopes) then e.commission end as commission,
       case when 'money' = any (g.scopes) then e.swap end as swap,
       case when 'money' = any (g.scopes) then e.fee end as fee
  from public.trade_executions e
  join public.my_grants g on g.journal_id = e.journal_id and 'trades' = any (g.scopes);
revoke all on public.mentee_trade_executions from public, anon, authenticated;
grant select on public.mentee_trade_executions to authenticated;

create view public.mentee_missed_trades as
select m.id, m.journal_id, m.instrument, m.setup, m.direction, m.occurred_at, m.entry_price, m.exit_at, m.exit_price,
       m.stop_loss, m.take_profit, m.trade_type,
       case when 'money' = any (g.scopes) then m.net_pnl end as net_pnl,
       case when 'money' = any (g.scopes) then m.quantity end as quantity
  from public.missed_trades m
  join public.my_grants g on g.journal_id = m.journal_id and 'trades' = any (g.scopes);
revoke all on public.mentee_missed_trades from public, anon, authenticated;
grant select on public.mentee_missed_trades to authenticated;

-- Tables with nothing money-related in them: the whole row, for the one scope that covers them. `t.*` is expanded when the view is
-- created, so a column added to the base table later does not appear here until a migration chooses to expose it.
do $$
declare r record;
begin
  for r in select * from (values
    ('instruments', 'trades'), ('setups', 'trades'), ('comment_definitions', 'trades'), ('trade_comments', 'trades'),
    ('trade_custom_stats', 'trades'), ('trade_rule_checks', 'trades'), ('custom_stat_categories', 'trades'),
    ('custom_stat_options', 'trades'),
    ('trade_screenshots', 'screenshots'),
    ('trading_plans', 'plans'), ('trading_rules', 'plans'),
    ('diary_sessions', 'notes'), ('notebook_pages', 'notes'), ('notebook_folders', 'notes'),
    ('journal_cashflows', 'money')
  ) as v(tbl, scope) loop
    execute format(
      'create view public.mentee_%1$s as select t.* from public.%1$I t join public.my_grants g on g.journal_id = t.journal_id and %2$L = any (g.scopes)',
      r.tbl, r.scope);
    execute format('revoke all on public.mentee_%I from public, anon, authenticated', r.tbl);
    execute format('grant select on public.mentee_%I to authenticated', r.tbl);
  end loop;
end $$;

-- Names for the people you share a mentorship with. `profiles` itself stays own-only.
create view public.profile_cards as
select p.id, p.display_name, p.avatar_url
  from public.profiles p
 where p.id = auth.uid()
    or exists (select 1 from public.mentorships m
                where m.status <> 'ended'
                  and ((m.mentor_id = auth.uid() and m.student_id = p.id)
                    or (m.student_id = auth.uid() and m.mentor_id = p.id)));
revoke all on public.profile_cards from public, anon, authenticated;
grant select on public.profile_cards to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Invites and grants: every write goes through one of these
-- ---------------------------------------------------------------------------------------------------------------------------------

create or replace function public.create_mentor_invite(
  _role text, _journal_ids uuid[] default '{}', _scopes text[] default null, _access_days int default 90, _valid_days int default 14
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if _role not in ('mentor', 'student') then raise exception 'Role must be mentor or student.' using errcode = '22023'; end if;
  if _valid_days is null or _valid_days not between 1 and 60 then raise exception 'An invite is valid for 1 to 60 days.' using errcode = '22023'; end if;
  if (select count(*) from public.mentorship_invites
       where inviter_id = uid and accepted_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'You already have 20 open invites. Revoke one first.' using errcode = '54000';
  end if;
  if _role = 'student' then
    -- The student chooses what to share now, because the mentor accepting will not be asked.
    if coalesce(cardinality(_journal_ids), 0) not between 1 and 50 then
      raise exception 'Choose at least one journal to share.' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(_journal_ids) j where not exists (select 1 from public.journals x where x.id = j and x.owner_id = uid)) then
      raise exception 'You can only share your own journals.' using errcode = '42501';
    end if;
  end if;
  insert into public.mentorship_invites (inviter_id, inviter_role, token_hash, journal_ids, scopes, access_days, expires_at)
  values (uid, _role, encode(sha256(convert_to(token, 'utf8')), 'hex'),
          case when _role = 'student' then _journal_ids else '{}' end,
          public.mentor_scopes(_scopes), _access_days, now() + make_interval(days => _valid_days));
  return token; -- shown once; only its hash is kept
end $$;

-- Who sent an invite and what it offers, so the person opening the link can decide. Not a lookup of other people's invites: it needs
-- the whole token.
create or replace function public.preview_mentor_invite(_token text)
returns table (inviter_role text, inviter_name text, journal_count int, expires_at timestamptz, usable boolean)
language sql stable security definer set search_path = public as $$
  select i.inviter_role, coalesce(nullif(btrim(p.display_name), ''), 'Someone'), coalesce(cardinality(i.journal_ids), 0),
         i.expires_at, (i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.inviter_id <> auth.uid())
    from public.mentorship_invites i
    left join public.profiles p on p.id = i.inviter_id
   where auth.uid() is not null and i.token_hash = encode(sha256(convert_to(_token, 'utf8')), 'hex')
$$;

create or replace function public.accept_mentor_invite(
  _token text, _journal_ids uuid[] default null, _scopes text[] default null, _access_days int default 90
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.mentorship_invites;
  v_mentor uuid; v_student uuid; v_ids uuid[]; v_scopes text[]; v_days int; v_ms uuid; v_exp timestamptz;
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  select * into inv from public.mentorship_invites
   where token_hash = encode(sha256(convert_to(_token, 'utf8')), 'hex') for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now() then
    raise exception 'This invite is not valid any more.' using errcode = 'P0001';
  end if;
  if inv.inviter_id = uid then raise exception 'You cannot accept your own invite.' using errcode = '42501'; end if;

  if inv.inviter_role = 'mentor' then
    v_mentor := inv.inviter_id; v_student := uid;
    v_ids := _journal_ids; v_scopes := _scopes; v_days := _access_days; -- the student chooses now
    if coalesce(cardinality(v_ids), 0) not between 1 and 50 then
      raise exception 'Choose at least one journal to share.' using errcode = '22023';
    end if;
  else
    v_mentor := uid; v_student := inv.inviter_id;
    v_ids := inv.journal_ids; v_scopes := inv.scopes; v_days := inv.access_days; -- the student chose when sending
  end if;
  -- Whoever sent it, only the student's own journals can be shared.
  if exists (select 1 from unnest(v_ids) j where not exists (select 1 from public.journals x where x.id = j and x.owner_id = v_student)) then
    raise exception 'Only the student''s own journals can be shared.' using errcode = '42501';
  end if;
  v_scopes := public.mentor_scopes(v_scopes);
  v_exp := case when v_days is null then null else now() + make_interval(days => v_days) end;

  insert into public.mentorships (mentor_id, student_id, status, created_by)
  values (v_mentor, v_student, 'active', inv.inviter_id)
  on conflict (mentor_id, student_id) do update set status = 'active', ended_at = null
  returning id into v_ms;

  insert into public.journal_access (mentorship_id, journal_id, scopes, expires_at)
  select v_ms, j, v_scopes, v_exp from unnest(v_ids) j
  on conflict (mentorship_id, journal_id)
    do update set scopes = excluded.scopes, expires_at = excluded.expires_at, revoked_at = null;

  update public.mentorship_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  insert into public.notifications (user_id, kind, ref_id, meta)
  values (inv.inviter_id, 'invite_accepted', v_ms,
          jsonb_build_object('by', coalesce((select nullif(btrim(display_name), '') from public.profiles where id = uid), 'Someone')));
  return v_ms;
end $$;

create or replace function public.revoke_mentor_invite(_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.mentorship_invites set revoked_at = now()
   where id = _id and inviter_id = auth.uid() and accepted_at is null and revoked_at is null
$$;

-- The student replaces what one mentor can see: these journals with these scopes, everything else revoked.
create or replace function public.save_mentor_access(_mentorship uuid, _journal_ids uuid[], _scopes text[], _access_days int default 90)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_scopes text[]; v_exp timestamptz;
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if not exists (select 1 from public.mentorships where id = _mentorship and student_id = uid and status = 'active') then
    raise exception 'No such mentorship.' using errcode = '42501';
  end if;
  if coalesce(cardinality(_journal_ids), 0) > 50 then raise exception 'Too many journals.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(_journal_ids, '{}')) j where not exists (select 1 from public.journals x where x.id = j and x.owner_id = uid)) then
    raise exception 'You can only share your own journals.' using errcode = '42501';
  end if;
  v_scopes := public.mentor_scopes(_scopes);
  v_exp := case when _access_days is null then null else now() + make_interval(days => _access_days) end;
  insert into public.journal_access (mentorship_id, journal_id, scopes, expires_at)
  select _mentorship, j, v_scopes, v_exp from unnest(coalesce(_journal_ids, '{}')) j
  on conflict (mentorship_id, journal_id)
    do update set scopes = excluded.scopes, expires_at = excluded.expires_at, revoked_at = null;
  update public.journal_access set revoked_at = now()
   where mentorship_id = _mentorship and revoked_at is null and journal_id <> all (coalesce(_journal_ids, '{}'));
end $$;

-- Either side can end a mentorship; every grant under it stops working at once.
create or replace function public.end_mentorship(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update public.mentorships set status = 'ended', ended_at = now()
   where id = _id and (mentor_id = uid or student_id = uid) and status <> 'ended';
  if not found then raise exception 'No such mentorship.' using errcode = '42501'; end if;
  update public.journal_access set revoked_at = now() where mentorship_id = _id and revoked_at is null;
end $$;

-- "Pause all mentors": the student's one switch. Mirrors how turning off sharing kills share links.
create or replace function public.pause_all_mentors() returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update public.journal_access a set revoked_at = now()
    from public.mentorships m
   where m.id = a.mentorship_id and m.student_id = uid and a.revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- The mentor's student list, from live counts. Win and P&L figures need the 'money' scope.
create or replace function public.my_students()
returns table (mentorship_id uuid, student_id uuid, student_name text, journal_id uuid, journal_name text, currency text,
               scopes text[], expires_at timestamptz, trades bigint, wins bigint, net_pnl numeric, last_trade_at timestamptz,
               open_threads bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select m.id, m.student_id, coalesce(nullif(btrim(p.display_name), ''), 'Student'), a.journal_id, j.name, j.currency, a.scopes,
         a.expires_at, s.n, case when 'money' = any (a.scopes) then s.wins end, case when 'money' = any (a.scopes) then s.net end,
         s.last_at,
         (select count(*) from public.trade_feedback f
           where f.journal_id = a.journal_id and f.parent_id is null and f.resolved_at is null and f.author_id = auth.uid())
    from public.mentorships m
    join public.journal_access a on a.mentorship_id = m.id
    join public.journals j on j.id = a.journal_id
    left join public.profiles p on p.id = m.student_id
    cross join lateral (
      select count(*) as n, count(*) filter (where t.net_pnl > 0) as wins, sum(t.net_pnl) as net, max(t.entry_at) as last_at
        from public.trades t where t.journal_id = a.journal_id and t.exit_at is not null) s
   where m.mentor_id = auth.uid() and m.status = 'active'
     and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
   order by s.last_at desc nulls last, j.name;
end $$;

revoke execute on function
  public.create_mentor_invite(text, uuid[], text[], int, int), public.preview_mentor_invite(text),
  public.accept_mentor_invite(text, uuid[], text[], int), public.revoke_mentor_invite(uuid),
  public.save_mentor_access(uuid, uuid[], text[], int), public.end_mentorship(uuid), public.pause_all_mentors(),
  public.my_students()
  from public, anon;
grant execute on function
  public.create_mentor_invite(text, uuid[], text[], int, int), public.preview_mentor_invite(text),
  public.accept_mentor_invite(text, uuid[], text[], int), public.revoke_mentor_invite(uuid),
  public.save_mentor_access(uuid, uuid[], text[], int), public.end_mentorship(uuid), public.pause_all_mentors(),
  public.my_students()
  to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Feedback: the one table a mentor writes into a student's journal
-- ---------------------------------------------------------------------------------------------------------------------------------

create table public.trade_feedback (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  target_type text not null check (target_type in ('trade', 'diary_session', 'journal')),
  target_id uuid,
  parent_id uuid references public.trade_feedback(id) on delete cascade,
  -- Set to null when the author deletes their account; author_name keeps the coaching history readable.
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  body text not null check (length(btrim(body)) between 1 and 4000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_type = 'journal') = (target_id is null))
);
create index trade_feedback_target on public.trade_feedback (journal_id, target_type, target_id, created_at);
create index trade_feedback_author on public.trade_feedback (author_id, created_at);
alter table public.trade_feedback enable row level security;

create policy "read" on public.trade_feedback for select to authenticated
  using (public.owns_journal(journal_id) or public.can_read_journal(journal_id, 'trades'));

create policy "write" on public.trade_feedback for insert to authenticated
  with check (author_id = auth.uid() and (
    public.owns_journal(journal_id)
    or (public.can_read_journal(journal_id, 'trades')
        and (target_type <> 'diary_session' or public.can_read_journal(journal_id, 'notes')))));

revoke all on public.trade_feedback from public, anon, authenticated;
grant select, insert on public.trade_feedback to authenticated;
grant all on public.trade_feedback to service_role;

-- Checks the client cannot be trusted with: the name, the target and the thread; and a cap, because writes go straight to the database
-- and never pass the Worker's rate limiter.
create or replace function public.trade_feedback_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.trade_feedback;
begin
  if (select count(*) from public.trade_feedback where author_id = new.author_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too much feedback in the last hour. Try again later.' using errcode = '54000';
  end if;
  new.author_name := coalesce(nullif(btrim((select display_name from public.profiles where id = new.author_id)), ''), 'Mentor');
  if new.target_type = 'trade' and not exists (select 1 from public.trades where id = new.target_id and journal_id = new.journal_id) then
    raise exception 'That trade is not in this journal.' using errcode = '23514';
  end if;
  if new.target_type = 'diary_session' and not exists (select 1 from public.diary_sessions where id = new.target_id and journal_id = new.journal_id) then
    raise exception 'That session is not in this journal.' using errcode = '23514';
  end if;
  if new.parent_id is not null then
    select * into p from public.trade_feedback where id = new.parent_id;
    if not found or p.journal_id <> new.journal_id or p.parent_id is not null
       or p.target_type <> new.target_type or p.target_id is distinct from new.target_id then
      raise exception 'That reply does not belong to this thread.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trade_feedback_guard before insert on public.trade_feedback
  for each row execute function public.trade_feedback_guard();

-- Authors edit or delete their own rows for 15 minutes; the journal owner can delete any row, and resolve any thread.
create or replace function public.edit_feedback(_id uuid, _body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trade_feedback set body = _body
   where id = _id and author_id = auth.uid() and created_at > now() - interval '15 minutes';
  if not found then raise exception 'Feedback can only be edited by its author for 15 minutes.' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_feedback(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.trade_feedback f
   where f.id = _id and (public.owns_journal(f.journal_id)
         or (f.author_id = auth.uid() and f.created_at > now() - interval '15 minutes'));
  if not found then raise exception 'You cannot delete this feedback.' using errcode = '42501'; end if;
end $$;

create or replace function public.resolve_feedback(_id uuid, _resolved boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trade_feedback f set resolved_at = case when _resolved then now() end
   where f.id = _id and f.parent_id is null and (public.owns_journal(f.journal_id) or f.author_id = auth.uid());
  if not found then raise exception 'You cannot resolve this thread.' using errcode = '42501'; end if;
end $$;

revoke execute on function public.edit_feedback(uuid, text), public.delete_feedback(uuid), public.resolve_feedback(uuid, boolean)
  from public, anon;
grant execute on function public.edit_feedback(uuid, text), public.delete_feedback(uuid), public.resolve_feedback(uuid, boolean)
  to authenticated;
revoke execute on function public.trade_feedback_guard() from public, anon, authenticated;

-- Images a mentor adds to feedback. The file lives in the mentor's own folder (<mentor id>/...) like every upload.
create table public.feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.trade_feedback(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index feedback_attachments_feedback on public.feedback_attachments (feedback_id);
create index feedback_attachments_path on public.feedback_attachments (path);
alter table public.feedback_attachments enable row level security;

create policy "read" on public.feedback_attachments for select to authenticated
  using (public.owns_journal(journal_id) or public.can_read_journal(journal_id, 'trades'));
create policy "author adds" on public.feedback_attachments for insert to authenticated
  with check (path like auth.uid()::text || '/%'
    and exists (select 1 from public.trade_feedback f
                 where f.id = feedback_id and f.journal_id = feedback_attachments.journal_id and f.author_id = auth.uid()));
revoke all on public.feedback_attachments from public, anon, authenticated;
grant select, insert on public.feedback_attachments to authenticated;
grant all on public.feedback_attachments to service_role;

create or replace function public.feedback_attachment_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback_attachments where feedback_id = new.feedback_id) >= 4 then
    raise exception 'Feedback can have at most 4 images.' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger feedback_attachment_cap before insert on public.feedback_attachments
  for each row execute function public.feedback_attachment_cap();

-- Same queue the screenshots use: when the row goes, the file and its preview are removed (once nothing else points at the path).
create or replace function public.queue_feedback_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.path !~* '^https?:' and not exists (select 1 from public.feedback_attachments a where a.path = old.path and a.id <> old.id) then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path), ('screenshots', old.path || '.thumb.webp')
    on conflict do nothing;
  end if;
  return old;
end $$;
create trigger feedback_attachments_queue_file after delete on public.feedback_attachments
  for each row execute function public.queue_feedback_file();
revoke execute on function public.feedback_attachment_cap(), public.queue_feedback_file() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Notifications: an in-app badge. Rows are written by triggers and functions only; a user can read theirs and mark them read.
-- ---------------------------------------------------------------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('feedback', 'invite_accepted')),
  journal_id uuid references public.journals(id) on delete cascade,
  ref_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
create policy "own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- New feedback tells everyone else who can see the journal: its owner, and mentors with an active 'trades' grant.
create or replace function public.notify_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, journal_id, ref_id, meta)
  select distinct r.uid, 'feedback', new.journal_id, new.id,
         jsonb_build_object('target_type', new.target_type, 'target_id', new.target_id, 'author', new.author_name,
                            'snippet', left(new.body, 120))
    from (
      select j.owner_id as uid from public.journals j where j.id = new.journal_id
      union
      select m.mentor_id from public.journal_access a join public.mentorships m on m.id = a.mentorship_id
       where a.journal_id = new.journal_id and m.status = 'active' and a.revoked_at is null
         and (a.expires_at is null or a.expires_at > now()) and 'trades' = any (a.scopes)
    ) r
   where r.uid is distinct from new.author_id;
  return new;
end $$;
create trigger trade_feedback_notify after insert on public.trade_feedback
  for each row execute function public.notify_feedback();
revoke execute on function public.notify_feedback() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Screenshots: which of these paths may the caller see? The Worker asks this with the caller's own session and signs only what comes
-- back, so the grant rules live in the database and nowhere else. A preview (<path>.thumb.webp) follows its original.
-- ---------------------------------------------------------------------------------------------------------------------------------

create index if not exists trade_screenshots_path on public.trade_screenshots (path);

create or replace function public.visible_screenshot_paths(_paths text[]) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  if coalesce(cardinality(_paths), 0) > 200 then raise exception 'Too many paths.' using errcode = '22023'; end if;
  return coalesce((
    select array_agg(distinct p)
      from unnest(coalesce(_paths, '{}')) p
     where exists (select 1 from public.trade_screenshots s
                    where s.path = regexp_replace(p, '\.thumb\.webp$', '')
                      and (public.owns_journal(s.journal_id) or public.can_read_journal(s.journal_id, 'screenshots')))
        or exists (select 1 from public.feedback_attachments a
                    where a.path = regexp_replace(p, '\.thumb\.webp$', '')
                      and (public.owns_journal(a.journal_id) or public.can_read_journal(a.journal_id, 'trades')))
  ), '{}');
end $$;
revoke execute on function public.visible_screenshot_paths(text[]) from public, anon;
grant execute on function public.visible_screenshot_paths(text[]) to authenticated;

notify pgrst, 'reload schema';
