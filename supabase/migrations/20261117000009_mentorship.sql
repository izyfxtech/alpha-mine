-- Mentors: invites, grants, read-only mentee views, trade feedback and notifications.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.trade_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    parent_id uuid,
    author_id uuid,
    author_name text DEFAULT ''::text NOT NULL,
    body text NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_feedback_pkey PRIMARY KEY (id),
    CONSTRAINT trade_feedback_body_check CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 4000))),
    CONSTRAINT trade_feedback_check CHECK (((target_type = 'journal'::text) = (target_id IS NULL))),
    CONSTRAINT trade_feedback_target_type_check CHECK ((target_type = ANY (ARRAY['trade'::text, 'diary_session'::text, 'journal'::text]))),
    CONSTRAINT trade_feedback_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT trade_feedback_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_feedback_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.trade_feedback(id) ON DELETE CASCADE
);

CREATE INDEX trade_feedback_author ON public.trade_feedback USING btree (author_id, created_at);

CREATE INDEX trade_feedback_target ON public.trade_feedback USING btree (journal_id, target_type, target_id, created_at);

CREATE TABLE public.feedback_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    path text NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT feedback_attachments_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.trade_feedback(id) ON DELETE CASCADE,
    CONSTRAINT feedback_attachments_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE INDEX feedback_attachments_feedback ON public.feedback_attachments USING btree (feedback_id);

CREATE INDEX feedback_attachments_path ON public.feedback_attachments USING btree (path);

CREATE TABLE public.mentorships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT mentorships_pkey PRIMARY KEY (id),
    CONSTRAINT mentorships_mentor_id_student_id_key UNIQUE (mentor_id, student_id),
    CONSTRAINT mentorships_check CHECK ((mentor_id <> student_id)),
    CONSTRAINT mentorships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'ended'::text]))),
    CONSTRAINT mentorships_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT mentorships_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX mentorships_student ON public.mentorships USING btree (student_id);

CREATE TABLE public.journal_access (
    mentorship_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    scopes text[] DEFAULT '{trades,screenshots,plans,money}'::text[] NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_access_pkey PRIMARY KEY (mentorship_id, journal_id),
    CONSTRAINT journal_access_scopes_check CHECK (((scopes <@ ARRAY['trades'::text, 'screenshots'::text, 'plans'::text, 'notes'::text, 'money'::text]) AND ('trades'::text = ANY (scopes)))),
    CONSTRAINT journal_access_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT journal_access_mentorship_id_fkey FOREIGN KEY (mentorship_id) REFERENCES public.mentorships(id) ON DELETE CASCADE
);

CREATE INDEX journal_access_journal ON public.journal_access USING btree (journal_id);

