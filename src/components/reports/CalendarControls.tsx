import { addMonths, format, setYear } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const CALENDAR_DISPLAYS = ["Return ($)", "Return (%)", "R Multiple"] as const;
export type CalendarDisplay = (typeof CALENDAR_DISPLAYS)[number];

export const CALENDAR_STAT_LABELS = [
  "Number of Trades",
  "Winners",
  "Losers",
  "Winrate",
  "Avg. Daily P&L",
  "Total Monthly P&L",
  "Avg. Winner",
  "Avg. Loser",
] as const;

/** The section's box: at least as tall as the window less the page chrome. */
export const CALENDAR_SECTION =
  "min-h-[calc(100vh-260px)] rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]";
export const CALENDAR_BODY = "mx-auto mt-3 max-w-[860px] pb-6";

/** What to display, the year, and the month with its previous / annual / next buttons. */
export function CalendarControls({
  display,
  years,
  month,
  onDisplayChange,
  onMonthChange,
  onOpenAnnual,
}: {
  display: CalendarDisplay;
  years: number[];
  month: Date;
  onDisplayChange?: (display: CalendarDisplay) => void;
  onMonthChange?: (month: Date) => void;
  onOpenAnnual?: (year: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start">
      <div className="relative w-52 rounded-md border border-line2 bg-card px-3 pb-1.5 pt-3">
        <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-muted-foreground">
          Display
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-between text-sm">
            {display}
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CALENDAR_DISPLAYS.map((d) => (
              <button
                key={d}
                onClick={() => onDisplayChange?.(d)}
                className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {d}
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => onMonthChange?.(setYear(month, y))}
              className={cn(
                "px-3 py-1.5",
                month.getFullYear() === y && "bg-ink text-ink-foreground",
              )}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button aria-label="Previous month" onClick={() => onMonthChange?.(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[15px] font-medium">{format(month, "MMMM")}</span>
          <button aria-label="Annual overview" onClick={() => onOpenAnnual?.(month.getFullYear())}>
            <X className="h-4 w-4" />
          </button>
          <button aria-label="Next month" onClick={() => onMonthChange?.(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
