-- Public share link: bounded work for anonymous callers (AM-M28). Totals are computed in SQL over every closed trade, the
-- trade list that travels is the 2,000 most recent, and `truncated` says so. Additive and safe to re-run.
create or replace function public.shared_journal(_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', j.name, 'currency', j.currency, 'starting_balance', j.starting_balance,
    'total', agg.n, 'net', agg.net, 'wins', agg.wins, 'losses', agg.losses, 'gross_win', agg.gw, 'gross_loss', agg.gl,
    'truncated', agg.n > 2000,
    'trades', coalesce((select jsonb_agg(x.row order by x.entry_at)
      from (select t.entry_at, jsonb_build_object('entry_at', t.entry_at, 'net_pnl', t.net_pnl, 'direction', t.direction,
              'instrument', i.symbol, 'setup', s.name) as row
            from public.trades t left join public.instruments i on i.id = t.instrument_id left join public.setups s on s.id = t.setup_id
            where t.journal_id = j.id and t.exit_price is not null
            order by t.entry_at desc limit 2000) x), '[]'::jsonb))
  from public.journals j
  left join public.profiles p on p.id = j.owner_id
  cross join lateral (
    select count(*)::int as n, coalesce(sum(t.net_pnl), 0) as net,
           count(*) filter (where t.net_pnl > 0)::int as wins, count(*) filter (where t.net_pnl < 0)::int as losses,
           coalesce(sum(t.net_pnl) filter (where t.net_pnl > 0), 0) as gw, coalesce(-sum(t.net_pnl) filter (where t.net_pnl < 0), 0) as gl
    from public.trades t where t.journal_id = j.id and t.exit_price is not null
  ) agg
  where _token is not null and j.share_token = _token
    and (p.settings -> 'allowSharing') is distinct from 'false'::jsonb
$$;
revoke all on function public.shared_journal(uuid) from public;
grant execute on function public.shared_journal(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
