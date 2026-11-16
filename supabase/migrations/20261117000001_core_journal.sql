-- Profiles, journals and the ownership check every journal-owned table relies on.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE TABLE public.journals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    broker text,
    currency text DEFAULT 'USD'::text NOT NULL,
    starting_balance numeric DEFAULT 10000 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    share_token uuid,
    markets text[] DEFAULT '{}'::text[] NOT NULL,
    deposit_date date,
    trade_type text DEFAULT 'Spot'::text NOT NULL,
    auto_pnl boolean DEFAULT true NOT NULL,
    session_categories text[] DEFAULT ARRAY['Pre-market'::text, 'Post-market'::text, 'Weekly review'::text, 'Monthly review'::text, 'Other'::text] NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    mt_platform text,
    mt_server text,
    mt_login text,
    disabled_session_categories text[] DEFAULT '{}'::text[] NOT NULL,
    quantity_unit text,
    CONSTRAINT journals_pkey PRIMARY KEY (id),
    CONSTRAINT journals_share_token_key UNIQUE (share_token),
    CONSTRAINT journals_currency_code CHECK ((currency ~ '^[A-Za-z]{3}$'::text)),
    CONSTRAINT journals_mt_platform_check CHECK ((mt_platform = ANY (ARRAY['mt4'::text, 'mt5'::text]))),
    CONSTRAINT journals_quantity_unit_check CHECK ((quantity_unit = ANY (ARRAY['lots'::text, 'units'::text]))),
    CONSTRAINT journals_starting_balance_nonneg CHECK ((starting_balance >= (0)::numeric)),
    CONSTRAINT journals_owner_fk FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX journals_mt_account_uidx ON public.journals USING btree (owner_id, mt_platform, mt_server, mt_login) WHERE (mt_login IS NOT NULL);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    avatar_url text,
    base_currency text DEFAULT 'USD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.owns_journal(_j uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.journals WHERE id = _j AND owner_id = auth.uid()) $$;

create function public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))); RETURN NEW; END $$;

-- --------------------------------------------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------------------------------------------

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own journals" ON public.journals TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile" ON public.profiles TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.journals from public, anon, authenticated;
grant select, insert, update, delete on public.journals to authenticated;
grant all on public.journals to service_role;

revoke all on public.profiles from public, anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

revoke all on function public.owns_journal(uuid) from public, anon, authenticated;
grant execute on function public.owns_journal(uuid) to authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
