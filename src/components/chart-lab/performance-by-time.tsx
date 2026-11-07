import { localDay } from "@/lib/time/local-time";
import { useDrillDown } from "@/lib/journal/drilldown";
import type { Filters } from "@/lib/journal/journal-context";
import { useMemo, useState } from "react";
import { fmtMoney, fmtNum, isLoss, isWin, type Trade } from "@/lib/pnl/metrics";
import { AccentStat } from "@/components/kit";
import { DAYS, HOURS } from "@/components/chart-lab/calendar-labels";
import { BarsBig, GroupChart } from "@/components/chart-lab/group-chart";
import { ChartCard, Select, Stats } from "@/components/chart-lab/chart-kit";

/* ---------------- Performance by Time (period selector) ---------------- */
const PERIODS = [
  "Weekday",
  "Month",
  "Week",
  "Year",
  "Hour",
  "30 Minutes",
  "15 Minutes",
  "10 Minutes",
  "5 Minutes",
] as const;
type Period = (typeof PERIODS)[number];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const pad = (n: number) => String(n).padStart(2, "0");
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
function periodKey(p: Period, d: Date) {
  const slot = (m: number) => {
    const mm = Math.floor(d.getMinutes() / m) * m;
    return `${pad(d.getHours())}:${pad(mm)}`;
  };
  switch (p) {
    case "Weekday":
      return DAYS[(d.getDay() + 6) % 7];
    case "Month":
      return MONTHS[d.getMonth()];
    case "Week":
      return `Week ${pad(isoWeek(d))}`;
    case "Year":
      return String(d.getFullYear());
    case "Hour":
      return HOURS[d.getHours()];
    case "30 Minutes":
      return slot(30);
    case "15 Minutes":
      return slot(15);
    case "10 Minutes":
      return slot(10);
    case "5 Minutes":
      return slot(5);
  }
}
const periodOrder = (p: Period) => (p === "Weekday" ? DAYS : p === "Month" ? MONTHS : undefined);

export function PerformanceByTime({
  trades,
  start,
  cur,
}: {
  trades: Trade[];
  start: number;
  cur: string;
}) {
  const [period, setPeriod] = useState<Period>("Weekday");
  const [dateField, setDateField] = useState<"Entry Date" | "Exit Date">("Entry Date");
  const by = useMemo(
    () => (t: Trade) => {
      const iso = dateField === "Exit Date" && t.exit_at ? t.exit_at : t.entry_at;
      return [periodKey(period, new Date(iso))];
    },
    [period, dateField],
  );
  const noun = period === "Weekday" ? "Day" : period.includes("Minutes") ? "Time Slot" : period;
  const drill = (k: string): Filters | null => {
    if (dateField !== "Entry Date") return null;
    if (period === "Weekday") return { weekday: [(DAYS.indexOf(k) + 1) % 7] };
    if (period === "Month") return { month: [MONTHS.indexOf(k)] };
    if (period === "Year") return { year: [Number(k)] };
    if (period === "Hour") return { hour: [HOURS.indexOf(k)] };
    return null;
  };
  const canDrill =
    dateField === "Entry Date" && ["Weekday", "Month", "Year", "Hour"].includes(period);
  return (
    <GroupChart
      key={period}
      trades={trades}
      start={start}
      cur={cur}
      by={by}
      noun={noun}
      order={periodOrder(period) ?? []}
      drill={canDrill ? drill : undefined}
      extraControl={
        <>
          <Select label="Period" value={period} options={PERIODS} onChange={setPeriod} />
          <Select
            label="Date Settings"
            value={dateField}
            options={["Entry Date", "Exit Date"] as const}
            onChange={setDateField}
          />
        </>
      }
    />
  );
}

/* ---------------- Performance by Day (one bar per trading day) ---------------- */
export function PerformanceByDay({ trades, cur }: { trades: Trade[]; cur: string }) {
  const goDrill = useDrillDown();
  const [days, setDays] = useState(50);
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)" | "R Multiple (R)">(
    "Return ($)",
  );
  const [dateBy, setDateBy] = useState<"Entry Date" | "Exit Date">("Entry Date");
  const all = useMemo(() => {
    const m = new Map<
      string,
      {
        k: string;
        pnl: number;
        pct: number;
        r: number;
        n: number;
        w: number;
        l: number;
        be: number;
      }
    >();
    trades.forEach((t) => {
      const k = localDay(dateBy === "Exit Date" ? (t.exit_at ?? t.entry_at) : t.entry_at);
      const d = m.get(k) ?? { k, pnl: 0, pct: 0, r: 0, n: 0, w: 0, l: 0, be: 0 };
      d.pnl += t.net_pnl;
      d.pct += t.retPct;
      d.r += t.r ?? 0;
      d.n++;
      if (isWin(t)) d.w++;
      else if (isLoss(t)) d.l++;
      else d.be++;
      m.set(k, d);
    });
    return [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
  }, [trades, dateBy]);
  const dayName = (k: string) =>
    new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const shown = all.slice(-days).map((d) => ({
    k: d.k,
    n: d.n,
    w: d.w,
    l: d.l,
    be: d.be,
    v: +(display === "Return ($)" ? d.pnl : display === "Return (%)" ? d.pct : d.r).toFixed(2),
  }));
  const win = all.filter((d) => d.pnl > 0),
    loss = all.filter((d) => d.pnl < 0);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const fmtV = (v: number) =>
    display === "Return ($)"
      ? fmtMoney(v, cur)
      : display === "Return (%)"
        ? `${fmtNum(v)}%`
        : `${fmtNum(v)}R`;
  return (
    <div className="space-y-4">
      <ChartCard
        size="full"
        controls={
          <>
            <Select
              label="Display"
              value={display}
              options={["Return ($)", "Return (%)", "R Multiple (R)"] as const}
              onChange={setDisplay}
            />
            <Select
              label="Date Settings"
              value={dateBy}
              options={["Entry Date", "Exit Date"] as const}
              onChange={setDateBy}
            />
            <label className="flex items-center gap-2 text-[12px]">
              Days Shown ({days})
              <input
                type="range"
                min={50}
                max={180}
                step={10}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-40 accent-primary"
              />
            </label>
          </>
        }
      >
        <BarsBig
          onBar={dateBy === "Entry Date" ? (k) => goDrill({ day: k }) : undefined}
          data={shown}
          yLabel={display}
          fmt={fmtV}
          extra={(d) => {
            const x = d as unknown as { k: string; n: number; w: number; l: number; be: number };
            return [
              ["Weekday", dayName(x.k)],
              ["Number of trades", String(x.n)],
              ["Winners", String(x.w)],
              ["Losers", String(x.l)],
              ["Break evens", String(x.be)],
            ];
          }}
          hideTicks
        />
      </ChartCard>
      <Stats>
        <AccentStat label="Trading Days" value={all.length} />
        <AccentStat label="Winning Days" value={win.length} />
        <AccentStat label="Losing Days" value={loss.length} />
        <AccentStat label="Avg. Winning Day" value={fmtMoney(avg(win.map((d) => d.pnl)), cur)} />
        <AccentStat label="Avg. Losing Day" value={fmtMoney(avg(loss.map((d) => d.pnl)), cur)} />
        <AccentStat label="Avg. Trades per Day" value={fmtNum(avg(all.map((d) => d.n)))} />
      </Stats>
    </div>
  );
}
