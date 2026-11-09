import { useSearch } from "@tanstack/react-router";
import { startOfMonth } from "date-fns";
import { ProfitCalendarSkeleton } from "@/components/analytics/ProfitCalendar";
import { AccentStat, StatGrid } from "@/components/kit";
import {
  CALENDAR_BODY,
  CALENDAR_SECTION,
  CALENDAR_STAT_LABELS,
  CalendarControls,
} from "@/components/reports/CalendarControls";
import { SkeletonText } from "@/components/ui/skeleton";
import { currentYear, now } from "@/lib/time/clock";

/** The Calendar report on its starting month with the days and figures blank. The year selector shows only the current year. */
export function CalendarSkeleton() {
  const { m } = useSearch({ strict: false }) as { m?: string };
  const month = startOfMonth(m ? new Date(`${m}-01T00:00:00`) : now());
  return (
    <div className="space-y-[22px]">
      <section className={CALENDAR_SECTION}>
        <CalendarControls display="Return ($)" years={[currentYear()]} month={month} />
        <div className={CALENDAR_BODY}>
          <ProfitCalendarSkeleton tall />
        </div>
      </section>
      <StatGrid>
        {CALENDAR_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={<SkeletonText className="w-12" />} />
        ))}
      </StatGrid>
    </div>
  );
}
