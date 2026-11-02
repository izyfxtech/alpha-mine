"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfile } from "@/lib/profile-settings";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const selectCls = "h-8 rounded-md border bg-background px-1.5 text-[12px] font-semibold outline-none focus:border-foreground";

/**
 * Month and year selectors with previous/next arrows. Choosing a month or a year only changes the month on show: the day grid
 * under it never goes away, so an exact date is always one more tap.
 */
export function MonthYearNav({ month, onChange }: { month: Date; onChange: (m: Date) => void }) {
  const thisYear = new Date().getFullYear();
  const y = month.getFullYear();
  const years = useMemo(() => {
    const from = Math.min(thisYear - 25, y), to = Math.max(thisYear + 5, y);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [thisYear, y]);
  return (
    <div className="mb-2 flex items-center justify-between gap-1">
      <button type="button" aria-label="Previous month" className="rounded p-1 hover:bg-muted" onClick={() => onChange(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
      <div className="flex items-center gap-1">
        <select aria-label="Month" className={selectCls} value={month.getMonth()} onChange={(e) => onChange(new Date(y, Number(e.target.value), 1))}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select aria-label="Year" className={selectCls} value={y} onChange={(e) => onChange(new Date(Number(e.target.value), month.getMonth(), 1))}>
          {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
        </select>
      </div>
      <button type="button" aria-label="Next month" className="rounded p-1 hover:bg-muted" onClick={() => onChange(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

/** Seven-column day grid for one month, weeks starting on the profile's first day of the week. */
export function DayGrid({ month, selected, onPick, extra }: { month: Date; selected?: string; onPick: (day: string) => void; extra?: (day: string) => string | false | undefined }) {
  const weekStartsOn = useProfile().settings.weekStartsOn;
  const start = startOfWeek(startOfMonth(month), { weekStartsOn });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const heads = weekStartsOn === 0 ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const today = format(new Date(), "yyyy-MM-dd");
  return (
    <>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-muted-foreground">{heads.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-[12px]">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const on = k === selected;
          return (
            <button key={k} type="button" aria-label={format(d, "EEEE d MMMM yyyy")} aria-pressed={on} onClick={() => onPick(k)}
              className={cn("h-8 rounded-md hover:bg-muted", !isSameMonth(d, month) && "text-muted-foreground/60", k === today && !on && "font-semibold underline underline-offset-2", extra?.(k), on && "bg-ink font-semibold text-ink-foreground hover:bg-ink")}>
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The calendar itself. `value` is yyyy-MM-dd, or yyyy-MM-ddTHH:mm[:ss] with `withTime`. Seconds already on the value are kept,
 * so opening a trade and not touching its date never moves it.
 */
export function CalendarPanel({ value, withTime, onChange, onClose }: { value: string; withTime?: boolean; onChange: (v: string) => void; onClose?: () => void }) {
  const day = value.slice(0, 10);
  const valid = DAY_RE.test(day) && isValid(parseISO(day));
  const [month, setMonth] = useState(() => startOfMonth(valid ? parseISO(day) : new Date()));
  useEffect(() => { if (valid) setMonth(startOfMonth(parseISO(day))); }, [day, valid]);

  const time = withTime && value.length >= 16 ? value.slice(11, 16) : "";
  const secs = withTime && value.length >= 19 ? value.slice(16, 19) : "";
  const nowHM = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };
  const emit = (d: string, t: string) => onChange(withTime ? `${d}T${t || nowHM()}${secs}` : d);
  const [hh, mm] = (time || "00:00").split(":");
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="w-[272px]">
      <MonthYearNav month={month} onChange={setMonth} />
      <DayGrid month={month} selected={valid ? day : undefined} onPick={(k) => { emit(k, time); if (!withTime) onClose?.(); }} />
      {withTime && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[12px]">
          <span className="text-muted-foreground">Time</span>
          <select aria-label="Hour" className={selectCls} value={hh} onChange={(e) => emit(valid ? day : today, `${e.target.value}:${mm}`)}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
          </select>
          <span>:</span>
          <select aria-label="Minute" className={selectCls} value={mm} onChange={(e) => emit(valid ? day : today, `${hh}:${e.target.value}`)}>
            {Array.from({ length: 60 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
          </select>
          <button type="button" className="ml-auto rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground" onClick={() => onClose?.()}>Done</button>
        </div>
      )}
      <div className="mt-2 flex justify-between text-xs">
        <button type="button" className="text-muted-foreground underline" onClick={() => { emit(today, time); setMonth(startOfMonth(new Date())); if (!withTime) onClose?.(); }}>Today</button>
        <button type="button" className="text-muted-foreground underline" onClick={() => { onChange(""); onClose?.(); }}>Clear</button>
      </div>
    </div>
  );
}

const shown = (value: string, withTime?: boolean) => {
  if (!value) return "";
  const d = value.slice(0, 10);
  return withTime && value.length >= 16 ? `${d} ${value.slice(11, 16)}` : d;
};

interface PickerProps { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; disabled?: boolean; "aria-label"?: string }

function Picker({ withTime, value, onChange, placeholder, className, disabled, ...rest }: PickerProps & { withTime?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" aria-label={rest["aria-label"]} className={cn("flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm disabled:opacity-50", className)}>
          <span className={cn("truncate", !value && "text-muted-foreground")}>{shown(value, withTime) || placeholder || (withTime ? "Pick date and time" : "Pick a date")}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3"><CalendarPanel value={value} withTime={withTime} onChange={onChange} onClose={() => setOpen(false)} /></PopoverContent>
    </Popover>
  );
}

/** A date (yyyy-MM-dd, "" when empty). Replaces <input type="date">. */
export const DatePicker = (p: PickerProps) => <Picker {...p} />;
/** A date and time (yyyy-MM-ddTHH:mm[:ss], "" when empty). Replaces <input type="datetime-local">. */
export const DateTimePicker = (p: PickerProps) => <Picker {...p} withTime />;
