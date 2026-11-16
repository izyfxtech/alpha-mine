-- Mentor tables and views: start from no privileges, then grant exactly what the app needs.
--
-- Supabase's default privileges give `authenticated` (and `anon`) every right on each new table and view, so the
-- grants in 20261107090000_mentorship.sql only added to them: the column-level select on mentorship_invites (no
-- token_hash) and the read-only grant on journal_access restricted nothing. Row-level security still held, but a
-- grant is a second lock. That migration is already applied in places, so the fix is a new one. Safe to run twice.

revoke all on public.mentorships, public.journal_access, public.mentorship_invites,
              public.trade_feedback, public.feedback_attachments, public.notifications
  from public, anon, authenticated;

grant select on public.mentorships, public.journal_access to authenticated;
grant select (id, inviter_id, inviter_role, journal_ids, scopes, access_days, expires_at, accepted_by, accepted_at, revoked_at, created_at)
  on public.mentorship_invites to authenticated;
grant select, insert on public.trade_feedback to authenticated;
grant select, insert on public.feedback_attachments to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Every view the mentor features read through: my_grants, profile_cards and all mentee_* views are select-only.
do $$
declare v text;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and (c.relname in ('my_grants', 'profile_cards') or c.relname like 'mentee\_%')
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

notify pgrst, 'reload schema';
