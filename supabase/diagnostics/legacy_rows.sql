-- Rows that break the CHECK / foreign-key constraints added in 20261031090000_audit_fixes.sql.
-- The constraints are NOT VALID: they protect every new write, but a legacy row that already breaks one cannot be
-- edited (even for a note) until it is repaired. Run this, repair or delete what it lists, then validate:
--   alter table public.trades   validate constraint trades_quantity_positive;      (and the others below)
-- Read-only. Run it in the SQL editor.

select 'trades: quantity not above zero' as problem, id, journal_id, quantity::text as value from public.trades where quantity <= 0
union all select 'trades: entry price not above zero', id, journal_id, entry_price::text from public.trades where entry_price <= 0
union all select 'trades: exit price not above zero', id, journal_id, exit_price::text from public.trades where exit_price is not null and exit_price <= 0
union all select 'trades: exit before entry', id, journal_id, entry_at::text || ' -> ' || exit_at::text from public.trades where exit_at is not null and exit_at < entry_at
union all select 'journals: negative starting balance', id, id, starting_balance::text from public.journals where starting_balance < 0
union all select 'journals: currency is not a 3-letter code', id, id, currency from public.journals where currency !~ '^[A-Za-z]{3}$'
union all select 'journals: owner no longer exists', id, id, owner_id::text from public.journals j where not exists (select 1 from auth.users u where u.id = j.owner_id)
union all select 'profiles: user no longer exists', id, null, id::text from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)
order by 1;
