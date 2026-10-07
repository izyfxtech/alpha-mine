import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { ChevronDown } from "lucide-react";
import { useLookups, useTrades } from "@/lib/journal-context";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { CHARTS } from "@/lib/nav";
import { computeStats, fmtMoney, fmtNum, groupBy, isLoss, isWin, stdev, type Trade } from "@/lib/metrics";
import { AccentStat, Empty, StatGrid, axis, niceTicks, pctScale, seriesValues, tradeAxis, yScale } from "@/components/kit";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chart-lab/$chart")({
  loader: ({ params }) => {
    const c = CHARTS.find(([k]) => k === params.chart);
    if (!c) throw notFound();
    return { title: c[1] };
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? "Chart Lab"} — AlphaMine`;
    const description = "Chart Lab analysis of your trades.";
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: ChartPage,
  notFoundComponent: () => <Empty>That chart doesn't exist.</Empty>,
  errorComponent: ({ error }) => <Empty>{(error as Error).message}</Empty>,
});

/* ---------------- shared building blocks ---------------- */
const tickFmt = (n: number) => Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString("de-DE") : n.toLocaleString("de-DE");
const sorted = (ts: Trade[]) => [...ts].sort((a, b) => a.entry_at.localeCompare(b.entry_at));

function Select<T extends string>({ label, value, options, onChange, width = "w-40" }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; width?: string }) {
  return (
    <div className="relative rounded-md border border-line2 bg-card px-3 pb-1.5 pt-3">
      <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-t2">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn("flex items-center justify-between gap-2 text-sm", width)}><span className="truncate">{value}</span><ChevronDown className="h-4 w-4 shrink-0" /></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((o) => <button key={o} onClick={() => onChange(o)} className={cn("block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted", o === value && "bg-muted font-medium")}>{o}</button>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type CardSize = "sm" | "md" | "lg" | "full";
/** Card heights taken from the reference screens: 620 / 747 / 888 / 990 px on a 1080px-high window. */
const CARD_H: Record<CardSize, string> = {
  sm: "h-[max(520px,calc(100vh-457px))]",
  md: "h-[max(600px,calc(100vh-330px))]",
  lg: "h-[max(640px,calc(100vh-192px))]",
  full: "h-[max(700px,calc(100vh-87px))]",
};
function ChartCard({ controls, legend, children, size = "lg" }: { controls?: ReactNode; legend?: ReactNode; children: ReactNode; size?: CardSize }) {
  return (
    <section className={cn("flex flex-col rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]", CARD_H[size])}>
      {(controls || legend) && <div className="mb-4 flex flex-wrap items-center gap-3">{controls}<div className="ml-auto flex gap-4 text-[12px]">{legend}</div></div>}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
const Dot = ({ c, children }: { c: string; children: ReactNode }) => <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", c)} />{children}</span>;
const Stats = ({ children }: { children: ReactNode }) => <StatGrid>{children}</StatGrid>;

function Tip({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      {lines.map(([k, v]) => <p key={k}>{k}: <b className="tabular">{v}</b></p>)}
    </div>
  );
}

const DISPLAY = ["Return ($)", "Average Return ($)", "Return (%)", "Average Return (%)", "R Multiple (R)", "Average R Multiple (R)", "Winrate (%)", "Number of Trades"] as const;
type Display = (typeof DISPLAY)[number];
const SORT = ["By Value", "By Name", "By Trades"] as const;
type Sort = (typeof SORT)[number];

/** Value of one group for the chosen metric. "Average ..." divides the total by the number of trades. */
function valueOf(ts: Trade[], d: Display, start: number) {
  const n = ts.length || 1;
  const avg = d.startsWith("Average");
  const div = avg ? n : 1;
  const unit = d.includes("(%)") ? "pct" : d.includes("(R)") ? "r" : "cur";
  if (d === "Winrate (%)") return (ts.filter(isWin).length / n) * 100;
  if (d === "Number of Trades") return ts.length;
  const total = unit === "pct" ? (start ? (ts.reduce((a, t) => a + t.net_pnl, 0) / start) * 100 : 0) : unit === "r" ? ts.reduce((a, t) => a + (t.r ?? 0), 0) : ts.reduce((a, t) => a + t.net_pnl, 0);
  return total / div;
}
const fmtD = (d: Display, v: number, cur: string) => d.includes("($)") ? fmtMoney(v, cur) : d.includes("(R)") ? `${fmtNum(v)}R` : d === "Number of Trades" ? String(v) : `${fmtNum(v)}%`;

function BarsBig({ data, yLabel, fmt, extra, hideTicks, rotate }: { data: { k: string; v: number; n?: number }[]; yLabel: string; fmt: (v: number) => string; extra?: (d: { k: string; v: number; n?: number }) => [string, string][]; hideTicks?: boolean; rotate?: boolean }) {
  const vals = data.map((d) => d.v);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 8);
  const tilt = rotate ?? !!hideTicks;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barCategoryGap={hideTicks ? "18%" : "22%"}>
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis dataKey="k" tick={axis} tickLine={false} axisLine={false} interval={0} angle={tilt ? -60 : 0} textAnchor={tilt ? "end" : "middle"} height={tilt ? 70 : 30} tickMargin={6} tickFormatter={(s: string) => (s.length > 12 && !tilt ? s.slice(0, 11) + "…" : s)} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={58} ticks={ticks} domain={[lo, hi]} interval={0} tickFormatter={tickFmt} label={{ value: yLabel, angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
        <ReferenceLine y={0} stroke="var(--color-axis-line)" />
        <Tooltip cursor={{ fill: "rgba(90,186,80,0.08)" }} content={({ active, payload }) => active && payload?.length ? <Tip title={(payload[0].payload as { k: string }).k} lines={[[yLabel, fmt((payload[0].payload as { v: number }).v)], ...(extra ? extra(payload[0].payload as never) : [])]} /> : null} />
        <Bar dataKey="v" maxBarSize={130} isAnimationActive={false}>{data.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function GroupTable({ rows, cur }: { rows: { k: string; ts: Trade[] }[]; cur: string }) {
  return (
    <section className="max-h-72 max-w-2xl overflow-auto rounded-xl border bg-card">
      <table className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-card"><tr className="border-b">{["", "Trades", "Winrate (%)", "Avg. P&L ($)", "Total Gain ($)"].map((h) => <th key={h} className="px-3 py-2.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ k, ts }) => { const sum = ts.reduce((a, t) => a + t.net_pnl, 0); return (
          <tr key={k} className="border-b border-border/50 last:border-0"><td className="px-3 py-2">{k}</td><td className="px-3 py-2 text-right">{ts.length}</td><td className="px-3 py-2 text-right">{fmtNum((ts.filter(isWin).length / ts.length) * 100)}</td><td className="px-3 py-2 text-right">{fmtNum(sum / ts.length)}</td><td className="px-3 py-2 text-right">{fmtNum(sum)}</td></tr>
        ); })}</tbody>
      </table>
      <span className="sr-only">{cur}</span>
    </section>
  );
}

/** Performance by Setup / Instrument / Time / Day / Custom stats / Trade comments */
function GroupChart({ trades, start, cur, by, noun, order, extraControl, showTable = true }: { trades: Trade[]; start: number; cur: string; by: (t: Trade) => string[]; noun: string; order?: string[]; extraControl?: ReactNode; showTable?: boolean }) {
  const [display, setDisplay] = useState<Display>("Return ($)");
  const [sort, setSort] = useState<Sort>(order ? "By Name" : "By Value");
  const groups = useMemo(() => {
    const m = new Map<string, Trade[]>();
    trades.forEach((t) => by(t).forEach((k) => m.set(k, [...(m.get(k) ?? []), t])));
    let rows = [...m.entries()].map(([k, ts]) => ({ k, ts, v: +valueOf(ts, display, start).toFixed(2), n: ts.length }));
    if (sort === "By Value") rows.sort((a, b) => b.v - a.v);
    else if (sort === "By Trades") rows.sort((a, b) => b.n - a.n);
    else rows.sort((a, b) => (order ? order.indexOf(a.k) - order.indexOf(b.k) : a.k.localeCompare(b.k)));
    return rows;
  }, [trades, by, display, sort, start, order]);
  if (!groups.length) return <Empty>No data for this chart yet.</Empty>;
  const sums = groups.map((g) => ({ k: g.k, sum: g.ts.reduce((a, t) => a + t.net_pnl, 0), avg: g.ts.reduce((a, t) => a + t.net_pnl, 0) / g.ts.length }));
  const best = [...sums].sort((a, b) => b.sum - a.sum)[0], worst = [...sums].sort((a, b) => a.sum - b.sum)[0];
  const bestA = [...sums].sort((a, b) => b.avg - a.avg)[0], worstA = [...sums].sort((a, b) => a.avg - b.avg)[0];
  return (
    <div className="space-y-4">
      <ChartCard size="sm" controls={<><Select label="Display" value={display} options={DISPLAY} onChange={setDisplay} /><Select label="Sort By" value={sort} options={SORT} onChange={setSort} />{extraControl}</>}>
        <BarsBig data={groups} yLabel={display} fmt={(v) => fmtD(display, v, cur)} extra={(d) => [["Number of trades", String(d.n)]]} />
      </ChartCard>
      {showTable && <GroupTable rows={groups} cur={cur} />}
      <Stats>
        <AccentStat info={showTable ? undefined : `${noun} with the highest total return`} label={`Best ${noun} Sum`} value={fmtMoney(best.sum, cur)} />
        <AccentStat info={showTable ? undefined : `${noun} with the lowest total return`} label={`Worst ${noun} Sum`} value={fmtMoney(worst.sum, cur)} tone={worst.sum < 0 ? "neg" : undefined} />
        <AccentStat info={showTable ? undefined : `${noun} with the highest average return`} label={`Best ${noun} Avg`} value={fmtMoney(bestA.avg, cur)} />
        <AccentStat info={showTable ? undefined : `${noun} with the lowest average return`} label={`Worst ${noun} Avg`} value={fmtMoney(worstA.avg, cur)} tone={worstA.avg < 0 ? "neg" : undefined} />
        {showTable && <AccentStat label={`Number of ${noun}s`} value={groups.length} />}
      </Stats>
    </div>
  );
}

/* ---------------- individual charts ---------------- */
function Consecutive({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const [kind, setKind] = useState<"Winners" | "Losers">("Winners");
  const [avg, setAvg] = useState<"Return ($)" | "Return (%)" | "Frequency">("Return ($)");
  const data = useMemo(() => {
    const runs: Trade[][] = [];
    let cur: Trade[] = [];
    sorted(trades).forEach((t) => {
      const hit = kind === "Winners" ? isWin(t) : isLoss(t);
      if (hit) cur.push(t); else { if (cur.length) runs.push(cur); cur = []; }
    });
    if (cur.length) runs.push(cur);
    return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((len) => {
      const rs = runs.filter((r) => (len === 11 ? r.length > 10 : r.length === len));
      const avgRet = rs.length ? rs.reduce((a, r) => a + r.reduce((s, t) => s + t.net_pnl, 0), 0) / rs.length : 0;
      const v = avg === "Frequency" ? rs.length : avg === "Return (%)" ? (start ? (avgRet / start) * 100 : 0) : avgRet;
      return { k: len === 11 ? "> 10" : String(len), v: +v.toFixed(2), n: rs.length };
    });
  }, [trades, kind, avg, start]);
  return (
    <ChartCard size="full" controls={<><Select label="Consecutive" value={kind} options={["Winners", "Losers"] as const} onChange={setKind} /><Select label="Average" value={avg} options={["Return ($)", "Return (%)", "Frequency"] as const} onChange={setAvg} /></>}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis dataKey="k" tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} label={{ value: `Consecutive ${kind}`, position: "insideBottom", offset: -12, style: axis }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={58} tickFormatter={tickFmt} {...yScale(data.map((d) => d.v), { integer: avg === "Frequency" })} label={{ value: avg === "Frequency" ? "Frequency" : `Average ${avg}`, angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
          <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={({ active, payload }) => active && payload?.length ? <Tip title={`Consecutive ${kind}: ${(payload[0].payload as { k: string }).k}`} lines={[[avg, avg === "Frequency" ? String((payload[0].payload as { v: number }).v) : avg === "Return ($)" ? fmtMoney((payload[0].payload as { v: number }).v, cur) : `${(payload[0].payload as { v: number }).v}%`], ["Frequency", String((payload[0].payload as { n: number }).n)]]} /> : null} />
          <Bar dataKey="v" fill={kind === "Winners" ? "var(--color-chart-1)" : "var(--color-chart-2)"} maxBarSize={120} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function Drawdown({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const drawer = useTradeDrawer();
  const ordered = useMemo(() => sorted(trades), [trades]);
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)">("Return ($)");
  const { data, worst, avgDD, current, topBottom, bottomTop } = useMemo(() => {
    let eq = 0, peak = 0, peakIdx = 0;
    const pts = sorted(trades).map((t, i) => {
      eq += t.net_pnl;
      if (eq >= peak) { peak = eq; peakIdx = i; }
      const dd = eq - peak;
      return { x: i + 1, dd, ddPct: start + peak ? (dd / (start + peak)) * 100 : 0, peakIdx };
    });
    const min = pts.reduce((m, p) => (p.dd < m.dd ? p : m), pts[0] ?? { dd: 0, x: 0, peakIdx: 0, ddPct: 0 });
    const troughIdx = (min?.x ?? 1) - 1;
    const recover = pts.findIndex((p, i) => i > troughIdx && p.dd === 0);
    const negs = pts.filter((p) => p.dd < 0);
    return {
      data: pts.map((p) => ({ x: p.x, v: +(display === "Return ($)" ? p.dd : p.ddPct).toFixed(2) })),
      worst: Math.abs(min?.dd ?? 0), avgDD: negs.length ? Math.abs(negs.reduce((a, p) => a + p.dd, 0) / negs.length) : 0,
      current: Math.abs(pts[pts.length - 1]?.dd ?? 0), topBottom: troughIdx - (min?.peakIdx ?? 0), bottomTop: recover > 0 ? recover - troughIdx : 0,
    };
  }, [trades, display, start]);
  return (
    <div className="space-y-4">
      <ChartCard size="full" controls={<Select label="Display" value={display} options={["Return ($)", "Return (%)"] as const} onChange={setDisplay} />}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }} className="cursor-pointer" onClick={(e: { activeIndex?: number | string | null }) => { const t = ordered[Number(e?.activeIndex)]; if (t) drawer.open(t); }}>
            <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset={0} stopColor="var(--color-chart-2)" stopOpacity={0.05} /><stop offset={1} stopColor="var(--color-chart-2)" stopOpacity={0.85} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(data.length)} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={58} tickFormatter={tickFmt} {...yScale(data.map((d) => d.v))} label={{ value: `Drawdown (${display === "Return ($)" ? "$" : "%"})`, angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <Tip title={`Trade #${(payload[0].payload as { x: number }).x}`} lines={[["Drawdown", display === "Return ($)" ? fmtMoney((payload[0].payload as { v: number }).v, cur) : `${(payload[0].payload as { v: number }).v}%`]]} /> : null} />
            <Area type="monotone" dataKey="v" stroke="var(--color-chart-2)" strokeWidth={1.5} fill="url(#ddg)" baseValue={0} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="Worst Drawdown" value={fmtMoney(worst, cur)} />
        <AccentStat label="Average Drawdown" value={fmtMoney(avgDD, cur)} />
        <AccentStat label="Current Drawdown" value={fmtMoney(current, cur)} />
        <AccentStat label="Top to Bottom" value={topBottom} />
        <AccentStat label="Bottom to Top" value={bottomTop} />
      </Stats>
    </div>
  );
}

