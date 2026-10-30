export const DEFAULT_HIDDEN_COLUMNS = ["id", "gross_pnl", "r", "risk_amount", "notes"];

export type JournalTableLayout = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

export function defaultJournalTableLayout(keys: string[]): JournalTableLayout {
  return { order: [...keys], hidden: [...DEFAULT_HIDDEN_COLUMNS], widths: {} };
}

export function normalizeJournalTableLayout(value: Partial<JournalTableLayout> | null, keys: string[]): JournalTableLayout {
  const known = new Set(keys);
  const order = [...(value?.order ?? []).filter((key) => known.has(key)), ...keys.filter((key) => !value?.order?.includes(key))];
  const hidden = (value?.hidden ?? DEFAULT_HIDDEN_COLUMNS).filter((key) => known.has(key));
  const widths = Object.fromEntries(Object.entries(value?.widths ?? {}).filter(([key, width]) => known.has(key) && Number.isFinite(width)));
  return { order, hidden, widths };
}

export function moveJournalColumn(order: string[], source: string, target: string): string[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter((key) => key !== source);
  next.splice(next.indexOf(target), 0, source);
  return next;
}

export function suggestedColumnWidth(label: string, values: Array<string | number>, min = 76, max = 240): number {
  const longest = Math.max(label.length, ...values.map((value) => String(value ?? "").length));
  return Math.max(min, Math.min(max, 28 + longest * 7));
}

export function equityColorOffset(min: number, max: number, baseline: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (max - baseline) / (max - min)));
}