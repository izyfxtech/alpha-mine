import { ArrowDown, ArrowUp, GripVertical, Minus, Plus } from "lucide-react";
import type { Crit } from "@/components/analytics/analytics-config";
import { cn } from "@/lib/utils";

const item = "flex h-[40px] items-center justify-between border-b px-1 text-xs last:border-0";

/** The two panels left of the Analytics table: the grouping order in use, and the criteria that can be added. */
export function AnalyticsSidebar({
  crits,
  available,
  onDragStart,
  onDrop,
  onMove,
  onRemove,
  onAdd,
}: {
  crits: Crit[];
  available: Crit[];
  onDragStart?: (key: string) => void;
  onDrop?: (key: string) => void;
  onMove?: (key: string, by: -1 | 1) => void;
  onRemove?: (key: string) => void;
  onAdd?: (key: string) => void;
}) {
  return (
    <div className="space-y-[22px]">
      <section className="min-h-[200px] rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <h3 className="mb-3 text-[13px] font-semibold">Ordering</h3>
        {crits.map((c) => (
          <div
            key={c.key}
            draggable
            onDragStart={() => onDragStart?.(c.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop?.(c.key)}
            className={cn(item, "cursor-grab")}
          >
            <span className="flex items-center gap-1.5">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              {c.label}
            </span>
            <span className="flex items-center gap-1">
              <button
                aria-label={`Move ${c.label} up`}
                disabled={crits[0] === c}
                onClick={() => onMove?.(c.key, -1)}
                className="disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`Move ${c.label} down`}
                disabled={crits[crits.length - 1] === c}
                onClick={() => onMove?.(c.key, 1)}
                className="disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button aria-label={`Remove ${c.label}`} onClick={() => onRemove?.(c.key)}>
                <Minus className="h-4 w-4" />
              </button>
            </span>
          </div>
        ))}
        {!crits.length && (
          <p className="text-xs text-muted-foreground">Add a criterion below to group trades.</p>
        )}
      </section>
      <section className="rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <h3 className="mb-3 text-[13px] font-semibold">Add Ordering Criteria</h3>
        {available.map((c) => (
          <div key={c.key} className={item}>
            {c.label}
            <button aria-label={`Add ${c.label}`} onClick={() => onAdd?.(c.key)}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