function Efficiency({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const s = sorted(trades);
  const ordered = s;
  const mistake = (t: Trade, phase?: string) => t.comments.some((c) => c.sentiment === "negative" && (!phase || c.phase === phase));
  let clean = 0;
  const data = s.map((t, i) => { if (!mistake(t)) clean++; return { x: i + 1, v: +((clean / (i + 1)) * 100).toFixed(2) }; });
  if (!data.length) return <Empty>No trades yet.</Empty>;
  const best = Math.max(...data.map((d) => d.v));
  let bestIdx = 0; data.forEach((d, i) => { if (d.v === best) bestIdx = i; });
  const pct = (f: (t: Trade) => boolean, ts = s) => (ts.length ? (ts.filter(f).length / ts.length) * 100 : 0);
  const rows = (["entry", "exit", "management"] as const).map((p) => ({ k: p === "entry" ? "Entries" : p === "exit" ? "Exits" : "Management", m: pct((t) => mistake(t, p)), f: pct((t) => t.comments.some((c) => c.phase === p && c.sentiment === "positive")) }));
  return (
    <div className="space-y-4">
      <ChartCard size="md">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }} className="cursor-pointer" onClick={(e: { activeIndex?: number | string | null }) => { const t = ordered[Number(e?.activeIndex)]; if (t) drawer.open(t); }}>
            <defs><linearGradient id="effg" x1="0" y1="0" x2="0" y2="1"><stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.75} /><stop offset={1} stopColor="var(--color-chart-1)" stopOpacity={0.05} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(data.length)} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} {...pctScale} label={{ value: "Efficiency (%)", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <Tip title={`Trade #${(payload[0].payload as { x: number }).x}`} lines={[["Efficiency", `${(payload[0].payload as { v: number }).v}%`]]} /> : null} />
            <Area type="monotone" dataKey="v" stroke="var(--color-chart-1)" strokeWidth={1.5} fill="url(#effg)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <section className="max-w-md rounded-xl border bg-card">
        <table className="w-full text-xs tabular"><thead><tr className="border-b">{["", "Total Mistakes (%)", "Followed Trade Plan (%)"].map((h) => <th key={h} className="px-3 py-2.5 text-right font-semibold first:text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.k} className="border-b border-border/50 last:border-0"><td className="px-3 py-2">{r.k}</td><td className="px-3 py-2 text-right">{fmtNum(r.m)}%</td><td className="px-3 py-2 text-right">{fmtNum(r.f)}%</td></tr>)}</tbody></table>
      </section>
      <Stats>
        <AccentStat label="Best efficiency" value={`${fmtNum(best)}%`} />
        <AccentStat label="Trades since efficiency high" value={data.length - 1 - bestIdx} />
        <AccentStat label="Current Efficiency" value={`${fmtNum(data[data.length - 1].v)}%`} />
        <AccentStat label="Trades Without Mistake" value={`${fmtNum(pct((t) => !mistake(t)))}%`} />
        <AccentStat label="Winners With Mistake" value={`${fmtNum(pct((t) => mistake(t), s.filter(isWin)))}%`} />
        <AccentStat label="Losers With Mistake" value={`${fmtNum(pct((t) => mistake(t), s.filter(isLoss)))}%`} />
      </Stats>
    </div>
  );
}

function ExitAnalysis({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const rows = sorted(trades).filter((t) => t.stop_loss != null && t.take_profit != null && t.high_price != null && t.low_price != null && t.exit_price != null);
  if (!rows.length) return <Empty>Add stop loss, take profit and the highest / lowest price during the trade (Advanced Data) to see exit analysis.</Empty>;
  const data = rows.slice(-30).map((t, i) => {
    const long = t.direction === "long";
    const tp = Math.abs(Number(t.take_profit) - t.entry_price) || 1;
    const sl = Math.abs(t.entry_price - Number(t.stop_loss)) || 1;
    const up = long ? Number(t.high_price) - t.entry_price : t.entry_price - Number(t.low_price);
    const dn = long ? t.entry_price - Number(t.low_price) : Number(t.high_price) - t.entry_price;
    const ex = long ? t.exit_price! - t.entry_price : t.entry_price - t.exit_price!;
    return { x: i + 1, up: +((Math.max(0, up) / tp) * 100).toFixed(1), dn: -+((Math.max(0, dn) / sl) * 100).toFixed(1), exit: +((ex >= 0 ? ex / tp : ex / sl) * 100).toFixed(1), win: isWin(t), trade: t };
  });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const W = data.filter((d) => d.win), L = data.filter((d) => !d.win);
  const yt = niceTicks(Math.min(-100, ...data.map((d) => Math.min(d.dn, d.exit))), Math.max(100, ...data.map((d) => Math.max(d.up, d.exit))), 6);
  return (
    <div className="space-y-4">
      <ChartCard size="full" legend={<><Dot c="bg-profit">Updraw</Dot><Dot c="bg-loss">Drawdown</Dot></>}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: 4, bottom: 18 }} className="cursor-pointer" onClick={(e: { activeIndex?: number | string | null }) => { const d = data[Number(e?.activeIndex)]; if (d) drawer.open(d.trade); }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} ticks={yt.ticks} domain={[yt.lo, yt.hi]} interval={0} label={{ value: "Updraw / Drawdown", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <ReferenceLine y={100} stroke="var(--color-chart-1)" />
            <ReferenceLine y={-100} stroke="var(--color-chart-2)" />
            <ReferenceLine y={0} stroke="var(--color-foreground)" />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <Tip title={`Trade ${(payload[0].payload as { x: number }).x}`} lines={[["Updraw", `${(payload[0].payload as { up: number }).up}%`], ["Drawdown", `${(payload[0].payload as { dn: number }).dn}%`], ["Exit", `${(payload[0].payload as { exit: number }).exit}%`]]} /> : null} />
            <Bar dataKey="up" stackId="a" fill="var(--color-chart-1)" isAnimationActive={false} />
            <Bar dataKey="dn" stackId="a" fill="var(--color-chart-2)" isAnimationActive={false} />
            <Scatter dataKey="exit" fill="#111" shape={(pp: { cx?: number; cy?: number }) => <circle cx={pp.cx} cy={pp.cy} r={2.5} fill="#111" />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat info="Share of trades whose price reached the take profit" label="Trades Hit TP" value={`${fmtNum((data.filter((d) => d.up >= 100).length / data.length) * 100)}%`} />
        <AccentStat info="Share of trades whose price reached the stop loss" label="Trades Hit SL" value={`${fmtNum((data.filter((d) => d.dn <= -100).length / data.length) * 100)}%`} />
        <AccentStat label="Avg. Updraw Winner" value={`${Math.round(avg(W.map((d) => d.up)))}%`} />
        <AccentStat label="Avg. Updraw Loser" value={`${Math.round(avg(L.map((d) => d.up)))}%`} />
        <AccentStat label="Avg. Drawdown Winner" value={`${Math.round(avg(W.map((d) => d.dn)))}%`} />
        <AccentStat label="Avg. Drawdown Loser" value={`${Math.round(avg(L.map((d) => d.dn)))}%`} />
        <AccentStat label="Avg. Exit Winner" value={`${fmtNum(avg(W.map((d) => d.exit)))}%`} />
        <AccentStat label="Avg. Exit Loser" value={`${fmtNum(avg(L.map((d) => d.exit)))}%`} />
      </Stats>
    </div>
  );
}

function HoldingTime({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const drawer = useTradeDrawer();
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)" | "R Multiple (R)">("Return ($)");
  const [unit, setUnit] = useState<"Minutes" | "Hours" | "Days">("Days");
  const div = unit === "Days" ? 1440 : unit === "Hours" ? 60 : 1;
  const pts = trades.filter((t) => t.holdMinutes != null).map((t, i) => ({ x: +(t.holdMinutes! / div).toFixed(2), y: +(display === "Return ($)" ? t.net_pnl : display === "Return (%)" ? t.retPct : (t.r ?? 0)).toFixed(2), id: i + 1, trade: t, exit: t.exit_at?.slice(0, 16).replace("T", " ") ?? "", win: t.net_pnl >= 0, pnl: t.net_pnl }));
  if (!pts.length) return <Empty>Add exit dates to your trades to see holding time.</Empty>;
  const W = pts.filter((p) => p.win && p.pnl > 0), L = pts.filter((p) => p.pnl < 0);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const big = (a: typeof pts, f: (a: number, b: number) => boolean) => a.reduce<(typeof pts)[number] | null>((m, p) => (!m || f(p.pnl, m.pnl) ? p : m), null);
  const xt = niceTicks(0, Math.max(...pts.map((p) => p.x)), 15);
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 6);
  return (
    <div className="space-y-4">
      <ChartCard size="lg" controls={<><Select label="Display" value={display} options={["Return ($)", "Return (%)", "R Multiple (R)"] as const} onChange={setDisplay} /><Select label="Time Settings" value={unit} options={["Minutes", "Hours", "Days"] as const} onChange={setUnit} /></>}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis type="number" dataKey="x" ticks={xt.ticks} domain={[xt.lo, xt.hi]} interval={0} tick={axis} tickLine={false} axisLine={false} label={{ value: unit, position: "insideBottom", offset: -12, style: axis }} />
            <YAxis type="number" dataKey="y" ticks={yt.ticks} domain={[yt.lo, yt.hi]} interval={0} tick={axis} tickLine={false} axisLine={false} width={58} tickFormatter={tickFmt} label={{ value: display, angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const p = payload[0].payload as (typeof pts)[number]; return <Tip title={`Trade #${p.id}`} lines={[["Exit Date", p.exit], ["Holding Time", `${p.x} ${unit.toLowerCase()}`], ["Return", display === "Return ($)" ? fmtMoney(p.y, cur) : String(p.y)]]} />; }} />
            <Scatter data={pts} isAnimationActive={false} cursor="pointer" onClick={(d: { payload?: { trade?: Trade } }) => d?.payload?.trade && drawer.open(d.payload.trade)}>{pts.map((p, i) => <Cell key={i} fill={p.y >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} />)}</Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label={`Winners Holding Time Avg (${unit})`} value={fmtNum(avg(W.map((p) => p.x)))} />
        <AccentStat label={`Losers Holding Time Avg (${unit})`} value={fmtNum(avg(L.map((p) => p.x)))} />
        <AccentStat label={`Winners Holding Time Sum (${unit})`} value={fmtNum(W.reduce((a, p) => a + p.x, 0))} />
        <AccentStat label={`Losers Holding Time Sum (${unit})`} value={fmtNum(L.reduce((a, p) => a + p.x, 0))} />
        <AccentStat info="Holding time of the trade with the biggest gain" label={`Biggest Winner (${unit})`} value={fmtNum(big(W, (a, b) => a > b)?.x ?? 0)} />
        <AccentStat info="Holding time of the trade with the biggest loss" label={`Biggest Loser (${unit})`} value={fmtNum(big(L, (a, b) => a < b)?.x ?? 0)} />
      </Stats>
    </div>
  );
}

const RATIOS = ["Sharpe Ratio", "Sortino Ratio", "Gain To Pain", "Calmar", "Profit Factor", "SQN"] as const;
type Ratio = (typeof RATIOS)[number];
const RATIO_COLORS: Record<Ratio, string> = { "Sharpe Ratio": "var(--color-chart-5)", "Sortino Ratio": "var(--color-chart-4)", "Gain To Pain": "var(--color-chart-1)", Calmar: "var(--color-chart-3)", "Profit Factor": "var(--color-chart-2)", SQN: "var(--color-foreground)" };

function Ratios({ trades, start }: { trades: Trade[]; start: number }) {
  const [sel, setSel] = useState<Set<Ratio>>(new Set(["Sharpe Ratio"]));
  const data = useMemo(() => {
    const s = sorted(trades);
    let eq = 0, peak = 0, maxDD = 0;
    return s.map((t, i) => {
      const w = s.slice(0, i + 1).map((x) => x.net_pnl);
      const rs = s.slice(0, i + 1).map((x) => x.r ?? 0);
      eq += t.net_pnl; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
      const m = w.reduce((a, b) => a + b, 0) / w.length;
      const sd = stdev(w), dsd = stdev(w.filter((x) => x < 0));
      const gw = w.filter((x) => x > 0).reduce((a, b) => a + b, 0), gl = Math.abs(w.filter((x) => x < 0).reduce((a, b) => a + b, 0));
      const r = (v: number) => (isFinite(v) ? +v.toFixed(3) : null);
      return {
        x: i + 1,
        "Sharpe Ratio": r(sd ? m / sd : 0), "Sortino Ratio": r(dsd ? m / dsd : 0), "Gain To Pain": r(gl ? (gw - gl) / gl : 0),
        Calmar: r(maxDD && start ? (eq / start) / (maxDD / start) : 0), "Profit Factor": r(gl ? gw / gl : 0),
        SQN: r(stdev(rs) ? (rs.reduce((a, b) => a + b, 0) / rs.length / stdev(rs)) * Math.sqrt(Math.min(rs.length, 100)) : 0),
      };
    });
  }, [trades, start]);
  const label = [...sel].join(", ") || "Select ratio";
  return (
    <ChartCard size="full"
      controls={
        <div className="relative rounded-md border bg-card px-3 pb-1.5 pt-3">
          <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">Ratio</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-72 items-center justify-between gap-2 text-sm"><span className="truncate">{label}</span><ChevronDown className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {RATIOS.map((r) => <DropdownMenuCheckboxItem key={r} checked={sel.has(r)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => setSel((p) => { const n = new Set(p); n.has(r) ? n.delete(r) : n.add(r); return n; })} className="py-2">{r}</DropdownMenuCheckboxItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
      legend={[...sel].map((r) => <span key={r} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: RATIO_COLORS[r] }} />{r}</span>)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={40} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={50} {...yScale(seriesValues(data as unknown as Record<string, unknown>[], [...sel]))} label={{ value: [...sel][0] ?? "", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
          <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} labelFormatter={(l) => `Trade #${l}`} />
          {[...sel].map((r) => <Line key={r} type="monotone" dataKey={r} stroke={RATIO_COLORS[r]} strokeWidth={1.5} dot={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function RiskDistribution({ trades, start }: { trades: Trade[]; start: number }) {
  const [display, setDisplay] = useState<"Return (%)" | "R Multiple (R)">("Return (%)");
  const step = display === "Return (%)" ? 0.25 : 0.5;
  const lim = display === "Return (%)" ? 10 : 10;
  const buckets: { k: string; lo: number; hi: number; n: number }[] = [{ k: `< -${lim}`, lo: -Infinity, hi: -lim, n: 0 }];
  for (let x = -lim; x < lim; x += step) buckets.push({ k: `${+x.toFixed(2)} to ${+(x + step).toFixed(2)}`, lo: x, hi: x + step, n: 0 });
  buckets.push({ k: `> ${lim}`, lo: lim, hi: Infinity, n: 0 });
  const vals = trades.map((t) => (display === "Return (%)" ? (start ? (t.net_pnl / start) * 100 : 0) : t.r)).filter((v): v is number => v != null);
  vals.forEach((v) => { const b = buckets.find((b) => v >= b.lo && v < b.hi); if (b) b.n++; });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const suf = display === "Return (%)" ? "%" : "R";
  return (
    <div className="space-y-4">
      <ChartCard controls={<Select label="Display" value={display} options={["Return (%)", "R Multiple (R)"] as const} onChange={setDisplay} />}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 8, left: 10, bottom: 30 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="k" tick={{ ...axis, fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={-50} textAnchor="end" height={60} label={{ value: display === "Return (%)" ? "Return, gain sum (%)" : "R Multiple", position: "insideBottom", offset: -24, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={40} {...yScale(buckets.map((b) => b.n), { integer: true })} label={{ value: "Number of Trades", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} content={({ active, payload }) => active && payload?.length ? <Tip title={(payload[0].payload as { k: string }).k} lines={[["Trades", String((payload[0].payload as { n: number }).n)]]} /> : null} />
            <Bar dataKey="n" isAnimationActive={false}>{buckets.map((b, i) => <Cell key={i} fill={b.hi <= 0 ? "var(--color-chart-2)" : "var(--color-chart-1)"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label={`Avg ${display}`} value={`${fmtNum(avg(vals))}${suf}`} />
        <AccentStat label={`Total ${display}`} value={`${fmtNum(vals.reduce((a, b) => a + b, 0))}${suf}`} />
        <AccentStat label={`Avg ${display} Winner`} value={`${fmtNum(avg(vals.filter((v) => v > 0)))}${suf}`} />
        <AccentStat label={`Avg ${display} Loser`} value={`${fmtNum(avg(vals.filter((v) => v < 0)))}${suf}`} tone="neg" />
      </Stats>
    </div>
  );
}

function SQN({ trades, start }: { trades: Trade[]; start: number }) {
  const s = computeStats(trades, start);
  const rate = (q: number) => q < 1.6 ? "Poor" : q < 2 ? "Below average" : q < 2.5 ? "Average" : q < 3 ? "Good" : q < 5 ? "Excellent" : "Superb";
  const rating = rate(s.sqn);
  const bySetup = [...groupBy(trades, (t) => t.setup || "No setup").entries()].map(([k, ts]) => {
    const rs = ts.map((t) => t.r ?? 0);
    const avg = rs.reduce((a, x) => a + x, 0) / rs.length;
    const sd = stdev(rs);
    return { k, n: ts.length, avg, sqn: sd ? (avg / sd) * Math.sqrt(Math.min(rs.length, 100)) : 0 };
  }).sort((a, b) => b.sqn - a.sqn);
  const roll = sorted(trades).map((_, i, arr) => {
    const w = arr.slice(Math.max(0, i - 29), i + 1).map((t) => t.r ?? 0);
    return { x: i + 1, v: w.length > 2 && stdev(w) ? +((w.reduce((a, x) => a + x, 0) / w.length / stdev(w)) * Math.sqrt(w.length)).toFixed(2) : 0 };
  });
  return (
    <div className="space-y-4">
      <ChartCard legend={<Dot c="bg-chart-5">Rolling SQN (30 trades)</Dot>}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={roll} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(roll.length ? Math.max(...roll.map((r) => r.x)) : 1)} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} {...yScale(roll.map((r) => r.v))} label={{ value: "SQN", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} labelFormatter={(l) => `Trade #${l}`} />
            <Line type="monotone" dataKey="v" name="SQN" stroke="var(--color-chart-5)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats><AccentStat label="SQN" value={fmtNum(s.sqn)} /><AccentStat label="Rating" value={rating} /><AccentStat label="Trades" value={s.count} /><AccentStat label="Avg. R" value={`${fmtNum(s.avgR)}R`} /></Stats>
      <section className="rounded-xl border bg-card">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">SQN by Setup</h3>
        <table className="w-full text-sm tabular">
          <thead className="text-left text-xs text-muted-foreground"><tr className="border-b">{["Setup", "Trades", "Avg. R", "SQN", "Rating"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{bySetup.map((g) => (
            <tr key={g.k} className="border-b last:border-0">
              <td className="px-4 py-2">{g.k}</td><td className="px-4 py-2">{g.n}</td><td className="px-4 py-2">{fmtNum(g.avg)}R</td>
              <td className={cn("px-4 py-2 font-semibold", g.sqn < 0 ? "text-loss" : g.sqn >= 2 ? "text-profit" : "")}>{g.n > 1 ? fmtNum(g.sqn) : "–"}</td>
              <td className="px-4 py-2 text-muted-foreground">{g.n > 1 ? rate(g.sqn) : "Need 2+ trades"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

function WinRate({ trades }: { trades: Trade[] }) {
  const s = sorted(trades);
  const d = s.map((_, i) => { const w = s.slice(Math.max(0, i - 19), i + 1); return { x: i + 1, rolling: +((w.filter(isWin).length / w.length) * 100).toFixed(1), overall: +((s.slice(0, i + 1).filter(isWin).length / (i + 1)) * 100).toFixed(1) }; });
  const last = d[d.length - 1];
  return (
    <div className="space-y-4">
      <ChartCard legend={<><Dot c="bg-profit">Winrate</Dot><Dot c="bg-chart-5">Rolling (20)</Dot></>}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={d} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(d.length ? Math.max(...d.map((p) => p.x)) : 1)} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} {...pctScale} label={{ value: "Winrate (%)", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }} labelFormatter={(l) => `Trade #${l}`} />
            <Line type="monotone" dataKey="overall" name="Winrate" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="rolling" name="Rolling (20)" stroke="var(--color-chart-5)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats><AccentStat label="Current Winrate" value={`${fmtNum(last?.overall ?? 0)}%`} /><AccentStat label="Rolling (20)" value={`${fmtNum(last?.rolling ?? 0)}%`} /><AccentStat label="Best Rolling" value={`${fmtNum(Math.max(0, ...d.map((x) => x.rolling)))}%`} /><AccentStat label="Worst Rolling" value={`${fmtNum(Math.min(100, ...d.map((x) => x.rolling)))}%`} tone="neg" /></Stats>
    </div>
  );
}

const PHASES = { "Trade Entry": "entry", "Trade Management": "management", "Trade Exit": "exit" } as const;
type PhaseLabel = keyof typeof PHASES;
function Comments({ trades, start, cur, fixed }: { trades: Trade[]; start: number; cur: string; fixed?: PhaseLabel }) {
  const [phase, setPhase] = useState<PhaseLabel>(fixed ?? "Trade Entry");
  const p = PHASES[phase];
  const by = useMemo(() => (t: Trade) => t.comments.filter((c) => c.phase === p).map((c) => c.label), [p]);
  const has = trades.some((t) => t.comments.some((c) => c.phase === p));
  return (
    <GroupChart showTable={false} trades={has ? trades : []} start={start} cur={cur} by={by} noun="Comment"
      extraControl={fixed ? undefined : <Select label="Trade Comment" value={phase} options={Object.keys(PHASES) as PhaseLabel[]} onChange={setPhase} />} />
  );
}

/* ---------------- page ---------------- */
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ChartPage() {
  const { chart } = Route.useParams();
  const { trades, journal } = useTrades();
  const cur = journal?.currency ?? "USD";
  const start = journal?.starting_balance ?? 0;
  const bySetup = useMemo(() => (t: Trade) => [t.setup], []);
  const byInst = useMemo(() => (t: Trade) => [t.instrument], []);
  if (!trades.length) return <Empty>No trades to analyse yet.</Empty>;
  switch (chart) {
    case "compare": return <Compare trades={trades} cur={cur} start={start} />;
    case "consecutive": return <Consecutive trades={trades} cur={cur} start={start} />;
    case "custom-statistics": return <CustomStatistics trades={trades} start={start} cur={cur} />;
    case "drawdown": return <Drawdown trades={trades} cur={cur} start={start} />;
    case "efficiency": return <Efficiency trades={trades} />;
    case "exit-analysis": return <ExitAnalysis trades={trades} />;
    case "holding-time": return <HoldingTime trades={trades} cur={cur} start={start} />;
    case "instrument": return <GroupChart trades={trades} start={start} cur={cur} by={byInst} noun="Instrument" />;
    case "setup": return <GroupChart trades={trades} start={start} cur={cur} by={bySetup} noun="Setup" />;
    case "time": return <PerformanceByTime trades={trades} start={start} cur={cur} />;
    case "day": return <PerformanceByDay trades={trades} cur={cur} />;
    case "ratios": return <Ratios trades={trades} start={start} />;
    case "risk-distribution": return <RiskDistribution trades={trades} start={start} />;
    case "sqn": return <SQN trades={trades} start={start} />;
    case "trade-comments": return <Comments trades={trades} start={start} cur={cur} />;
    case "trade-management": return <TradeManagement trades={trades} />;
    case "win-rate": return <WinRate trades={trades} />;
  }
  return null;
}

/* ---------------- Compare Charts: two trade groups side by side ---------------- */
const DIMS = ["All Trades", "Setup", "Instrument", "Weekday", "Direction"] as const;
type Dim = (typeof DIMS)[number];
const dimKey = (d: Dim, t: Trade) => d === "Setup" ? t.setup : d === "Instrument" ? t.instrument : d === "Weekday" ? DAYS[(new Date(t.entry_at).getDay() + 6) % 7] : d === "Direction" ? (t.direction === "short" ? "Short" : "Long") : "All";

function GroupPicker({ label, dim, val, setDim, setVal, trades }: { label: string; dim: Dim; val: string; setDim: (d: Dim) => void; setVal: (v: string) => void; trades: Trade[] }) {
  const vals = useMemo(() => [...new Set(trades.map((t) => dimKey(dim, t)))].sort(), [trades, dim]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Select label="Group by" value={dim} options={DIMS} onChange={(d) => { setDim(d); setVal(d === "All Trades" ? "All" : [...new Set(trades.map((t) => dimKey(d, t)))].sort()[0] ?? ""); }} width="w-32" />
      {dim !== "All Trades" && <Select label={dim} value={val} options={vals} onChange={setVal} />}
    </div>
  );
}

function Compare({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const [dA, setDA] = useState<Dim>("All Trades"); const [vA, setVA] = useState("All");
  const [dB, setDB] = useState<Dim>("Direction"); const [vB, setVB] = useState("Long");
  const gA = useMemo(() => sorted(trades.filter((t) => dimKey(dA, t) === vA)), [trades, dA, vA]);
  const gB = useMemo(() => sorted(trades.filter((t) => dimKey(dB, t) === vB)), [trades, dB, vB]);
  const nameA = dA === "All Trades" ? "All Trades" : vA, nameB = dB === "All Trades" ? "All Trades" : vB;
  const data = Array.from({ length: Math.max(gA.length, gB.length) }, (_, i) => ({
    n: i + 1,
    A: i < gA.length ? +gA.slice(0, i + 1).reduce((s, t) => s + t.net_pnl, 0).toFixed(2) : null,
    B: i < gB.length ? +gB.slice(0, i + 1).reduce((s, t) => s + t.net_pnl, 0).toFixed(2) : null,
  }));
  const sA = computeStats(gA, start), sB = computeStats(gB, start);
  const rows: [string, (s: typeof sA) => string][] = [
    ["Trades", (s) => String(s.count)], ["Net Return", (s) => fmtMoney(s.net, cur)], ["Winrate", (s) => `${s.winRate.toFixed(2)}%`],
    ["Profit Factor", (s) => (Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞")], ["Avg. P&L", (s) => fmtMoney(s.avgPnl, cur)],
    ["Avg. Winner", (s) => fmtMoney(s.avgWin, cur)], ["Avg. Loser", (s) => fmtMoney(s.avgLoss, cur)], ["Avg. R", (s) => fmtNum(s.avgR)], ["Max Drawdown", (s) => `${s.maxDD.toFixed(2)}%`],
  ];
  return (
    <div className="space-y-4">
      <ChartCard controls={<div className="flex flex-wrap gap-6">
        <GroupPicker label="A" dim={dA} val={vA} setDim={setDA} setVal={setVA} trades={trades} />
        <GroupPicker label="B" dim={dB} val={vB} setDim={setDB} setVal={setVB} trades={trades} />
      </div>} legend={<><Dot c="bg-profit">{nameA}</Dot><Dot c="bg-info">{nameB}</Dot></>}>
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-grid)" />
              <XAxis dataKey="n" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(data.length)} label={{ value: "Trades", position: "insideBottom", offset: -2, style: axis }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={60} tickFormatter={tickFmt} {...yScale(seriesValues(data as unknown as Record<string, unknown>[], ["A", "B"]))} />
              <ReferenceLine y={0} stroke="var(--color-foreground)" />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <Tip title={`Trade ${label}`} lines={payload.map((p) => [p.dataKey === "A" ? nameA : nameB, fmtMoney(Number(p.value), cur)] as [string, string])} /> : null} />
              <Line dataKey="A" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-chart-1)" connectNulls={false} />
              <Line dataKey="B" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-info)" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <section className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm tabular">
          <thead><tr className="border-b text-left"><th className="px-4 py-2.5 font-semibold">Statistic</th><th className="px-4 text-right font-semibold">{nameA}</th><th className="px-4 text-right font-semibold">{nameB}</th></tr></thead>
          <tbody>{rows.map(([l, f]) => <tr key={l} className="border-b border-border/40"><td className="px-4 py-2">{l}</td><td className="px-4 text-right">{f(sA)}</td><td className="px-4 text-right">{f(sB)}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

/* ---------------- Performance by Time (period selector) ---------------- */
const PERIODS = ["Weekday", "Month", "Week", "Year", "Hour", "30 Minutes", "15 Minutes", "10 Minutes", "5 Minutes"] as const;
type Period = (typeof PERIODS)[number];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
function periodKey(p: Period, d: Date) {
  const slot = (m: number) => { const mm = Math.floor(d.getMinutes() / m) * m; return `${pad(d.getHours())}:${pad(mm)}`; };
  switch (p) {
    case "Weekday": return DAYS[(d.getDay() + 6) % 7];
    case "Month": return MONTHS[d.getMonth()];
    case "Week": return `Week ${pad(isoWeek(d))}`;
    case "Year": return String(d.getFullYear());
    case "Hour": return HOURS[d.getHours()];
    case "30 Minutes": return slot(30);
    case "15 Minutes": return slot(15);
    case "10 Minutes": return slot(10);
    case "5 Minutes": return slot(5);
  }
}
const periodOrder = (p: Period) => p === "Weekday" ? DAYS : p === "Month" ? MONTHS : undefined;

function PerformanceByTime({ trades, start, cur }: { trades: Trade[]; start: number; cur: string }) {
  const [period, setPeriod] = useState<Period>("Weekday");
  const [dateField, setDateField] = useState<"Entry Date" | "Exit Date">("Entry Date");
  const by = useMemo(() => (t: Trade) => { const iso = dateField === "Exit Date" && t.exit_at ? t.exit_at : t.entry_at; return [periodKey(period, new Date(iso))]; }, [period, dateField]);
  const noun = period === "Weekday" ? "Day" : period.includes("Minutes") ? "Time Slot" : period;
  return <GroupChart key={period} trades={trades} start={start} cur={cur} by={by} noun={noun} order={periodOrder(period) ?? []}
    extraControl={<><Select label="Period" value={period} options={PERIODS} onChange={setPeriod} /><Select label="Date Settings" value={dateField} options={["Entry Date", "Exit Date"] as const} onChange={setDateField} /></>} />;
}

/* ---------------- Performance by Day (one bar per trading day) ---------------- */
function PerformanceByDay({ trades, cur }: { trades: Trade[]; cur: string }) {
  const [days, setDays] = useState(50);
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)" | "R Multiple (R)">("Return ($)");
  const [dateBy, setDateBy] = useState<"Entry Date" | "Exit Date">("Entry Date");
  const all = useMemo(() => {
    const m = new Map<string, { k: string; pnl: number; pct: number; r: number; n: number; w: number; l: number; be: number }>();
    trades.forEach((t) => {
      const k = (dateBy === "Exit Date" ? t.exit_at ?? t.entry_at : t.entry_at).slice(0, 10);
      const d = m.get(k) ?? { k, pnl: 0, pct: 0, r: 0, n: 0, w: 0, l: 0, be: 0 };
      d.pnl += t.net_pnl; d.pct += t.retPct; d.r += t.r ?? 0; d.n++;
      if (isWin(t)) d.w++; else if (isLoss(t)) d.l++; else d.be++;
      m.set(k, d);
    });
    return [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
  }, [trades, dateBy]);
  const dayName = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const shown = all.slice(-days).map((d) => ({ k: d.k, n: d.n, w: d.w, l: d.l, be: d.be, v: +(display === "Return ($)" ? d.pnl : display === "Return (%)" ? d.pct : d.r).toFixed(2) }));
  const win = all.filter((d) => d.pnl > 0), loss = all.filter((d) => d.pnl < 0);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const fmtV = (v: number) => display === "Return ($)" ? fmtMoney(v, cur) : display === "Return (%)" ? `${fmtNum(v)}%` : `${fmtNum(v)}R`;
  return (
    <div className="space-y-4">
      <ChartCard size="full" controls={<><Select label="Display" value={display} options={["Return ($)", "Return (%)", "R Multiple (R)"] as const} onChange={setDisplay} /><Select label="Date Settings" value={dateBy} options={["Entry Date", "Exit Date"] as const} onChange={setDateBy} />
        <label className="flex items-center gap-2 text-[12px]">Days Shown ({days})<input type="range" min={50} max={180} step={10} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40 accent-primary" /></label></>}>
        <BarsBig data={shown} yLabel={display} fmt={fmtV} extra={(d) => { const x = d as unknown as { k: string; n: number; w: number; l: number; be: number }; return [["Weekday", dayName(x.k)], ["Number of trades", String(x.n)], ["Winners", String(x.w)], ["Losers", String(x.l)], ["Break evens", String(x.be)]]; }} hideTicks />
      </ChartCard>
      <Stats>
        <AccentStat label="Trading Days" value={all.length} />
        <AccentStat label="Winning Days" value={win.length} />
        <AccentStat label="Losing Days" value={loss.length} />
        <AccentStat label="Avg. Winning Day" value={fmtMoney(avg(win.map((d) => d.pnl)), cur)} />
        <AccentStat label="Avg. Losing Day" value={fmtMoney(avg(loss.map((d) => d.pnl)), cur)} tone={loss.length ? "neg" : undefined} />
        <AccentStat label="Avg. Trades per Day" value={fmtNum(avg(all.map((d) => d.n)))} />
      </Stats>
    </div>
  );
}

/* ---------------- Custom Statistics (statistic picker) ---------------- */
function CustomStatistics({ trades, start, cur }: { trades: Trade[]; start: number; cur: string }) {
  const journalId = trades[0]?.journal_id;
  const { data } = useLookups(journalId);
  const cats = data?.statCategories ?? [];
  const [catId, setCatId] = useState<string>("");
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const opts = useMemo(() => new Map((data?.statOptions ?? []).filter((o) => o.category_id === cat?.id).map((o) => [o.id, o.label])), [data, cat?.id]);
  const by = useMemo(() => (t: Trade) => t.customStats.filter((id) => opts.has(id)).map((id) => opts.get(id)!), [opts]);
  if (!cats.length) return <Empty>Create custom statistics in Settings to analyse them here.</Empty>;
  const names = cats.map((c) => c.name);
  return <GroupChart key={cat?.id} trades={trades} start={start} cur={cur} by={by} noun="Option"
    extraControl={<Select label="Custom Statistic" value={cat?.name ?? ""} options={names} onChange={(n) => setCatId(cats.find((c) => c.name === n)?.id ?? "")} width="w-48" />} />;
}

/* ---------------- Trade Management (actual vs set-and-forget potential) ---------------- */
function potentialR(t: Trade): number | null {
  if (t.stop_loss == null || t.take_profit == null) return null;
  const long = t.direction !== "short";
  const risk = Math.abs(t.entry_price - Number(t.stop_loss));
  if (!risk) return null;
  const tpR = Math.abs(Number(t.take_profit) - t.entry_price) / risk;
  if (t.otp_hit === true) return tpR;
  if (t.otp_hit === false) return -1;
  if (t.high_price != null && t.low_price != null) {
    const hitTp = long ? Number(t.high_price) >= Number(t.take_profit) : Number(t.low_price) <= Number(t.take_profit);
    const hitSl = long ? Number(t.low_price) <= Number(t.stop_loss) : Number(t.high_price) >= Number(t.stop_loss);
    if (hitTp && !hitSl) return tpR;
    if (hitSl && !hitTp) return -1;
  }
  return t.r ?? null;
}

function TradeManagement({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const rows = useMemo(() => sorted(trades).map((t) => ({ t, a: t.r, p: potentialR(t) })).filter((x): x is { t: Trade; a: number; p: number } => x.a != null && x.p != null), [trades]);
  if (!rows.length) return <Empty>Add a stop loss and take profit to your trades (plus whether the target was hit, or the high / low price) to see trade management.</Empty>;
  let A = 0, P = 0;
  const data = rows.map(({ t, a, p }, i) => { A += a; P += p; return { x: i + 1, actual: +A.toFixed(2), potential: +P.toFixed(2), effect: +(A - P).toFixed(2), trade: t }; });
  const managed = rows.filter((r) => Math.abs(r.a - r.p) > 1e-6);
  const good = managed.filter((r) => r.a > r.p).length;
  const last = data[data.length - 1];
  return (
    <div className="space-y-4">
      <ChartCard legend={<><Dot c="bg-chart-5">Actual R</Dot><Dot c="bg-profit">R gained by managing</Dot><Dot c="bg-muted-foreground">Potential R</Dot></>}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }} className="cursor-pointer" onClick={(e: { activeIndex?: number | string | null }) => { const d = data[Number(e?.activeIndex)]; if (d) drawer.open(d.trade); }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(data.length)} label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={50} {...yScale(seriesValues(data as unknown as Record<string, unknown>[], ["actual", "potential", "effect"]))} label={{ value: "R Multiple", angle: -90, position: "insideLeft", style: { ...axis, textAnchor: "middle" } }} />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload as (typeof data)[number]; return <Tip title={`Trade #${d.x}`} lines={[["Actual", `${fmtNum(d.actual)}R`], ["Potential", `${fmtNum(d.potential)}R`], ["Managing effect", `${fmtNum(d.effect)}R`]]} />; }} />
            <Line type="monotone" dataKey="actual" stroke="var(--color-chart-5)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="effect" stroke="var(--color-chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="potential" stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="Actual R" value={`${fmtNum(last.actual)}R`} />
        <AccentStat label="Potential R" value={`${fmtNum(last.potential)}R`} />
        <AccentStat label="R gained by managing" value={`${fmtNum(last.effect)}R`} tone={last.effect < 0 ? "neg" : undefined} />
        <AccentStat label="Managed correctly" value={`${fmtNum(managed.length ? (good / managed.length) * 100 : 0)}%`} />
        <AccentStat label="Managed incorrectly" value={`${fmtNum(managed.length ? ((managed.length - good) / managed.length) * 100 : 0)}%`} tone={managed.length - good ? "neg" : undefined} />
      </Stats>
    </div>
  );
}
