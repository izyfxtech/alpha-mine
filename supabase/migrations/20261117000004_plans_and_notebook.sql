-- Planning, discipline and review: plans, missed trades, rules, filters, prop challenges, notebook, diary, strategy lab.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.alt_strategies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    setup_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alt_strategies_pkey PRIMARY KEY (id),
    CONSTRAINT alt_strategies_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT alt_strategies_setup_id_fkey FOREIGN KEY (setup_id) REFERENCES public.setups(id) ON DELETE SET NULL
);

CREATE TABLE public.alt_strategy_results (
    strategy_id uuid NOT NULL,
    trade_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    alt_profit numeric DEFAULT 0 NOT NULL,
    alt_r numeric DEFAULT 0 NOT NULL,
    CONSTRAINT alt_strategy_results_pkey PRIMARY KEY (strategy_id, trade_id),
    CONSTRAINT alt_strategy_results_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT alt_strategy_results_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES public.alt_strategies(id) ON DELETE CASCADE,
    CONSTRAINT alt_strategy_results_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE TABLE public.backtests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text DEFAULT 'Backtest'::text NOT NULL,
    outcomes text[] DEFAULT ARRAY['Outcome 1'::text, 'Outcome 2'::text] NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT backtests_pkey PRIMARY KEY (id),
    CONSTRAINT backtests_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.diary_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    session_date date DEFAULT CURRENT_DATE NOT NULL,
    mood_before integer,
    mood_after integer,
    focus text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start date,
    period_end date,
    categories text[] DEFAULT '{}'::text[] NOT NULL,
    rating integer DEFAULT 0 NOT NULL,
    content text,
    CONSTRAINT diary_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT diary_sessions_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.missed_trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    instrument text,
    setup text,
    direction text DEFAULT 'long'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    hypothetical_r numeric DEFAULT 0 NOT NULL,
    reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entry_price numeric,
    exit_at timestamp with time zone,
    exit_price numeric,
    net_pnl numeric DEFAULT 0 NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    stop_loss numeric,
    take_profit numeric,
    trade_type text DEFAULT 'Spot'::text NOT NULL,
    option_type text,
    expiry_date date,
    multiplier numeric DEFAULT 1 NOT NULL,
    CONSTRAINT missed_trades_pkey PRIMARY KEY (id),
    CONSTRAINT missed_trades_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.missed_trade_custom_stats (
    missed_trade_id uuid NOT NULL,
    option_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    CONSTRAINT missed_trade_custom_stats_pkey PRIMARY KEY (missed_trade_id, option_id),
    CONSTRAINT missed_trade_custom_stats_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT missed_trade_custom_stats_missed_trade_id_fkey FOREIGN KEY (missed_trade_id) REFERENCES public.missed_trades(id) ON DELETE CASCADE,
    CONSTRAINT missed_trade_custom_stats_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.custom_stat_options(id) ON DELETE CASCADE
);

CREATE TABLE public.notebook_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notebook_folders_pkey PRIMARY KEY (id),
    CONSTRAINT notebook_folders_journal_id_name_key UNIQUE (journal_id, name),
    CONSTRAINT notebook_folders_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.notebook_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    folder text DEFAULT 'General'::text NOT NULL,
    title text DEFAULT 'Untitled'::text NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notebook_pages_pkey PRIMARY KEY (id),
    CONSTRAINT notebook_pages_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.planned_trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    instrument text,
    setup text,
    trade_type text DEFAULT 'Spot'::text NOT NULL,
    direction text DEFAULT 'long'::text NOT NULL,
    entry_at timestamp with time zone DEFAULT now() NOT NULL,
    entry_price numeric,
    quantity numeric DEFAULT 1 NOT NULL,
    take_profit numeric,
    stop_loss numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    option_type text,
    expiry_date date,
    multiplier numeric DEFAULT 1 NOT NULL,
    CONSTRAINT planned_trades_pkey PRIMARY KEY (id),
    CONSTRAINT planned_trades_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.planned_trade_custom_stats (
    planned_trade_id uuid NOT NULL,
    option_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    CONSTRAINT planned_trade_custom_stats_pkey PRIMARY KEY (planned_trade_id, option_id),
    CONSTRAINT planned_trade_custom_stats_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT planned_trade_custom_stats_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.custom_stat_options(id) ON DELETE CASCADE,
    CONSTRAINT planned_trade_custom_stats_planned_trade_id_fkey FOREIGN KEY (planned_trade_id) REFERENCES public.planned_trades(id) ON DELETE CASCADE
);

CREATE TABLE public.prop_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    start_balance numeric NOT NULL,
    started_on date,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prop_challenges_pkey PRIMARY KEY (id),
    CONSTRAINT prop_challenges_rules_check CHECK ((jsonb_typeof(rules) = 'array'::text)),
    CONSTRAINT prop_challenges_start_balance_check CHECK ((start_balance > (0)::numeric)),
    CONSTRAINT prop_challenges_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE INDEX prop_challenges_journal_idx ON public.prop_challenges USING btree (journal_id, created_at);

CREATE TABLE public.saved_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saved_filters_pkey PRIMARY KEY (id),
    CONSTRAINT saved_filters_journal_id_name_key UNIQUE (journal_id, name),
    CONSTRAINT saved_filters_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT saved_filters_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.trading_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trading_rules_pkey PRIMARY KEY (id),
    CONSTRAINT trading_rules_journal_id_name_key UNIQUE (journal_id, name),
    CONSTRAINT trading_rules_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT trading_rules_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.trade_rule_checks (
    trade_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    status text NOT NULL,
    CONSTRAINT trade_rule_checks_pkey PRIMARY KEY (trade_id, rule_id),
    CONSTRAINT trade_rule_checks_status_check CHECK ((status = ANY (ARRAY['followed'::text, 'partial'::text, 'violated'::text]))),
    CONSTRAINT trade_rule_checks_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_rule_checks_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.trading_rules(id) ON DELETE CASCADE,
    CONSTRAINT trade_rule_checks_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_rule_checks_journal_idx ON public.trade_rule_checks USING btree (journal_id);

CREATE INDEX trade_rule_checks_rule_idx ON public.trade_rule_checks USING btree (rule_id);

CREATE TABLE public.trading_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trading_plans_pkey PRIMARY KEY (id),
    CONSTRAINT trading_plans_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------------------------------------------
-- Foreign keys to tables created in an earlier file
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_trading_plan_id_fkey FOREIGN KEY (trading_plan_id) REFERENCES public.trading_plans(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.alt_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.alt_strategies TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.alt_strategy_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.alt_strategy_results TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.backtests TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.diary_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.diary_sessions TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.missed_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.missed_trades TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.missed_trade_custom_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.missed_trade_custom_stats TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.notebook_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.notebook_folders TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.notebook_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.notebook_pages TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.planned_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.planned_trades TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.planned_trade_custom_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.planned_trade_custom_stats TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.prop_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.prop_challenges TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.saved_filters TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trading_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trading_rules TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trade_rule_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trade_rule_checks TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK ((public.owns_journal(journal_id) AND (EXISTS ( SELECT 1
   FROM public.trades t
  WHERE ((t.id = trade_rule_checks.trade_id) AND (t.journal_id = trade_rule_checks.journal_id)))) AND (EXISTS ( SELECT 1
   FROM public.trading_rules r
  WHERE ((r.id = trade_rule_checks.rule_id) AND (r.journal_id = trade_rule_checks.journal_id))))));

ALTER TABLE public.trading_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trading_plans TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.alt_strategies, public.alt_strategy_results, public.backtests, public.diary_sessions, public.missed_trades, public.missed_trade_custom_stats, public.notebook_folders, public.notebook_pages, public.planned_trades, public.planned_trade_custom_stats, public.prop_challenges, public.saved_filters, public.trading_rules, public.trade_rule_checks, public.trading_plans from public, anon, authenticated;
grant select, insert, update, delete on public.alt_strategies, public.alt_strategy_results, public.backtests, public.diary_sessions, public.missed_trades, public.missed_trade_custom_stats, public.notebook_folders, public.notebook_pages, public.planned_trades, public.planned_trade_custom_stats, public.prop_challenges, public.saved_filters, public.trading_rules, public.trade_rule_checks, public.trading_plans to authenticated;
grant all on public.alt_strategies, public.alt_strategy_results, public.backtests, public.diary_sessions, public.missed_trades, public.missed_trade_custom_stats, public.notebook_folders, public.notebook_pages, public.planned_trades, public.planned_trade_custom_stats, public.prop_challenges, public.saved_filters, public.trading_rules, public.trade_rule_checks, public.trading_plans to service_role;
