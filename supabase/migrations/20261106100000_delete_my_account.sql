-- Self-service account deletion.
-- delete_my_account() removes the signed-in user's journals (every table below a journal cascades), their profile and the sign-in
-- itself. The screenshot files are removed by the app first (Storage API, with the user's own session); any it could not remove
-- are still queued in storage_cleanup by the delete trigger on trade_screenshots, and the scheduled sweep empties that queue.
-- Only the caller's own account can be deleted: the id comes from the session, never from an argument.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  delete from public.journals where owner_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
