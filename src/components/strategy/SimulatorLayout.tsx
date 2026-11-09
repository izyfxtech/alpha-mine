import type { ReactNode } from "react";
import { PageHeader, Panel, Stat } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonGhost, SkeletonText } from "@/components/ui/skeleton";
import { useJournal } from "@/lib/journal/journal-context";

export type SimulatorParams = {
  balance: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sims: number;
  trades: number;
};

export const SIMULATOR_DEFAULTS: SimulatorParams = {
  balance: 10000,
  winRate: 50,
  avgWin: 150,
  avgLoss: 100,
  sims: 100,
  trades: 100,
};

/** How many of the simulated paths are drawn. */
export const SIMULATOR_SHOWN = 20;
export const SIMULATOR_CHART_HEIGHT = 340;

type Tone = "pos" | "neg";

/** The input fields, top to bottom. `min` / `max` bound what can be typed. */
export const simulatorFields = (currency: string) =>
  [
    { key: "winRate", label: "Win rate (%)", min: 0, max: 100 },
    { key: "avgWin", label: `Average gain (${currency})`, step: "0.01" },
    { key: "avgLoss", label: `Average loss (${currency})`, step: "0.01" },
    { key: "balance", label: "Starting balance" },
    { key: "sims", label: "Number of simulations", min: 1, max: 1000 },
    { key: "trades", label: "Trades per simulation", min: 1, max: 1000 },
  ] as const satisfies readonly {
    key: keyof SimulatorParams;
    label: string;
    min?: number;
    max?: number;
    step?: string;
  }[];

/** The result panels below the chart: a title and its rows. `tone` colours the figure green or red. */
export const SIMULATOR_RESULTS = {
  streaks: [
    { title: "Longest winning streak", stats: [{ label: "Trades in a row", tone: "pos" }] },
    { title: "Longest losing streak", stats: [{ label: "Trades in a row", tone: "neg" }] },
    { title: "Winners", stats: [{ label: "Total", tone: "pos" }, { label: "Share" }] },
    { title: "Losers", stats: [{ label: "Total", tone: "neg" }, { label: "Share" }] },
  ],
  distribution: [
    {
      title: "Final balance",
      stats: [
        { label: "Worst 5%", tone: "neg" },
        { label: "Median" },
        { label: "Best 5%", tone: "pos" },
        { label: "Chance of profit" },
      ],
    },
    {
      title: "Maximum drawdown",
      stats: [
        { label: "Median" },
        { label: "Worst 5%", tone: "neg" },
        { label: "Worst case", tone: "neg" },
      ],
    },
  ],
} as const satisfies Record<
  string,
  readonly { title: string; stats: readonly { label: string; tone?: Tone }[] }[]
>;

/** Key of a result figure in `SimulatorResults`' `values`. */
export const resultKey = (title: string, label: string) => `${title} / ${label}`;

const ROWS = "grid gap-5";

/** The result panels. Without `values` every figure is a placeholder. */
export function SimulatorResults({ values }: { values?: Record<string, ReactNode> }) {
  const grid = (
    cols: string,
    panels: (typeof SIMULATOR_RESULTS)[keyof typeof SIMULATOR_RESULTS],
  ) => (
    <div className={`${ROWS} ${cols}`}>
      {panels.map((p) => (
        <Panel key={p.title} title={p.title}>
          {p.stats.map((s) => (
            <Stat
              key={s.label}
              label={s.label}
              tone={"tone" in s ? s.tone : undefined}
              value={
                values ? values[resultKey(p.title, s.label)] : <SkeletonText className="w-14" />
              }
            />
          ))}
        </Panel>
      ))}
    </div>
  );
  return (
    <>
      {grid("grid-cols-4", SIMULATOR_RESULTS.streaks)}
      {grid("grid-cols-2", SIMULATOR_RESULTS.distribution)}
    </>
  );
}

/** Heading, inputs panel and chart panel. The inputs and chart are passed in; the skeleton passes blanks. */
export function SimulatorFrame({
  sims,
  action,
  inputs,
  note,
  chart,
  results,
}: {
  sims: number;
  action: ReactNode;
  inputs: ReactNode;
  note: ReactNode;
  chart: ReactNode;
  results: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Simulator"
        subtitle={`Monte Carlo: ${sims} randomized futures based on your win rate and average win/loss.`}
        action={action}
      />
      <div className="grid gap-5 grid-cols-[300px_1fr]">
        <Panel title="Inputs">
          <div className="space-y-3">
            {inputs}
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
        </Panel>
        <Panel title={`Sample of ${Math.min(SIMULATOR_SHOWN, sims)} simulated equity paths`}>
          {chart}
        </Panel>
      </div>
      {results}
    </div>
  );
}

export const SimulatorField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

/** The simulator with every input and figure blank. */
export function SimulatorSkeleton() {
  const { journal } = useJournal();
  return (
    <SimulatorFrame
      sims={SIMULATOR_DEFAULTS.sims}
      action={<Button variant="outline">Re-run</Button>}
      inputs={simulatorFields(journal?.currency ?? "USD").map((f) => (
        <SimulatorField key={f.key} label={f.label}>
          <Input disabled className="skeleton border-transparent" />
        </SimulatorField>
      ))}
      note={
        <>
          Prefilled from your journal. Expectancy: <SkeletonGhost>$000.00</SkeletonGhost> per trade.
        </>
      }
      chart={<Skeleton className="w-full" style={{ height: SIMULATOR_CHART_HEIGHT }} />}
      results={<SimulatorResults />}
    />
  );
}
