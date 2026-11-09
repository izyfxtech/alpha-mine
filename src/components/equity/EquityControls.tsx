import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { XModeSelect, type XMode } from "@/components/analytics/x-axis";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const DISPLAYS = [
  "Return ($)",
  "Account Balance ($)",
  "Return, gain sum (%)",
  "Return, ROI (%)",
  "R Multiple (R)",
] as const;
export type Display = (typeof DISPLAYS)[number];
export const OPTIONS = [
  "Display Value Without Fees",
  "Display Tiltmeter",
  "Moving Average (20)",
  "Moving Average (50)",
  "Group Trades by Day",
] as const;
export type Opt = (typeof OPTIONS)[number];

/** The chart's box: it grows with the window between 340 and 760px. */
export const EQUITY_CHART_BOX = "h-[clamp(340px,calc(100vh-330px),760px)] min-w-0 overflow-hidden";

export const EQUITY_STAT_LABELS = [
  "Trades",
  "Winners",
  "Losers",
  "Winrate (%)",
  "Avg. P&L",
  "Profit Factor",
  "Return (%)",
  "Biggest Winner",
  "Biggest Loser",
  "Profit/Loss",
] as const;

function FieldBox({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="relative rounded-md border border-line2 bg-card px-3 pb-1.5 pt-3">
      {label && (
        <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-muted-foreground">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** The row above the Equity chart: what to display, extra options, the x axis, and the legend for what is switched on. */
export function EquityControls({
  display,
  opts,
  xMode,
  onDisplayChange,
  onToggle,
  onXModeChange,
}: {
  display: Display;
  opts: ReadonlySet<Opt>;
  xMode: XMode;
  onDisplayChange?: (display: Display) => void;
  onToggle?: (opt: Opt) => void;
  onXModeChange?: (mode: XMode) => void;
}) {
  const optLabel = opts.size === 0 ? "Options" : [...opts].join(", ");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <FieldBox label="Display">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-52 items-center justify-between text-sm">
            {display}
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {DISPLAYS.map((d) => (
              <button
                key={d}
                onClick={() => onDisplayChange?.(d)}
                className={cn(
                  "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted",
                  d === display && "bg-muted font-medium",
                )}
              >
                {d}
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </FieldBox>
      <FieldBox label={opts.size ? "Options" : undefined}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-80 items-center justify-between gap-2 text-sm">
            <span className="truncate">{optLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {OPTIONS.map((o) => (
              <DropdownMenuCheckboxItem
                key={o}
                checked={opts.has(o)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onToggle?.(o)}
                className="py-2"
              >
                {o}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </FieldBox>
      <XModeSelect value={xMode} onChange={(m) => onXModeChange?.(m)} />
      <div className="ml-auto flex items-center gap-4 text-sm">
        <span>{display}</span>
        {opts.has("Display Value Without Fees") && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-4" />
            {display} (without fees)
          </span>
        )}
        {opts.has("Moving Average (20)") && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-5" />
            MA 20
          </span>
        )}
        {opts.has("Moving Average (50)") && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-3" />
            MA 50
          </span>
        )}
      </div>
    </div>
  );
}
