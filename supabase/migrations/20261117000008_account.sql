-- Journal creation and account deletion.

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.create_journal(
  _journal jsonb, _comments jsonb default '[]'::jsonb, _stats jsonb default '[]'::jsonb, _setups jsonb default '[]'::jsonb, _only_if_none boolean default false)
returns public.journals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  j public.journals;
  c record;
  v_cat uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('create_journal:' || v_uid::text, 0));
  if _only_if_none then
    select * into j from public.journals where owner_id = v_uid order by created_at limit 1;
    if found then return j; end if;
  end if;

  insert into public.journals (name, starting_balance, currency, broker, markets, deposit_date, trade_type, quantity_unit)
  values (
    coalesce(nullif(trim(_journal ->> 'name'), ''), 'Trading Journal'),
    coalesce((_journal ->> 'starting_balance')::numeric, 10000),
    upper(coalesce(nullif(_journal ->> 'currency', ''), 'USD')),
    nullif(_journal ->> 'broker', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(_journal -> 'markets', '[]'::jsonb))), '{}'::text[]),
    nullif(_journal ->> 'deposit_date', '')::date,
    coalesce(nullif(_journal ->> 'trade_type', ''), 'Spot'),
    nullif(_journal ->> 'quantity_unit', ''))
  returning * into j;

  insert into public.comment_definitions (journal_id, phase, label, sentiment, position)
  select j.id, t.c ->> 'phase', t.c ->> 'label', coalesce(t.c ->> 'sentiment', 'neutral'), (t.ord - 1)::int
  from jsonb_array_elements(coalesce(_comments, '[]'::jsonb)) with ordinality as t(c, ord);

  for c in select t.v, t.ord from jsonb_array_elements(coalesce(_stats, '[]'::jsonb)) with ordinality as t(v, ord) loop
    insert into public.custom_stat_categories (journal_id, name, position) values (j.id, c.v ->> 'name', (c.ord - 1)::int) returning id into v_cat;
    insert into public.custom_stat_options (journal_id, category_id, label, position)
    select j.id, v_cat, o.label, (o.ord - 1)::int from jsonb_array_elements_text(coalesce(c.v -> 'options', '[]'::jsonb)) with ordinality as o(label, ord);
  end loop;

  insert into public.setups (journal_id, name, position)
  select j.id, s.name, (s.ord - 1)::int from jsonb_array_elements_text(coalesce(_setups, '[]'::jsonb)) with ordinality as s(name, ord);
  return j;
end
$$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  delete from public.journals where owner_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on function public.create_journal(jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.create_journal(jsonb, jsonb, jsonb, jsonb, boolean) to authenticated, service_role;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated, service_role;
