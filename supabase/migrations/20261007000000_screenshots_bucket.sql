-- Private bucket for trade screenshots (policies live in the schema migration). Idempotent.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;
