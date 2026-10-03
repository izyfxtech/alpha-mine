CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, avatar_url text, base_currency text NOT NULL DEFAULT 'USD', created_at timestamptz NOT NULL DEFAULT now(), settings jsonb NOT NULL DEFAULT '{}'::jsonb);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated; GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL, broker text, currency text NOT NULL DEFAULT 'USD', starting_balance numeric NOT NULL DEFAULT 10000, created_at timestamptz NOT NULL DEFAULT now(),
  share_token uuid UNIQUE, markets text[] NOT NULL DEFAULT '{}', deposit_date date, trade_type text NOT NULL DEFAULT 'Spot', auto_pnl boolean NOT NULL DEFAULT true,
  session_categories text[] NOT NULL DEFAULT ARRAY['Pre-market','Post-market','Weekly review','Monthly review','Other'], last_used_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journals TO authenticated; GRANT ALL ON public.journals TO service_role;
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journals" ON public.journals FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.owns_journal(_j uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.journals WHERE id = _j AND owner_id = auth.uid()) $$;

CREATE SEQUENCE public.trade_no_seq START 10000000;
GRANT USAGE ON SEQUENCE public.trade_no_seq TO authenticated, service_role;

CREATE TABLE public.instruments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, symbol text NOT NULL, asset_class text, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(journal_id, symbol));
CREATE TABLE public.setups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL, description text, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(journal_id, name));
CREATE TABLE public.comment_definitions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, phase text NOT NULL CHECK (phase IN ('entry','management','exit')), label text NOT NULL, sentiment text NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','negative','neutral')), position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.trading_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL, body text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.trades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, instrument_id uuid REFERENCES public.instruments ON DELETE SET NULL, setup_id uuid REFERENCES public.setups ON DELETE SET NULL, trading_plan_id uuid REFERENCES public.trading_plans ON DELETE SET NULL, direction text NOT NULL CHECK (direction IN ('long','short')), trade_type text NOT NULL DEFAULT 'Spot', entry_at timestamptz NOT NULL, exit_at timestamptz, entry_price numeric NOT NULL, exit_price numeric, quantity numeric NOT NULL DEFAULT 1, stop_loss numeric, take_profit numeric, high_price numeric, low_price numeric, otp_hit boolean, gross_pnl numeric NOT NULL DEFAULT 0, fees numeric NOT NULL DEFAULT 0, net_pnl numeric NOT NULL DEFAULT 0, risk_amount numeric, is_favorite boolean NOT NULL DEFAULT false, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  is_break_even boolean NOT NULL DEFAULT false, trade_no bigint NOT NULL DEFAULT nextval('public.trade_no_seq'), pnl_manual boolean NOT NULL DEFAULT false);
CREATE INDEX trades_journal_entry ON public.trades(journal_id, entry_at);
CREATE TABLE public.trade_comments (trade_id uuid NOT NULL REFERENCES public.trades ON DELETE CASCADE, comment_definition_id uuid NOT NULL REFERENCES public.comment_definitions ON DELETE CASCADE, journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, PRIMARY KEY (trade_id, comment_definition_id));
CREATE TABLE public.missed_trades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, instrument text, setup text, direction text NOT NULL DEFAULT 'long', occurred_at timestamptz NOT NULL DEFAULT now(), hypothetical_r numeric NOT NULL DEFAULT 0, reason text, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  entry_price numeric, exit_at timestamptz, exit_price numeric, net_pnl numeric NOT NULL DEFAULT 0, quantity numeric NOT NULL DEFAULT 1, stop_loss numeric, take_profit numeric, trade_type text NOT NULL DEFAULT 'Spot');
CREATE TABLE public.notebook_pages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, folder text NOT NULL DEFAULT 'General', title text NOT NULL DEFAULT 'Untitled', content text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.diary_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, session_date date NOT NULL DEFAULT current_date, mood_before int, mood_after int, focus text, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  period_start date, period_end date, categories text[] NOT NULL DEFAULT '{}', rating int NOT NULL DEFAULT 0, content text);
CREATE TABLE public.notebook_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(journal_id, name));
CREATE TABLE public.custom_stat_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.custom_stat_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, category_id uuid NOT NULL REFERENCES public.custom_stat_categories ON DELETE CASCADE, label text NOT NULL, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.trade_custom_stats (trade_id uuid NOT NULL REFERENCES public.trades ON DELETE CASCADE, option_id uuid NOT NULL REFERENCES public.custom_stat_options ON DELETE CASCADE, journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, PRIMARY KEY (trade_id, option_id));
CREATE TABLE public.planned_trades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, instrument text, setup text, trade_type text NOT NULL DEFAULT 'Spot', direction text NOT NULL DEFAULT 'long', entry_at timestamptz NOT NULL DEFAULT now(), entry_price numeric, quantity numeric NOT NULL DEFAULT 1, take_profit numeric, stop_loss numeric, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.trade_screenshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trade_id uuid REFERENCES public.trades ON DELETE CASCADE, journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, path text NOT NULL, caption text, created_at timestamptz NOT NULL DEFAULT now(),
  missed_trade_id uuid REFERENCES public.missed_trades ON DELETE CASCADE, planned_trade_id uuid REFERENCES public.planned_trades ON DELETE CASCADE);
