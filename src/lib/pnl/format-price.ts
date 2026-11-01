/**
 * A price as a trader expects to read it. Never fewer decimals than the number carries (so nothing is cut off), and for
 * the usual forex magnitudes a sensible floor so trailing zeros are kept: 1.08500 stays 1.08500, not 1.085, and
 * USDJPY 150.12 reads 150.120. Pass the instrument's own `digits` when it is known to use exactly that precision.
 *
 *   under 10   at least 5 decimals   (EURUSD, GBPUSD, AUDUSD ...)
 *   under 1000 at least 3 decimals   (USDJPY, most JPY crosses)
 *   above      at least 2 decimals   (gold, indices, crypto)
 */
export function fmtPrice(v: number | string | null | undefined, digits?: number | null): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const carried = Math.min(8, (n.toFixed(10).replace(/0+$/, "").split(".")[1] ?? "").length);
  const floor = Math.abs(n) < 10 ? 5 : Math.abs(n) < 1000 ? 3 : 2;
  const d = digits != null && digits >= 0 ? Math.max(digits, carried) : Math.max(carried, floor);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
