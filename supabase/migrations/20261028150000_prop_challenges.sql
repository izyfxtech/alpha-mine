-- Prop firm challenge tracking. Additive; safe to re-run.
create table if not exists public.prop_challenges (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  name text not null,
  start_balance numeric not null check (start_balance > 0),
  started_on date,
  time_zone text not null default 'UTC',
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists prop_challenges_journal_idx on public.prop_challenges (journal_id, created_at);
grant select, insert, update, delete on public.prop_challenges to authenticated;
grant all on public.prop_challenges to service_role;
alter table public.prop_challenges enable row level security;
drop policy if exists "journal owner" on public.prop_challenges;
create policy "journal owner" on public.prop_challenges for all to authenticated
  using (public.owns_journal(journal_id)) with check (public.owns_journal(journal_id));
