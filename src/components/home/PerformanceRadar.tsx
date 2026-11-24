import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Stats } from "@/lib/pnl/metrics";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";

export type PerformanceMetric = { metric: string; value: number };

const bounded = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const scaled = (value: number, max: number) => bounded((value / max) * 100);

export function performanceRadarData(stats: Stats): PerformanceMetric[] {
  const profitFactor = Number.isFinite(stats.profitFactor) ? stats.profitFactor : 3;
  const avgWinLoss =
    stats.avgLoss < 0 ? stats.avgWin / Math.abs(stats.avgLoss) : stats.avgWin > 0 ? 3 : 0;
  const recoveryFactor = stats.maxDD > 0 ? stats.roi / stats.maxDD : stats.roi > 0 ? 3 : 0;

  return [
    { metric: "Win %", value: bounded(stats.winRate) },
    { metric: "Profit factor", value: scaled(profitFactor, 3) },
    { metric: "Avg win/loss", value: scaled(avgWinLoss, 3) },
    { metric: "Recovery", value: scaled(recoveryFactor, 3) },
    { metric: "Drawdown control", value: 100 - scaled(stats.maxDD, 40) },
    { metric: "Consistency", value: bounded(stats.followedPlanPct) },
  ];
}

export function PerformanceRadar({
  data,
  score,
  color = "var(--chart-4)",
  compact = false,
}: {
  data: PerformanceMetric[];
  score: number;
  color?: string;
  compact?: boolean;
}) {
  const normalizedScore = bounded(score);
  const config = {
    value: { label: "Profile score", color },
  } satisfies ChartConfig;

  return (
    <Card className="overflow-hidden border-border/70 bg-card shadow-none">
      <CardHeader className={compact ? "gap-1 p-3 pb-0" : "gap-1 p-4 pb-0"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Performance radar</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Your results across six trading dimensions
            </CardDescription>
          </div>
          {!compact && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Edge score
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {normalizedScore.toFixed(1)}
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? "p-2 pt-1" : "p-3 pt-1"}>
        <ChartContainer
          config={config}
          className={compact ? "aspect-auto h-[205px] w-full" : "aspect-auto h-[248px] w-full"}
          role="img"
          aria-label={`Performance radar. ${data.map((item) => `${item.metric}: ${Math.round(item.value)} percent`).join(", ")}`}
        >
          <RadarChart accessibilityLayer data={data} outerRadius="65%">
            <PolarGrid gridType="polygon" stroke="var(--color-border)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
              tickLine={false}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => `${Number(value).toFixed(0)} / 100`}
                />
              }
            />
            <Radar
              dataKey="value"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.24}
              strokeWidth={2}
              dot={{ r: 2, fill: "var(--color-value)", strokeWidth: 0 }}
            />
          </RadarChart>
        </ChartContainer>
        {!compact && (
          <div className="mt-1">
            <div
              role="progressbar"
              aria-label="Edge score"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedScore)}
              className="relative h-2 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-loss), var(--color-star), var(--color-profit))",
              }}
            >
              <span
                className="absolute -top-1 size-4 rounded-full border-2 border-card bg-foreground shadow"
                style={{ left: `calc(${normalizedScore}% - 8px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
