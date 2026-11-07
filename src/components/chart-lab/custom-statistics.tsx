import { useMemo, useState } from "react";
import { useLookups } from "@/lib/journal/journal-context";
import { type Trade } from "@/lib/pnl/metrics";
import { Empty } from "@/components/kit";
import { GroupChart } from "@/components/chart-lab/group-chart";
import { Select } from "@/components/chart-lab/chart-kit";

/* ---------------- Custom Statistics (statistic picker) ---------------- */
export function CustomStatistics({
  trades,
  start,
  cur,
}: {
  trades: Trade[];
  start: number;
  cur: string;
}) {
  const journalId = trades[0]?.journal_id;
  const { data } = useLookups(journalId);
  const cats = data?.statCategories ?? [];
  const [catId, setCatId] = useState<string>("");
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const opts = useMemo(
    () =>
      new Map(
        (data?.statOptions ?? [])
          .filter((o) => o.category_id === cat?.id)
          .map((o) => [o.id, o.label]),
      ),
    [data, cat?.id],
  );
  const by = useMemo(
    () => (t: Trade) => t.customStats.filter((id) => opts.has(id)).map((id) => opts.get(id)!),
    [opts],
  );
  if (!cats.length)
    return <Empty>Create custom statistics in Settings to analyse them here.</Empty>;
  const names = cats.map((c) => c.name);
  return (
    <GroupChart
      key={cat?.id}
      trades={trades}
      start={start}
      cur={cur}
      by={by}
      noun="Option"
      extraControl={
        <Select
          label="Custom Statistic"
          value={cat?.name ?? ""}
          options={names}
          onChange={(n) => setCatId(cats.find((c) => c.name === n)?.id ?? "")}
          width="w-48"
        />
      }
    />
  );
}

/* ---------------- Trade Management (actual vs set-and-forget potential) ---------------- */
