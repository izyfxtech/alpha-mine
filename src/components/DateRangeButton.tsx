import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * One "Start date – End date" button that opens a month calendar: first click sets the start, the second
 * click sets the end (clicking an earlier day restarts the range). Values are yyyy-MM-dd strings, "" when unset.
 */
export function DateRangeButton({ value, onChange, className }: { value: { a: string; b: string }; onChange: (v: { a: string; b: string }) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value.a ? parseISO(value.a) : new Date()));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const pick = (k: string) => {
    if (!value.a || (value.a && value.b) || k < value.a) onChange({ a: k, b: "" });
    else { onChange({ a: value.a, b: k }); setOpen(false); }
  };
  const label = value.a ? `${value.a} – ${value.b || "End date"}` : "Start date – End date";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn("flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-[12px]", className)}><CalendarDays className="h-4 w-4" /><span className={cn(!value.a && "text-t4")}>{label}</span></button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[264px] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" className="rounded p-1 hover:bg-muted" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-[12px] font-semibold">{format(month, "MMMM yyyy")}</span>
          <button type="button" aria-label="Next month" className="rounded p-1 hover:bg-muted" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] text-t4">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-[12px]">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const end = value.b || value.a;
            const inRange = value.a && k >= value.a && k <= end, edge = k === value.a || k === value.b;
            return <button key={k} type="button" onClick={() => pick(k)} className={cn("h-8 rounded-md", !isSameMonth(d, month) && "text-t4", inRange && "bg-muted", edge && "bg-ink font-semibold text-ink-foreground", !inRange && "hover:bg-muted")}>{format(d, "d")}</button>;
          })}
        </div>
        <div className="mt-2 flex justify-end"><button type="button" className="text-[11px] text-t3 underline" onClick={() => onChange({ a: "", b: "" })}>Clear</button></div>
      </PopoverContent>
    </Popover>
  );
}
