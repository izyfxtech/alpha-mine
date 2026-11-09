import { cn } from "@/lib/utils";

export type Unit = "cur" | "pct" | "r";

const CURRENCY_NAMES: Record<string, string> = {
  USD: "United States Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  NGN: "Nigerian Naira",
};

const currencyName = (c: string) =>
  CURRENCY_NAMES[c] ??
  (() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "currency" }).of(c) ?? c;
    } catch {
      return c;
    }
  })();

/** Switches the Home figures between currency, return % and R multiples. */
export function UnitToggle({
  unit,
  currency,
  onChange,
}: {
  unit: Unit;
  currency: string;
  onChange?: (unit: Unit) => void;
}) {
  const options: [Unit, string][] = [
    ["cur", `${currencyName(currency)} (${currency})`],
    ["pct", "Return (%)"],
    ["r", "R Multiple"],
  ];
  return (
    <div className="inline-flex h-[24px] overflow-hidden rounded-md border bg-card text-xs font-semibold">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange?.(k)}
          className={cn(
            "border-r px-3 last:border-r-0",
            unit === k && "bg-ink text-ink-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