CREATE TABLE public.backtests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL DEFAULT 'Backtest', outcomes text[] NOT NULL DEFAULT ARRAY['Outcome 1','Outcome 2'], results jsonb NOT NULL DEFAULT '[]'::jsonb, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.alt_strategies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, name text NOT NULL, setup_id uuid REFERENCES public.setups ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.alt_strategy_results (strategy_id uuid NOT NULL REFERENCES public.alt_strategies ON DELETE CASCADE, trade_id uuid NOT NULL REFERENCES public.trades ON DELETE CASCADE, journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, alt_profit numeric NOT NULL DEFAULT 0, alt_r numeric NOT NULL DEFAULT 0, PRIMARY KEY (strategy_id, trade_id));
CREATE TABLE public.journal_cashflows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, occurred_on date NOT NULL DEFAULT current_date, amount numeric NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.missed_trade_custom_stats (missed_trade_id uuid NOT NULL REFERENCES public.missed_trades ON DELETE CASCADE, option_id uuid NOT NULL REFERENCES public.custom_stat_options ON DELETE CASCADE, journal_id uuid NOT NULL REFERENCES public.journals ON DELETE CASCADE, PRIMARY KEY (missed_trade_id, option_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instruments, public.setups, public.comment_definitions, public.trading_plans, public.trades, public.trade_comments, public.missed_trades, public.notebook_pages, public.diary_sessions, public.notebook_folders, public.custom_stat_categories, public.custom_stat_options, public.trade_custom_stats, public.planned_trades, public.trade_screenshots, public.backtests, public.alt_strategies, public.alt_strategy_results, public.journal_cashflows, public.missed_trade_custom_stats TO authenticated;
GRANT ALL ON public.instruments, public.setups, public.comment_definitions, public.trading_plans, public.trades, public.trade_comments, public.missed_trades, public.notebook_pages, public.diary_sessions, public.notebook_folders, public.custom_stat_categories, public.custom_stat_options, public.trade_custom_stats, public.planned_trades, public.trade_screenshots, public.backtests, public.alt_strategies, public.alt_strategy_results, public.journal_cashflows, public.missed_trade_custom_stats TO service_role;

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['instruments','setups','comment_definitions','trading_plans','trades','trade_comments','missed_trades','notebook_pages','diary_sessions','notebook_folders','custom_stat_categories','custom_stat_options','trade_custom_stats','planned_trades','trade_screenshots','backtests','alt_strategies','alt_strategy_results','journal_cashflows','missed_trade_custom_stats'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "journal owner" ON public.%I FOR ALL TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id))', t);
END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))); RETURN NEW; END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_journal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_journal(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'name', j.name, 'currency', j.currency, 'starting_balance', j.starting_balance,
    'trades', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_at', t.entry_at, 'net_pnl', t.net_pnl, 'direction', t.direction,
        'instrument', i.symbol, 'setup', s.name) ORDER BY t.entry_at)
      FROM public.trades t LEFT JOIN public.instruments i ON i.id = t.instrument_id LEFT JOIN public.setups s ON s.id = t.setup_id
      WHERE t.journal_id = j.id AND t.exit_price IS NOT NULL), '[]'::jsonb))
  FROM public.journals j WHERE _token IS NOT NULL AND j.share_token = _token
$$;
REVOKE ALL ON FUNCTION public.shared_journal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_journal(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.custom_stat_category_cap() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.custom_stat_categories WHERE journal_id = NEW.journal_id) >= 20 THEN
    RAISE EXCEPTION 'A journal can have at most 20 custom statistics';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER custom_stat_category_cap BEFORE INSERT ON public.custom_stat_categories FOR EACH ROW EXECUTE FUNCTION public.custom_stat_category_cap();

CREATE OR REPLACE FUNCTION public.trade_screenshot_cap() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.trade_id IS NOT NULL AND (SELECT count(*) FROM public.trade_screenshots WHERE trade_id = NEW.trade_id) >= 6 THEN
    RAISE EXCEPTION 'A trade can have at most 6 screenshots';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trade_screenshot_cap BEFORE INSERT ON public.trade_screenshots FOR EACH ROW EXECUTE FUNCTION public.trade_screenshot_cap();

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
  IF NEW.stop_loss IS NOT NULL AND (TG_OP = 'INSERT' AND NEW.risk_amount IS NULL
      OR TG_OP = 'UPDATE' AND (NEW.stop_loss IS DISTINCT FROM OLD.stop_loss OR NEW.entry_price IS DISTINCT FROM OLD.entry_price OR NEW.quantity IS DISTINCT FROM OLD.quantity) AND NEW.risk_amount IS NOT DISTINCT FROM OLD.risk_amount) THEN
    NEW.risk_amount := abs(NEW.entry_price - NEW.stop_loss) * NEW.quantity;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trades_pnl BEFORE INSERT OR UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.trades_compute_pnl();

CREATE POLICY "own screenshots read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own screenshots upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own screenshots delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);