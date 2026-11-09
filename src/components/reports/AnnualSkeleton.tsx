import { useSearch } from "@tanstack/react-router";
import { AccentStat } from "@/components/kit";
import { YEAR_GRID, YearMonthCard } from "@/components/reports/YearMonthCard";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/profile-settings";
import { currentYear } from "@/lib/time/clock";

export const ANNUAL_STAT_LABELS = [
  "Number of Trades",
  "Winning Days",
  "Losing Days",
  "Winrate",
  "Net P&L",
  "ROI",
] as const;

/** The Annual Overview with the days uncoloured and the figures blank. Only the year selector shows just the current year. */
export function AnnualSkeleton() {
  const weekStartsOn = useProfile().settings.weekStartsOn;
  const { year: searched } = useSearch({ strict: false }) as { year?: number };
  const year = searched ?? currentYear();
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="mb-5 flex justify-center">
          <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
            <Button variant="ghost" size="sm" className="rounded-none bg-ink text-ink-foreground">
              {year}
            </Button>
          </div>
        </div>
        <div className={YEAR_GRID}>
          {Array.from({ length: 12 }, (_, mi) => (
            <YearMonthCard key={mi} year={year} monthIndex={mi} weekStartsOn={weekStartsOn} />
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        {ANNUAL_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={<SkeletonText className="w-12" />} />
        ))}
      </div>
    </div>
  );
}
