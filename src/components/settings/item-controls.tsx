import { RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural } from "@/components/settings-parts";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/ui/confirm";

/** "Active Items | Disabled Items" switch shown above every list page. */
export function ItemsToggle({
  value,
  onChange,
  disabledCount,
}: {
  value: "active" | "disabled";
  onChange: (v: "active" | "disabled") => void;
  disabledCount: number;
}) {
  return (
    <div
      role="tablist"
      aria-label="Which items to show"
      className="mb-5 inline-flex h-[28px] overflow-hidden rounded-md border bg-card text-xs font-semibold"
    >
      {(
        [
          ["active", "Active Items"],
          ["disabled", `Disabled Items${disabledCount ? ` (${disabledCount})` : ""}`],
        ] as const
      ).map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "border-r px-3 last:border-r-0",
            value === k && "bg-ink text-ink-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export const sentimentTone = (s: string) =>
  s === "positive" ? "text-profit" : s === "negative" ? "text-loss" : "text-t1";

/** Trash on an active item retires it (it stays on existing trades); on a disabled item it deletes it for good. */
export function RowActions({
  disabled,
  name,
  used,
  onDisable,
  onRestore,
  onDelete,
}: {
  disabled: boolean;
  name: string;
  used: number;
  onDisable: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { confirm } = useDialogs();
  if (!disabled) {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        aria-label={`Disable ${name}`}
        title="Disable (keeps it on existing trades)"
        onClick={onDisable}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        aria-label={`Restore ${name}`}
        onClick={onRestore}
      >
        <RotateCcw className="h-3 w-3" />
        Restore
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label={`Delete ${name} permanently`}
        title={used ? `Used by ${plural(used, "trade")}` : "Delete permanently"}
        onClick={async () => {
          if (
            await confirm({
              title: `Delete "${name}" permanently?`,
              message: `${used ? `It is on ${plural(used, "trade")}; they will lose it. ` : ""}This cannot be undone.`,
              destructive: true,
            })
          )
            onDelete();
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </span>
  );
}

/* --------------------------------- Account -------------------------------- */
