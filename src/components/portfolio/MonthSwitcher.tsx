import { addMonths, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Previous / next month buttons around the month's name. */
export function MonthSwitcher({
  month,
  onMonthChange,
}: {
  month: Date;
  onMonthChange?: (month: Date) => void;
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-ink-line">
      <button
        className="border-r border-ink-line px-2 py-1.5"
        onClick={() => onMonthChange?.(addMonths(month, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="w-28 text-center text-[12px]">{format(month, "MMMM yyyy")}</span>
      <button
        className="border-l border-ink-line px-2 py-1.5"
        onClick={() => onMonthChange?.(addMonths(month, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