CREATE TABLE public.mentorship_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_id uuid DEFAULT auth.uid() NOT NULL,
    inviter_role text NOT NULL,
    token_hash text NOT NULL,
    journal_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    scopes text[] DEFAULT '{trades,screenshots,plans,money}'::text[] NOT NULL,
    access_days integer,
    expires_at timestamp with time zone NOT NULL,
    accepted_by uuid,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mentorship_invites_pkey PRIMARY KEY (id),
    CONSTRAINT mentorship_invites_token_hash_key UNIQUE (token_hash),
    CONSTRAINT mentorship_invites_access_days_check CHECK (((access_days IS NULL) OR ((access_days >= 1) AND (access_days <= 3650)))),
    CONSTRAINT mentorship_invites_inviter_role_check CHECK ((inviter_role = ANY (ARRAY['mentor'::text, 'student'::text]))),
    CONSTRAINT mentorship_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT mentorship_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX mentorship_invites_inviter ON public.mentorship_invites USING btree (inviter_id);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    journal_id uuid,
    ref_id uuid,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_kind_check CHECK ((kind = ANY (ARRAY['feedback'::text, 'invite_accepted'::text]))),
    CONSTRAINT notifications_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX notifications_user ON public.notifications USING btree (user_id, read_at, created_at DESC);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.accept_mentor_invite(
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

create function public.can_read_journal(_j uuid, _scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.journal_access a
    join public.mentorships m on m.id = a.mentorship_id
    where a.journal_id = _j and m.mentor_id = auth.uid() and m.status = 'active'
      and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
      and _scope = any (a.scopes))
$$;

create function public.create_mentor_invite(
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

create function public.delete_feedback(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.trade_feedback f
   where f.id = _id and (public.owns_journal(f.journal_id)
         or (f.author_id = auth.uid() and f.created_at > now() - interval '15 minutes'));
  if not found then raise exception 'You cannot delete this feedback.' using errcode = '42501'; end if;
end $$;

create function public.edit_feedback(_id uuid, _body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trade_feedback set body = _body
   where id = _id and author_id = auth.uid() and created_at > now() - interval '15 minutes';
  if not found then raise exception 'Feedback can only be edited by its author for 15 minutes.' using errcode = '42501'; end if;
end $$;

create function public.end_mentorship(_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update public.mentorships set status = 'ended', ended_at = now()
   where id = _id and (mentor_id = uid or student_id = uid) and status <> 'ended';
  if not found then raise exception 'No such mentorship.' using errcode = '42501'; end if;
  update public.journal_access set revoked_at = now() where mentorship_id = _id and revoked_at is null;
end $$;

create function public.feedback_attachment_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback_attachments where feedback_id = new.feedback_id) >= 4 then
    raise exception 'Feedback can have at most 4 images.' using errcode = '54000';
  end if;
  return new;
end $$;

create function public.mentor_scopes(_s text[]) returns text[]
language plpgsql immutable set search_path = public as $$
declare valid text[] := array['trades', 'screenshots', 'plans', 'notes', 'money'];
begin
  if exists (select 1 from unnest(coalesce(_s, '{}')) x where x <> all (valid)) then
    raise exception 'Unknown access scope.' using errcode = '22023';
  end if;
  return array(select x from unnest(valid) x where x = any (coalesce(_s, '{}') || array['trades', 'money']));
end $$;

create function public.my_students()
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

create function public.notify_feedback() returns trigger
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

create function public.pause_all_mentors() returns int
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

create function public.preview_mentor_invite(_token text)
returns table (inviter_role text, inviter_name text, journal_count int, expires_at timestamptz, usable boolean)
language sql stable security definer set search_path = public as $$
  select i.inviter_role, coalesce(nullif(btrim(p.display_name), ''), 'Someone'), coalesce(cardinality(i.journal_ids), 0),
         i.expires_at, (i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.inviter_id <> auth.uid())
    from public.mentorship_invites i
    left join public.profiles p on p.id = i.inviter_id
   where auth.uid() is not null and i.token_hash = encode(sha256(convert_to(_token, 'utf8')), 'hex')
$$;

create function public.queue_feedback_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.path !~* '^https?:' and not exists (select 1 from public.feedback_attachments a where a.path = old.path and a.id <> old.id) then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path), ('screenshots', old.path || '.thumb.webp')
    on conflict do nothing;
  end if;
  return old;
end $$;

create function public.resolve_feedback(_id uuid, _resolved boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trade_feedback f set resolved_at = case when _resolved then now() end
   where f.id = _id and f.parent_id is null and (public.owns_journal(f.journal_id) or f.author_id = auth.uid());
  if not found then raise exception 'You cannot resolve this thread.' using errcode = '42501'; end if;
end $$;

create function public.revoke_mentor_invite(_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.mentorship_invites set revoked_at = now()
   where id = _id and inviter_id = auth.uid() and accepted_at is null and revoked_at is null
$$;

create function public.save_mentor_access(_mentorship uuid, _journal_ids uuid[], _scopes text[], _access_days int default 90)
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

create function public.trade_feedback_guard() returns trigger
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

create function public.visible_screenshot_paths(_paths text[]) returns text[]
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

-- --------------------------------------------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------------------------------------------

CREATE TRIGGER feedback_attachment_cap BEFORE INSERT ON public.feedback_attachments FOR EACH ROW EXECUTE FUNCTION public.feedback_attachment_cap();

CREATE TRIGGER feedback_attachments_queue_file AFTER DELETE ON public.feedback_attachments FOR EACH ROW EXECUTE FUNCTION public.queue_feedback_file();

CREATE TRIGGER trade_feedback_guard BEFORE INSERT ON public.trade_feedback FOR EACH ROW EXECUTE FUNCTION public.trade_feedback_guard();

CREATE TRIGGER trade_feedback_notify AFTER INSERT ON public.trade_feedback FOR EACH ROW EXECUTE FUNCTION public.notify_feedback();

-- --------------------------------------------------------------------------------------------------------------
-- Views
-- --------------------------------------------------------------------------------------------------------------

-- For the mentee_* views: the signed-in mentor's live grants, one small row per mentee journal. Joining to it lets Postgres resolve
-- access once per query instead of calling a function for every trade row.
create view public.my_grants as
select a.journal_id, a.scopes
  from public.journal_access a
  join public.mentorships m on m.id = a.mentorship_id
 where m.mentor_id = auth.uid() and m.status = 'active'
   and a.revoked_at is null and (a.expires_at is null or a.expires_at > now());

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

create view public.mentee_trade_executions as
select e.id, e.trade_id, e.journal_id, e.kind, e.side, e.price, e.executed_at, e.created_at,
       case when 'money' = any (g.scopes) then e.quantity end as quantity,
       case when 'money' = any (g.scopes) then e.commission end as commission,
       case when 'money' = any (g.scopes) then e.swap end as swap,
       case when 'money' = any (g.scopes) then e.fee end as fee
  from public.trade_executions e
  join public.my_grants g on g.journal_id = e.journal_id and 'trades' = any (g.scopes);

create view public.mentee_missed_trades as
select m.id, m.journal_id, m.instrument, m.setup, m.direction, m.occurred_at, m.entry_price, m.exit_at, m.exit_price,
       m.stop_loss, m.take_profit, m.trade_type,
       case when 'money' = any (g.scopes) then m.net_pnl end as net_pnl,
       case when 'money' = any (g.scopes) then m.quantity end as quantity
  from public.missed_trades m
  join public.my_grants g on g.journal_id = m.journal_id and 'trades' = any (g.scopes);

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

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.trade_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY read ON public.trade_feedback FOR SELECT TO authenticated USING ((public.owns_journal(journal_id) OR public.can_read_journal(journal_id, 'trades'::text)));

CREATE POLICY write ON public.trade_feedback FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND (public.owns_journal(journal_id) OR (public.can_read_journal(journal_id, 'trades'::text) AND ((target_type <> 'diary_session'::text) OR public.can_read_journal(journal_id, 'notes'::text))))));

ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "author adds" ON public.feedback_attachments FOR INSERT TO authenticated WITH CHECK (((path ~~ ((auth.uid())::text || '/%'::text)) AND (EXISTS ( SELECT 1
   FROM public.trade_feedback f
  WHERE ((f.id = feedback_attachments.feedback_id) AND (f.journal_id = feedback_attachments.journal_id) AND (f.author_id = auth.uid()))))));

CREATE POLICY read ON public.feedback_attachments FOR SELECT TO authenticated USING ((public.owns_journal(journal_id) OR public.can_read_journal(journal_id, 'trades'::text)));

ALTER TABLE public.mentorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties read" ON public.mentorships FOR SELECT TO authenticated USING (((mentor_id = auth.uid()) OR (student_id = auth.uid())));

ALTER TABLE public.journal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties read" ON public.journal_access FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.mentorships m
  WHERE ((m.id = journal_access.mentorship_id) AND ((m.mentor_id = auth.uid()) OR (m.student_id = auth.uid()))))));

