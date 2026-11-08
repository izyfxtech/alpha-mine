import { useCallback, useMemo } from "react";
import { useStoredJson } from "@/lib/use-stored-value";

const DEFAULT_HIDDEN_COLUMNS = ["id", "gross_pnl", "r", "risk_amount", "notes"];

export type JournalTableLayout = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

export function defaultJournalTableLayout(keys: string[]): JournalTableLayout {
  return { order: [...keys], hidden: [...DEFAULT_HIDDEN_COLUMNS], widths: {} };
}

export function normalizeJournalTableLayout(
  value: Partial<JournalTableLayout> | null,
  keys: string[],
): JournalTableLayout {
  const known = new Set(keys);
  const order = [
    ...(value?.order ?? []).filter((key) => known.has(key)),
    ...keys.filter((key) => !value?.order?.includes(key)),
  ];
  const hidden = (value?.hidden ?? DEFAULT_HIDDEN_COLUMNS).filter((key) => known.has(key));
  const widths = Object.fromEntries(
    Object.entries(value?.widths ?? {}).filter(
      ([key, width]) => known.has(key) && Number.isFinite(width),
    ),
  );
  return { order, hidden, widths };
}

export function moveJournalColumn(order: string[], source: string, target: string): string[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter((key) => key !== source);
  next.splice(next.indexOf(target), 0, source);
  return next;
}

export function suggestedColumnWidth(
  label: string,
  values: Array<string | number>,
  min = 76,
  max = 240,
): number {
  const longest = Math.max(label.length, ...values.map((value) => String(value ?? "").length));
  return Math.max(min, Math.min(max, 28 + longest * 7));
}

export function equityColorOffset(min: number, max: number, baseline: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (max - baseline) / (max - min)));
}

const asLayoutInput = (value: unknown): Partial<JournalTableLayout> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Partial<JournalTableLayout>)
    : null;

/** The journal table's column order, visibility and widths, remembered per journal in this browser. */
export function useJournalTableLayout(journalId: string | undefined, keys: string[]) {
  const [stored, setStored] = useStoredJson(
    journalId ? `am.journal-table.${journalId}` : null,
    asLayoutInput,
  );
  const layout = useMemo(() => normalizeJournalTableLayout(stored, keys), [stored, keys]);
  const setLayout = useCallback(
    (next: JournalTableLayout | ((current: JournalTableLayout) => JournalTableLayout)) =>
      setStored((saved) => {
        const current = normalizeJournalTableLayout(saved, keys);
        return typeof next === "function" ? next(current) : next;
      }),
    [setStored, keys],
  );
  return [layout, setLayout] as const;
}
