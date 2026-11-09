import { cn } from "@/lib/utils";

/** A row of mutually exclusive options in one bordered pill, used to switch a page's display unit. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [value: T, label: string])[];
  value: T;
  onChange?: (value: T) => void;
}) {
  return (
    <div className="inline-flex h-[24px] overflow-hidden rounded-md border bg-card text-xs font-semibold">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange?.(v)}
          className={cn(
            "border-r px-3 last:border-r-0",
            value === v && "bg-ink text-ink-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
