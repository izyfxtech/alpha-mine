import { useMemo, useState, type ReactNode } from "react";
import type React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Outlined field whose label sits inside when empty and floats onto the border when filled. */
export function FloatBox({ label, filled, children, right, disabled, className }: {
  label: string; filled: boolean; children: ReactNode; right?: ReactNode; disabled?: boolean; className?: string;
}) {
  return (
    <div className={cn("tf-box group", disabled && "tf-box-disabled", className)}>
      <span className={cn("tf-label", filled && "tf-label-float")}>{label}</span>
      <div className="flex h-full min-w-0 flex-1 items-center">{children}</div>
      {right && <div className="ml-2 flex shrink-0 items-center text-foreground">{right}</div>}
    </div>
  );
}

export function FloatInput({ label, value, onChange, type = "number", right, disabled, align = "right", placeholder }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; right?: ReactNode; disabled?: boolean; align?: "left" | "right"; placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  const filled = value !== "" || focus || type === "datetime-local";
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (type !== "datetime-local") return;
    const el = e.currentTarget.parentElement?.querySelector("input");
    try { el?.showPicker(); } catch { /* unsupported */ }
  };
  return (
    <FloatBox label={label} filled={filled} disabled={disabled} right={right && <div onClick={pick} className="cursor-pointer">{right}</div>}>
      <input
        type={type} step="any" value={value} disabled={disabled} placeholder={focus ? placeholder : undefined}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn("tf-input", align === "right" && type === "number" ? "text-right" : "text-left", !filled && "opacity-0")}
      />
    </FloatBox>
  );
}

export interface Opt { id: string; label: string }

/** Dropdown with search + checkboxes. `multi=false` behaves as a single select. Optional inline creation. */
export function FloatSelect({ label, options, value, onChange, multi = false, onCreate }: {
  label: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; onCreate?: (label: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const selected = options.filter((o) => value.includes(o.id)).map((o) => o.label).join(", ");
  const exact = options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  const toggle = (id: string) => {
    if (multi) onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    else { onChange(value[0] === id ? [] : [id]); setOpen(false); }
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full text-left">
          <FloatBox label={label} filled={!!selected} right={<ChevronDown className="h-3.5 w-3.5 fill-current" />}>
            <span className="tf-input truncate">{selected}</span>
          </FloatBox>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
          className="h-9 w-full border-b bg-transparent px-3 text-[13px] outline-none placeholder:text-foreground" />
        <div className="max-h-56 overflow-y-auto py-1">
          {shown.map((o) => {
            const on = value.includes(o.id);
            return (
              <button key={o.id} type="button" onClick={() => toggle(o.id)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
                {multi ? (
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border border-foreground/50", on && "border-ink bg-ink text-ink-foreground")}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                ) : (
                  <Check className={cn("h-3.5 w-3.5 shrink-0", !on && "invisible")} />
                )}
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {!shown.length && !onCreate && <p className="px-3 py-2 text-[12px] text-muted-foreground">No options</p>}
          {onCreate && q.trim() && !exact && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-info hover:bg-muted"
              onClick={async () => { const id = await onCreate(q.trim()); if (id) { onChange(multi ? [...value, id] : [id]); setQ(""); if (!multi) setOpen(false); } }}>
              <Plus className="h-3.5 w-3.5" /> Add "{q.trim()}"
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T | ""; onChange: (v: T | "") => void }) {
  return (
    <div className="grid h-[30px] overflow-hidden rounded-[4px] border border-input text-[13px]" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, l], i) => (
        <button key={v} type="button" onClick={() => onChange(value === v ? "" : v)}
          className={cn("transition-colors", i > 0 && "border-l border-input", value === v ? "bg-ink text-ink-foreground" : "hover:bg-muted")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const SectionTitle = ({ children }: { children: ReactNode }) => <h4 className="mb-2.5 text-[13px] font-semibold">{children}</h4>;
