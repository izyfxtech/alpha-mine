import { useCallback, useState } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tradeAxis } from "@/components/kit";
import { cn } from "@/lib/utils";

/**
 * What a chart's horizontal axis shows: the running trade number (every trade the same width, so a quiet month does not
 * stretch the chart) or the real date (gaps between trades show). The choice is remembered in this browser.
 */
export type XMode = "trade" | "date";
const X_MODE_LABEL: Record<XMode, string> = { trade: "Trade No.", date: "Date" };
const KEY = "am.chart.xmode";

const read = (): XMode => {
  try {
    return localStorage.getItem(KEY) === "date" ? "date" : "trade";
  } catch {
    return "trade";
  }
};

export function useXMode(): [XMode, (m: XMode) => void] {
  const [mode, setMode] = useState<XMode>(read);
  const set = useCallback((m: XMode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage blocked: the choice just is not remembered */
    }
  }, []);
  return [mode, set];
}

/** Select in the same outlined style as the other chart controls. */
export function XModeSelect({ value, onChange }: { value: XMode; onChange: (m: XMode) => void }) {
  return (
    <div className="relative rounded-md border border-line2 bg-card px-3 pb-1.5 pt-3">
      <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-muted-foreground">
        X axis
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-32 items-center justify-between gap-2 text-sm">
          <span>{X_MODE_LABEL[value]}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(X_MODE_LABEL) as XMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onChange(m)}
              className={cn(
                "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted",
                m === value && "bg-muted font-medium",
              )}
            >
              {X_MODE_LABEL[m]}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const dateTick = (ms: number) => format(new Date(ms), "d MMM yy");
const ms = (iso: string) => new Date(iso).getTime();
/** The timestamp a chart point is plotted at in date mode. */
export const tradeTime = (t: { entry_at: string }) => ms(t.entry_at);

/** Props for the chart's <XAxis>: `x` is the trade number and `t` the time in ms on every data point. */
export function xAxisProps(mode: XMode, count: number) {
  if (mode === "date") {
    return {
      dataKey: "t",
      type: "number" as const,
      scale: "time" as const,
      domain: ["dataMin", "dataMax"] as [string, string],
      tickFormatter: dateTick,
      interval: "preserveStartEnd" as const,
      minTickGap: 48,
    };
  }
  return { dataKey: "x", ...tradeAxis(count) };
}
export const xAxisLabel = (mode: XMode) => (mode === "date" ? "Date" : "Trades");
/** Tooltip title for a point: "Trade #12", or the date as well in date mode. */
export const pointTitle = (mode: XMode, p: { x: number | string; t?: number }) =>
  mode === "date" && p.t != null
    ? `${format(new Date(p.t), "d MMM yyyy")} · Trade #${p.x}`
    : `Trade #${p.x}`;
