-- "Disabled Items": retire instruments, setups, comments and custom statistics instead of deleting them,
-- so trades keep their history. Disabled items disappear from selectors but stay on existing trades.
alter table public.instruments            add column if not exists disabled boolean not null default false;
alter table public.setups                 add column if not exists disabled boolean not null default false;
alter table public.comment_definitions    add column if not exists disabled boolean not null default false;
alter table public.custom_stat_categories add column if not exists disabled boolean not null default false;
alter table public.custom_stat_options    add column if not exists disabled boolean not null default false;
alter table public.journals               add column if not exists disabled_session_categories text[] not null default '{}';