ALTER TABLE public.mentorship_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inviter reads" ON public.mentorship_invites FOR SELECT TO authenticated USING ((inviter_id = auth.uid()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own mark read" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "own read" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.trade_feedback, public.feedback_attachments from public, anon, authenticated;
grant select, insert on public.trade_feedback, public.feedback_attachments to authenticated;
grant all on public.trade_feedback, public.feedback_attachments to service_role;

revoke all on public.mentorships, public.journal_access, public.notifications from public, anon, authenticated;
grant select on public.mentorships, public.journal_access, public.notifications to authenticated;
grant all on public.mentorships, public.journal_access, public.notifications to service_role;

revoke all on public.mentorship_invites from public, anon, authenticated;
grant all on public.mentorship_invites to service_role;

revoke all on public.mentee_comment_definitions, public.mentee_custom_stat_categories, public.mentee_custom_stat_options, public.mentee_diary_sessions, public.mentee_instruments, public.mentee_journal_cashflows, public.mentee_journals, public.mentee_missed_trades, public.mentee_notebook_folders, public.mentee_notebook_pages, public.mentee_setups, public.mentee_trade_comments, public.mentee_trade_custom_stats, public.mentee_trade_executions, public.mentee_trade_rule_checks, public.mentee_trade_screenshots, public.mentee_trades, public.mentee_trading_plans, public.mentee_trading_rules, public.my_grants, public.profile_cards from public, anon, authenticated;
grant select on public.mentee_comment_definitions, public.mentee_custom_stat_categories, public.mentee_custom_stat_options, public.mentee_diary_sessions, public.mentee_instruments, public.mentee_journal_cashflows, public.mentee_journals, public.mentee_missed_trades, public.mentee_notebook_folders, public.mentee_notebook_pages, public.mentee_setups, public.mentee_trade_comments, public.mentee_trade_custom_stats, public.mentee_trade_executions, public.mentee_trade_rule_checks, public.mentee_trade_screenshots, public.mentee_trades, public.mentee_trading_plans, public.mentee_trading_rules, public.my_grants, public.profile_cards to authenticated;

