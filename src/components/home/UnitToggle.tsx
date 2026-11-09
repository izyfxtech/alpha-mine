import { SegmentedToggle } from "@/components/segmented-toggle";

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
  return (
    <SegmentedToggle
      value={unit}
      onChange={onChange}
      options={[
        ["cur", `${currencyName(currency)} (${currency})`],
        ["pct", "Return (%)"],
        ["r", "R Multiple"],
      ]}
    />
  );
}
