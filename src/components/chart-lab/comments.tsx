import { useMemo, useState } from "react";
import { type Trade } from "@/lib/pnl/metrics";
import { GroupChart } from "@/components/chart-lab/group-chart";
import { Select } from "@/components/chart-lab/chart-kit";

const PHASES = {
  "Trade Entry": "entry",
  "Trade Management": "management",
  "Trade Exit": "exit",
} as const;
type PhaseLabel = keyof typeof PHASES;
export function Comments({
  trades,
  start,
  cur,
  fixed,
}: {
  trades: Trade[];
  start: number;
  cur: string;
  fixed?: PhaseLabel;
}) {
  const [phase, setPhase] = useState<PhaseLabel>(fixed ?? "Trade Entry");
  const p = PHASES[phase];
  const by = useMemo(
    () => (t: Trade) => t.comments.filter((c) => c.phase === p).map((c) => c.label),
    [p],
  );
  const has = trades.some((t) => t.comments.some((c) => c.phase === p));
  return (
    <GroupChart
      showTable={false}
      trades={has ? trades : []}
      start={start}
      cur={cur}
      by={by}
      noun="Comment"
      extraControl={
        fixed ? undefined : (
          <Select
            label="Trade Comment"
            value={phase}
            options={Object.keys(PHASES) as PhaseLabel[]}
            onChange={setPhase}
          />
        )
      }
    />
  );
}
