import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/metrics";
import { axis, tooltipStyle } from "@/components/kit";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared Trading Journal — AlphaMine" },
      { name: "description", content: "A read-only summary of a trader's journal performance, shared from AlphaMine." },
      { property: "og:title", content: "Shared Trading Journal — AlphaMine" },
      { property: "og:description", content: "A read-only summary of a trader's journal performance, shared from AlphaMine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedJournal,
});

type Shared = { name: string; currency: string; starting_balance: number; trades: { entry_at: string; net_pnl: number; direction: string; instrument: string | null; setup: string | null }[] };

function SharedJournal() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
      const { data, error } = await supabase.rpc("shared_journal", { _token: token });
      if (error) throw error;
      return data as unknown as Shared | null;
    },
  });
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-10 text-center"><p className="font-semibold">This link is no longer available.</p><Link to="/" className="mt-2 inline-block text-sm text-info">Go to AlphaMine</Link></div>;

  const ts = data.trades.map((t) => ({ ...t, net_pnl: Number(t.net_pnl) }));
  const wins = ts.filter((t) => t.net_pnl > 0), losses = ts.filter((t) => t.net_pnl < 0);
  const net = ts.reduce((s, t) => s + t.net_pnl, 0);
  const gl = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0)), gw = wins.reduce((s, t) => s + t.net_pnl, 0);
  let run = 0;
  const curve = ts.map((t, i) => ({ n: i + 1, v: +(run += t.net_pnl).toFixed(2) }));
  const kpis: [string, string][] = [
    ["Net Return", fmtMoney(net, data.currency)],
    ["Return (%)", `${data.starting_balance ? ((net / Number(data.starting_balance)) * 100).toFixed(2) : "0.00"}%`],
    ["Winrate", `${ts.length ? ((wins.length / ts.length) * 100).toFixed(2) : "0.00"}%`],
    ["Profit Factor", gl ? (gw / gl).toFixed(2) : "—"],
    ["Trades", String(ts.length)],
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex items-center justify-between">
        <div><p className="text-xs uppercase text-muted-foreground">Shared journal · read only</p><h1 className="text-xl font-semibold">{data.name}</h1></div>
        <Link to="/" className="text-sm font-semibold text-profit">AlphaMine</Link>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-lg font-semibold tabular">{v}</p></div>)}
      </div>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Equity Graph</h2>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="n" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={60} />
              <Tooltip {...tooltipStyle} formatter={(v) => fmtMoney(Number(v), data.currency)} />
              <Area dataKey="v" name="Net Return" type="monotone" stroke="var(--color-profit)" fill="var(--color-profit)" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular">
          <thead><tr className="border-b text-left"><th className="px-4 py-2.5">Date</th><th className="px-4">Instrument</th><th className="px-4">Setup</th><th className="px-4">Direction</th><th className="px-4 text-right">Return</th></tr></thead>
          <tbody>{[...ts].reverse().slice(0, 50).map((t, i) => (
            <tr key={i} className="border-b border-border/40"><td className="px-4 py-2">{t.entry_at.slice(0, 10)}</td><td className="px-4">{t.instrument ?? "—"}</td><td className="px-4">{t.setup ?? "—"}</td><td className="px-4 capitalize">{t.direction}</td>
              <td className={`px-4 text-right ${t.net_pnl >= 0 ? "text-profit" : "text-loss"}`}>{fmtMoney(t.net_pnl, data.currency)}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