grant select (accepted_at, accepted_by, access_days, created_at, expires_at, id, inviter_id, inviter_role, journal_ids, revoked_at, scopes) on public.mentorship_invites to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.accept_mentor_invite(text, uuid[], text[], integer) from public, anon, authenticated;
grant execute on function public.accept_mentor_invite(text, uuid[], text[], integer) to authenticated, service_role;

revoke all on function public.can_read_journal(uuid, text) from public, anon, authenticated;
grant execute on function public.can_read_journal(uuid, text) to authenticated, service_role;

revoke all on function public.create_mentor_invite(text, uuid[], text[], integer, integer) from public, anon, authenticated;
grant execute on function public.create_mentor_invite(text, uuid[], text[], integer, integer) to authenticated, service_role;

revoke all on function public.delete_feedback(uuid) from public, anon, authenticated;
grant execute on function public.delete_feedback(uuid) to authenticated, service_role;

revoke all on function public.edit_feedback(uuid, text) from public, anon, authenticated;
grant execute on function public.edit_feedback(uuid, text) to authenticated, service_role;

revoke all on function public.end_mentorship(uuid) from public, anon, authenticated;
grant execute on function public.end_mentorship(uuid) to authenticated, service_role;

revoke all on function public.feedback_attachment_cap() from public, anon, authenticated;

revoke all on function public.mentor_scopes(text[]) from public, anon, authenticated;
grant execute on function public.mentor_scopes(text[]) to authenticated, service_role;

revoke all on function public.my_students() from public, anon, authenticated;
grant execute on function public.my_students() to authenticated, service_role;

revoke all on function public.notify_feedback() from public, anon, authenticated;

revoke all on function public.pause_all_mentors() from public, anon, authenticated;
grant execute on function public.pause_all_mentors() to authenticated, service_role;

revoke all on function public.preview_mentor_invite(text) from public, anon, authenticated;
grant execute on function public.preview_mentor_invite(text) to authenticated, service_role;

revoke all on function public.queue_feedback_file() from public, anon, authenticated;

revoke all on function public.resolve_feedback(uuid, boolean) from public, anon, authenticated;
grant execute on function public.resolve_feedback(uuid, boolean) to authenticated, service_role;

revoke all on function public.revoke_mentor_invite(uuid) from public, anon, authenticated;
grant execute on function public.revoke_mentor_invite(uuid) to authenticated, service_role;

revoke all on function public.save_mentor_access(uuid, uuid[], text[], integer) from public, anon, authenticated;
grant execute on function public.save_mentor_access(uuid, uuid[], text[], integer) to authenticated, service_role;

revoke all on function public.trade_feedback_guard() from public, anon, authenticated;

revoke all on function public.visible_screenshot_paths(text[]) from public, anon, authenticated;
grant execute on function public.visible_screenshot_paths(text[]) to authenticated, service_role;
