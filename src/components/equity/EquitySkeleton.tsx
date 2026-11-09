import { useXMode } from "@/components/analytics/x-axis";
import { AccentStat, StatGrid } from "@/components/kit";
import {
  EQUITY_CHART_BOX,
  EQUITY_STAT_LABELS,
  EquityControls,
} from "@/components/equity/EquityControls";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Equity with its data still blank: the page's own controls (at their defaults), chart box and stat cards. */
export function EquitySkeleton() {
  const [xMode] = useXMode();
  return (
    <div className="space-y-[22px]">
      <section className="rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <EquityControls display="Return ($)" opts={new Set()} xMode={xMode} />
        <div className={EQUITY_CHART_BOX}>
          <Skeleton className="h-full w-full" />
        </div>
      </section>
      <StatGrid>
        {EQUITY_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={<SkeletonText className="w-14" />} />
        ))}
      </StatGrid>
    </div>
  );
}
