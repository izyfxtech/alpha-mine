-- MetaTrader import support (sync jobs, journal <-> MT account link, idempotent trade import keys).
-- Written to be safe to re-run on a database where these statements were already applied by hand.

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('mt4', 'mt5')),
  mode text not null check (mode in ('file_import', 'ea_push', 'worker_pull')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts int not null default 0,
  trades_imported int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists sync_jobs_queue_idx on public.sync_jobs (status, created_at);
alter table public.sync_jobs enable row level security;
drop policy if exists "users read own sync jobs" on public.sync_jobs;
create policy "users read own sync jobs" on public.sync_jobs for select using (user_id = auth.uid());
alter table public.sync_jobs add column if not exists journal_id uuid references public.journals(id) on delete cascade;

-- Link a journal to an MT account
alter table public.journals
  add column if not exists mt_platform text check (mt_platform in ('mt4','mt5')),
  add column if not exists mt_server text,
  add column if not exists mt_login text;
create unique index if not exists journals_mt_account_uidx
  on public.journals (owner_id, mt_platform, mt_server, mt_login) where mt_login is not null;

-- Idempotency key and source tracking on trades
alter table public.trades
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists raw_symbol text,
  add column if not exists commission numeric,
  add column if not exists swap numeric;
-- Not a partial index on purpose: ON CONFLICT (journal_id, external_id) needs a plain unique index to infer.
-- Manual trades have external_id NULL and NULLs never conflict.
drop index if exists public.trades_external_uidx;
create unique index trades_external_uidx on public.trades (journal_id, external_id);

-- Stop the risk calculation overriding imported trades
CREATE OR REPLACE FUNCTION public.trades_compute_pnl() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE auto boolean;
BEGIN
  SELECT j.auto_pnl INTO auto FROM public.journals j WHERE j.id = NEW.journal_id;
  IF NEW.is_break_even THEN
    NEW.gross_pnl := COALESCE(NEW.gross_pnl, 0);
  ELSIF NEW.exit_price IS NOT NULL AND COALESCE(auto, true) AND NOT NEW.pnl_manual THEN
    NEW.gross_pnl := round(((NEW.exit_price - NEW.entry_price) * NEW.quantity * CASE WHEN NEW.direction = 'short' THEN -1 ELSE 1 END)::numeric, 2);
  END IF;
  NEW.gross_pnl := COALESCE(NEW.gross_pnl, 0);
  NEW.fees := COALESCE(NEW.fees, 0);
  NEW.net_pnl := NEW.gross_pnl - NEW.fees;
  IF NEW.stop_loss IS NOT NULL AND NOT NEW.pnl_manual AND (TG_OP = 'INSERT' AND NEW.risk_amount IS NULL
      OR TG_OP = 'UPDATE' AND (NEW.stop_loss IS DISTINCT FROM OLD.stop_loss OR NEW.entry_price IS DISTINCT FROM OLD.entry_price OR NEW.quantity IS DISTINCT FROM OLD.quantity) AND NEW.risk_amount IS NOT DISTINCT FROM OLD.risk_amount) THEN
    NEW.risk_amount := abs(NEW.entry_price - NEW.stop_loss) * NEW.quantity;
  END IF;
  RETURN NEW;
END $$;
