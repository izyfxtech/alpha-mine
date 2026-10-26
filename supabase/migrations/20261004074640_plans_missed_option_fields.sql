-- Trading Plans and Missed Trades: option details plus custom statistics on plans.
-- Safe to run more than once.
ALTER TABLE public.planned_trades ADD COLUMN IF NOT EXISTS option_type text;
ALTER TABLE public.planned_trades ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.planned_trades ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 1;
ALTER TABLE public.missed_trades  ADD COLUMN IF NOT EXISTS option_type text;
ALTER TABLE public.missed_trades  ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.missed_trades  ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.planned_trade_custom_stats (
  planned_trade_id uuid NOT NULL REFERENCES public.planned_trades ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.custom_stat_options ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE,
  PRIMARY KEY (planned_trade_id, option_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planned_trade_custom_stats TO authenticated;
ALTER TABLE public.planned_trade_custom_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "journal owner" ON public.planned_trade_custom_stats;
CREATE POLICY "journal owner" ON public.planned_trade_custom_stats FOR ALL TO authenticated
  USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));
