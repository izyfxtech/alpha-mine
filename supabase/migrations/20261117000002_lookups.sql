-- Per-journal lookup data: instruments, setups, trade comments and custom statistics.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.comment_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    phase text NOT NULL,
    label text NOT NULL,
    sentiment text DEFAULT 'neutral'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT comment_definitions_pkey PRIMARY KEY (id),
    CONSTRAINT comment_definitions_phase_check CHECK ((phase = ANY (ARRAY['entry'::text, 'management'::text, 'exit'::text]))),
    CONSTRAINT comment_definitions_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text]))),
    CONSTRAINT comment_definitions_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.custom_stat_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT custom_stat_categories_pkey PRIMARY KEY (id),
    CONSTRAINT custom_stat_categories_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.custom_stat_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    category_id uuid NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT custom_stat_options_pkey PRIMARY KEY (id),
    CONSTRAINT custom_stat_options_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.custom_stat_categories(id) ON DELETE CASCADE,
    CONSTRAINT custom_stat_options_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.instruments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    symbol text NOT NULL,
    asset_class text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    contract_size numeric,
    digits integer,
    profit_currency text,
    kind text,
    CONSTRAINT instruments_pkey PRIMARY KEY (id),
    CONSTRAINT instruments_journal_id_symbol_key UNIQUE (journal_id, symbol),
    CONSTRAINT instruments_asset_class_known CHECK (((asset_class IS NULL) OR (asset_class = ANY (ARRAY['forex'::text, 'metal'::text, 'crypto'::text, 'index'::text, 'energy'::text, 'stock'::text, 'future'::text, 'futures'::text, 'options'::text, 'indices'::text, 'commodities'::text])))),
    CONSTRAINT instruments_contract_size_check CHECK ((contract_size > (0)::numeric)),
    CONSTRAINT instruments_digits_check CHECK (((digits >= 0) AND (digits <= 8))),
    CONSTRAINT instruments_kind_check CHECK ((kind = ANY (ARRAY['fx'::text, 'metal'::text, 'crypto'::text, 'index'::text, 'cfd'::text]))),
    CONSTRAINT instruments_profit_currency_check CHECK ((profit_currency ~ '^[A-Z0-9]{2,10}$'::text)),
    CONSTRAINT instruments_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE TABLE public.setups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT setups_pkey PRIMARY KEY (id),
    CONSTRAINT setups_journal_id_name_key UNIQUE (journal_id, name),
    CONSTRAINT setups_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.custom_stat_category_cap() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.custom_stat_categories WHERE journal_id = NEW.journal_id) >= 20 THEN
    RAISE EXCEPTION 'A journal can have at most 20 custom statistics';
  END IF;
  RETURN NEW;
END $$;

-- --------------------------------------------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------------------------------------------

CREATE TRIGGER custom_stat_category_cap BEFORE INSERT ON public.custom_stat_categories FOR EACH ROW EXECUTE FUNCTION public.custom_stat_category_cap();

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.comment_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.comment_definitions TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.custom_stat_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.custom_stat_categories TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.custom_stat_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.custom_stat_options TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.instruments TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.setups TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.comment_definitions, public.custom_stat_categories, public.custom_stat_options, public.instruments, public.setups from public, anon, authenticated;
grant select, insert, update, delete on public.comment_definitions, public.custom_stat_categories, public.custom_stat_options, public.instruments, public.setups to authenticated;
grant all on public.comment_definitions, public.custom_stat_categories, public.custom_stat_options, public.instruments, public.setups to service_role;

revoke all on function public.custom_stat_category_cap() from public, anon, authenticated;
