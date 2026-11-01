const isNum = (v: string) => v.trim() !== "" && Number.isFinite(Number(v));

/**
 * What the trade form saves as gross P&L, and whether the trader owns that number.
 *
 * `auto` is the figure worked out from prices (null whenever the journal does not say quantity is in units).
 * `touched` means the field holds a number that should be kept as it is: the trader typed it, or it was loaded from a
 * trade whose P&L was typed or imported. A trade whose P&L was calculated is NOT touched when opened, so editing its
 * prices recalculates the P&L instead of freezing the old figure.
 * `manual` is what is written to pnl_manual: true tells the database never to recompute this P&L.
 */
export function resolveGross(i: { open: boolean; breakEven: boolean; touched: boolean; typed: string; auto: number | null; wasManual: boolean }) {
  if (i.open || i.breakEven) return { gross: 0, manual: i.wasManual };
  const gross = i.touched && isNum(i.typed) ? Number(i.typed) : i.auto;
  const typedByTrader = i.touched && gross != null && (i.auto == null || gross !== i.auto);
  return { gross, manual: typedByTrader || i.wasManual };
}

/** Whether opening an existing trade should treat its stored gross as a value to keep. */
export const keepStoredGross = (t: { exit_price: number | null; pnl_manual?: boolean | null }, quantityUnit?: string | null) =>
  t.exit_price != null && (!!t.pnl_manual || quantityUnit !== "units");
