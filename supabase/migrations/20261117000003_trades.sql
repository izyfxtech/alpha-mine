-- Trades and everything that hangs off a single trade, plus the trade P&L trigger.

-- --------------------------------------------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------------------------------------------

CREATE SEQUENCE public.trade_no_seq
    START WITH 10000000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.journal_cashflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    external_id text,
    CONSTRAINT journal_cashflows_pkey PRIMARY KEY (id),
    CONSTRAINT journal_cashflows_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX journal_cashflows_external_uidx ON public.journal_cashflows USING btree (journal_id, external_id);

CREATE TABLE public.trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_id uuid NOT NULL,
    instrument_id uuid,
    setup_id uuid,
    trading_plan_id uuid,
    direction text NOT NULL,
    trade_type text DEFAULT 'Spot'::text NOT NULL,
    entry_at timestamp with time zone NOT NULL,
    exit_at timestamp with time zone,
    entry_price numeric NOT NULL,
    exit_price numeric,
    quantity numeric DEFAULT 1 NOT NULL,
    stop_loss numeric,
    take_profit numeric,
    high_price numeric,
    low_price numeric,
    otp_hit boolean,
    gross_pnl numeric DEFAULT 0 NOT NULL,
    fees numeric DEFAULT 0 NOT NULL,
    net_pnl numeric DEFAULT 0 NOT NULL,
    risk_amount numeric,
    is_favorite boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_break_even boolean DEFAULT false NOT NULL,
    trade_no bigint DEFAULT nextval('public.trade_no_seq'::regclass) NOT NULL,
    pnl_manual boolean DEFAULT false NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    external_id text,
    raw_symbol text,
    commission numeric,
    swap numeric,
    other_fees numeric DEFAULT 0 NOT NULL,
    initial_stop numeric,
    CONSTRAINT trades_pkey PRIMARY KEY (id),
    CONSTRAINT trades_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text]))),
    CONSTRAINT trades_entry_price_positive CHECK ((entry_price > (0)::numeric)),
    CONSTRAINT trades_exit_after_entry CHECK (((exit_at IS NULL) OR (exit_at >= entry_at))),
    CONSTRAINT trades_exit_price_positive CHECK (((exit_price IS NULL) OR (exit_price > (0)::numeric))),
    CONSTRAINT trades_initial_stop_positive CHECK (((initial_stop IS NULL) OR (initial_stop > (0)::numeric))),
    CONSTRAINT trades_quantity_positive CHECK ((quantity > (0)::numeric)),
    CONSTRAINT trades_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL,
    CONSTRAINT trades_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trades_setup_id_fkey FOREIGN KEY (setup_id) REFERENCES public.setups(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX trades_external_uidx ON public.trades USING btree (journal_id, external_id);

CREATE INDEX trades_instrument_idx ON public.trades USING btree (instrument_id);

CREATE INDEX trades_journal_entry ON public.trades USING btree (journal_id, entry_at);

CREATE INDEX trades_setup_idx ON public.trades USING btree (setup_id);

CREATE TABLE public.trade_comments (
    trade_id uuid NOT NULL,
    comment_definition_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    CONSTRAINT trade_comments_pkey PRIMARY KEY (trade_id, comment_definition_id),
    CONSTRAINT trade_comments_comment_definition_id_fkey FOREIGN KEY (comment_definition_id) REFERENCES public.comment_definitions(id) ON DELETE CASCADE,
    CONSTRAINT trade_comments_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_comments_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_comments_journal_idx ON public.trade_comments USING btree (journal_id);

CREATE TABLE public.trade_custom_stats (
    trade_id uuid NOT NULL,
    option_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    CONSTRAINT trade_custom_stats_pkey PRIMARY KEY (trade_id, option_id),
    CONSTRAINT trade_custom_stats_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_custom_stats_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.custom_stat_options(id) ON DELETE CASCADE,
    CONSTRAINT trade_custom_stats_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_custom_stats_journal_idx ON public.trade_custom_stats USING btree (journal_id);

CREATE INDEX trade_custom_stats_option_idx ON public.trade_custom_stats USING btree (option_id);

CREATE TABLE public.trade_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trade_id uuid NOT NULL,
    journal_id uuid NOT NULL,
    kind text NOT NULL,
    side text NOT NULL,
    quantity numeric NOT NULL,
    price numeric NOT NULL,
    executed_at timestamp with time zone NOT NULL,
    commission numeric DEFAULT 0 NOT NULL,
    swap numeric DEFAULT 0 NOT NULL,
    fee numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_executions_pkey PRIMARY KEY (id),
    CONSTRAINT trade_executions_kind_check CHECK ((kind = ANY (ARRAY['entry'::text, 'exit'::text]))),
    CONSTRAINT trade_executions_price_check CHECK ((price > (0)::numeric)),
    CONSTRAINT trade_executions_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT trade_executions_side_check CHECK ((side = ANY (ARRAY['buy'::text, 'sell'::text]))),
    CONSTRAINT trade_executions_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE CASCADE,
    CONSTRAINT trade_executions_trade_id_fkey FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE
);

CREATE INDEX trade_executions_journal_idx ON public.trade_executions USING btree (journal_id);

CREATE INDEX trade_executions_trade_idx ON public.trade_executions USING btree (trade_id, executed_at);

-- --------------------------------------------------------------------------------------------------------------
-- Functions
-- --------------------------------------------------------------------------------------------------------------

create function public.stop_on_loss_side(_direction text, _entry numeric, _stop numeric) returns boolean
language sql immutable as $$
  select _stop is not null and _entry is not null and _stop > 0
         and case when _direction = 'short' then _stop > _entry else _stop < _entry end
$$;

create function public.trades_compute_pnl() returns trigger language plpgsql set search_path = public as $$
declare auto boolean; junit text; iclass text; unit text;
begin
  select j.auto_pnl, j.quantity_unit, i.asset_class into auto, junit, iclass
  from public.journals j left join public.instruments i on i.id = new.instrument_id
  where j.id = new.journal_id;
  unit := case when iclass = 'stock' then 'units' when iclass is not null then 'lots' else junit end;

  if new.is_break_even then
    new.gross_pnl := coalesce(new.gross_pnl, 0);
  elsif new.exit_price is not null and coalesce(auto, true) and not new.pnl_manual
        and unit = 'units' and lower(new.trade_type) = 'spot' then
    new.gross_pnl := round(((new.exit_price - new.entry_price) * new.quantity * case when new.direction = 'short' then -1 else 1 end)::numeric, 2);
  end if;
  new.gross_pnl := coalesce(new.gross_pnl, 0);

  new.other_fees := coalesce(new.other_fees, 0);
  if new.commission is null and new.swap is null and new.other_fees = 0 then
    new.other_fees := coalesce(new.fees, 0);
  else
    new.fees := round(-(coalesce(new.commission, 0) + coalesce(new.swap, 0)) + new.other_fees, 8);
  end if;
  new.fees := coalesce(new.fees, 0);
  new.net_pnl := new.gross_pnl - new.fees;

  -- Initial stop: keep what is there, else the old stop (if it was a real stop), else the first valid stop being saved.
  if new.initial_stop is null then
    if tg_op = 'UPDATE' then
      new.initial_stop := coalesce(old.initial_stop, case when public.stop_on_loss_side(old.direction, old.entry_price, old.stop_loss) then old.stop_loss end);
    end if;
    if new.initial_stop is null and public.stop_on_loss_side(new.direction, new.entry_price, new.stop_loss) then
      new.initial_stop := new.stop_loss;
    end if;
  end if;
  return new;
end $$;

-- --------------------------------------------------------------------------------------------------------------
-- Triggers
-- --------------------------------------------------------------------------------------------------------------

CREATE TRIGGER trades_pnl BEFORE INSERT OR UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.trades_compute_pnl();

-- --------------------------------------------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------------------------------------------

ALTER TABLE public.journal_cashflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.journal_cashflows TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trades TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trade_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trade_comments TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trade_custom_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trade_custom_stats TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

ALTER TABLE public.trade_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal owner" ON public.trade_executions TO authenticated USING (public.owns_journal(journal_id)) WITH CHECK (public.owns_journal(journal_id));

-- --------------------------------------------------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------------------------------------------------

revoke all on public.journal_cashflows, public.trades, public.trade_comments, public.trade_custom_stats, public.trade_executions from public, anon, authenticated;
grant select, insert, update, delete on public.journal_cashflows, public.trades, public.trade_comments, public.trade_custom_stats, public.trade_executions to authenticated;
grant all on public.journal_cashflows, public.trades, public.trade_comments, public.trade_custom_stats, public.trade_executions to service_role;

revoke all on sequence public.trade_no_seq from public, anon, authenticated;
grant usage on sequence public.trade_no_seq to authenticated;
grant select, usage on sequence public.trade_no_seq to service_role;

revoke all on function public.stop_on_loss_side(text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.stop_on_loss_side(text, numeric, numeric) to authenticated, service_role;

revoke all on function public.trades_compute_pnl() from public, anon, authenticated;
