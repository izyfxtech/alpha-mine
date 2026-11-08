import { toggled } from "@/lib/collections";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { drawdownRatioSeries, sortinoOf, sqnOf, stdev, type Trade } from "@/lib/pnl/metrics";
import { axis, seriesValues, yScale } from "@/components/kit";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChartCard, sorted } from "@/components/chart-lab/chart-kit";

const RATIOS = [
  "Sharpe Ratio",
  "Sortino Ratio",
  "Gain To Pain",
  "Calmar",
  "MAR",
  "Sterling",
  "Burke",
  "K-Ratio",
  "Profit Factor",
  "SQN",
] as const;
type Ratio = (typeof RATIOS)[number];
const RATIO_COLORS: Record<Ratio, string> = {
  "Sharpe Ratio": "var(--color-chart-5)",
  "Sortino Ratio": "var(--color-chart-4)",
  "Gain To Pain": "var(--color-chart-1)",
  Calmar: "var(--color-chart-3)",
  MAR: "var(--color-profit)",
  Sterling: "var(--color-loss)",
  Burke: "var(--color-muted-foreground)",
  "K-Ratio": "var(--color-primary)",
  "Profit Factor": "var(--color-chart-2)",
  SQN: "var(--color-foreground)",
};

export function Ratios({ trades, start }: { trades: Trade[]; start: number }) {
  const [sel, setSel] = useState<Set<Ratio>>(new Set(["Sharpe Ratio"]));
  const data = useMemo(() => {
    const s = sorted(trades);
    const dd = drawdownRatioSeries(s, start);
    let eq = 0,
      peak = 0,
      maxDD = 0;
    return s.map((t, i) => {
      const w = s.slice(0, i + 1).map((x) => x.net_pnl);
      const rs = s
        .slice(0, i + 1)
        .map((x) => x.r)
        .filter((v): v is number => v != null);
      eq += t.net_pnl;
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, peak - eq);
      const m = w.reduce((a, b) => a + b, 0) / w.length;
      const sd = stdev(w);
      const gw = w.filter((x) => x > 0).reduce((a, b) => a + b, 0),
        gl = Math.abs(w.filter((x) => x < 0).reduce((a, b) => a + b, 0));
      const r = (v: number) => (isFinite(v) ? +v.toFixed(3) : null);
      return {
        x: i + 1,
        "Sharpe Ratio": r(sd ? m / sd : 0),
        "Sortino Ratio": r(sortinoOf(w)),
        "Gain To Pain": r(gl ? (gw - gl) / gl : 0),
        Calmar: r(maxDD && start ? eq / start / (maxDD / start) : 0),
        "Profit Factor": r(gl ? gw / gl : 0),
        SQN: r(sqnOf(rs)),
        MAR: dd[i]!.mar == null ? null : r(dd[i]!.mar!),
        Sterling: dd[i]!.sterling == null ? null : r(dd[i]!.sterling!),
        Burke: dd[i]!.burke == null ? null : r(dd[i]!.burke!),
        "K-Ratio": dd[i]!.k == null ? null : r(dd[i]!.k!),
      };
    });
  }, [trades, start]);
  const label = [...sel].join(", ") || "Select ratio";
  return (
    <ChartCard
      size="full"
      controls={
        <div className="relative rounded-md border bg-card px-3 pb-1.5 pt-3">
          <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-muted-foreground">
            Ratio
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-72 items-center justify-between gap-2 text-sm">
              <span className="truncate">{label}</span>
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {RATIOS.map((r) => (
                <DropdownMenuCheckboxItem
                  key={r}
                  checked={sel.has(r)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => setSel((p) => toggled(p, r))}
                  className="py-2"
                >
                  {r}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
      legend={[...sel].map((r) => (
        <span key={r} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: RATIO_COLORS[r] }} />
          {r}
        </span>
      ))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis
            dataKey="x"
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={50}
            {...yScale(seriesValues(data as unknown as Record<string, unknown>[], [...sel]))}
            label={{
              value: [...sel][0] ?? "",
              angle: -90,
              position: "insideLeft",
              style: { ...axis, textAnchor: "middle" },
            }}
          />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(l) => `Trade #${l}`}
          />
          {[...sel].map((r) => (
            <Line
              key={r}
              type="monotone"
              dataKey={r}
              stroke={RATIO_COLORS[r]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
