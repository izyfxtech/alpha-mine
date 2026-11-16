-- Trade screenshots and the queue that cleans their files out of object storage.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.storage_cleanup (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_cleanup_pkey PRIMARY KEY (id),
    CONSTRAINT storage_cleanup_bucket_path_key UNIQUE (bucket, path)
);

CREATE TABLE public.trade_screenshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trade_id uuid,
    journal_id uuid NOT NULL,
    path text NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    missed_trade_id uuid,
    planned_trade_id uuid,
    CONSTRAINT trade_screenshots_pkey PRIMARY KEY (id),
    CONSTRAINT trade_screenshots_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_screenshots_missed_trade_id_fkey FOREIGN KEY (missed_trade_id) REFERENCES public.missed_trades(id) ON DELETE CASCADE,
    CONSTRAINT trade_screenshots_planned_trade_id_fkey FOREIGN KEY (planned_trade_id) REFERENCES public.planned_trades(id) ON DELETE CASCADE,
    CONSTRAINT trade_screenshots_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_screenshots_journal_idx ON public.trade_screenshots USING btree (journal_id);

CREATE INDEX trade_screenshots_path ON public.trade_screenshots USING btree (path);

CREATE INDEX trade_screenshots_trade_idx ON public.trade_screenshots USING btree (trade_id);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.queue_screenshot_file() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A copied journal re-uses the same files, so a path is only queued once NO screenshot row points at it any more.
  if old.path is not null and old.path !~* '^https?:'
     and not exists (select 1 from public.trade_screenshots s where s.path = old.path) then
    insert into public.storage_cleanup (bucket, path) values ('screenshots', old.path), ('screenshots', old.path || '.thumb.webp') on conflict do nothing;
  end if;
  return old;
end $$;

create function public.trade_screenshot_cap() returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if NEW.trade_id is not null then
    select count(*) into n from public.trade_screenshots where trade_id = NEW.trade_id;
  elsif NEW.missed_trade_id is not null then
    select count(*) into n from public.trade_screenshots where missed_trade_id = NEW.missed_trade_id;
  elsif NEW.planned_trade_id is not null then
    select count(*) into n from public.trade_screenshots where planned_trade_id = NEW.planned_trade_id;
  else
    return NEW;
  end if;
  if n >= 10 then raise exception 'A trade can have at most 10 screenshots'; end if;
  return NEW;
end $$;

-- --------------------------------------------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------------------------------------------

CREATE TRIGGER trade_screenshot_cap BEFORE INSERT ON public.trade_screenshots FOR EACH ROW EXECUTE FUNCTION public.trade_screenshot_cap();

CREATE TRIGGER trade_screenshots_queue_file AFTER DELETE ON public.trade_screenshots FOR EACH ROW EXECUTE FUNCTION public.queue_screenshot_file();

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.storage_cleanup ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trade_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trade_screenshots TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.storage_cleanup from public, anon, authenticated;
grant all on public.storage_cleanup to service_role;

revoke all on public.trade_screenshots from public, anon, authenticated;
grant select, insert, update, delete on public.trade_screenshots to authenticated;
grant all on public.trade_screenshots to service_role;

revoke all on function public.queue_screenshot_file() from public, anon, authenticated;

revoke all on function public.trade_screenshot_cap() from public, anon, authenticated;
