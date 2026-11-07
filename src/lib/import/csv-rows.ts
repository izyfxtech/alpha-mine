/**
 * CSV rows to trade rows. Pure and strict on purpose: a value that cannot be read exactly is reported against its row,
 * never guessed (a day/month swap or a dropped number is silent data corruption in a journal).
 */
import type { Field } from "./csv-mapping";

export type DateOrder = "dmy" | "mdy" | "ymd";
export type CsvZone = "utc" | "local";

export type Decimal = "." | ",";

const GROUPED_COMMA = /^\d{1,3}(,\d{3})+$/; // 1,234  1,234,567
const GROUPED_DOT = /^\d{1,3}(\.\d{3})+$/; // 1.234  1.234.567

/**
 * Which character is the decimal separator in this file? Decided from ALL the numeric values, never one value:
 * a lone '150,123' is a price with three decimals in a European file and one hundred fifty thousand in an English one,
 * and guessing wrong is a silent 1,000x error. Returns 'ambiguous' when the data cannot say, so the importer asks.
 */
export function detectDecimal(samples: (string | undefined | null)[]): Decimal | "ambiguous" {
  let comma = false,
    dot = false,
    unsure = false;
  for (const raw of samples) {
    const s = (raw ?? "")
      .trim()
      .replace(/[\s\u00a0'’]/g, "")
      .replace(/[$€£¥₦]/g, "")
      .replace(/^[-+(]+|[-)]+$/g, "");
    const c = s.lastIndexOf(","),
      d = s.lastIndexOf(".");
    if (c >= 0 && d >= 0) {
      if (c > d) comma = true;
      else dot = true;
    } else if (c >= 0) {
      if (/^\d{1,3}(,\d{3}){2,}$/.test(s))
        dot = true; // 1,234,567 can only be grouping
      else if (GROUPED_COMMA.test(s))
        unsure = true; // 150,123: grouping or three decimals
      else comma = true; // 12,5  1,0850
    } else if (d >= 0) {
      if (/^\d{1,3}(\.\d{3}){2,}$/.test(s))
        comma = true; // 1.234.567 can only be grouping
      else if (!GROUPED_DOT.test(s)) dot = true; // 62.50  1.0850
      // a lone 1.085 is an ordinary price in an English file; it proves nothing either way
    }
  }
  if (comma && dot) return "ambiguous";
  if (comma) return ",";
  if (dot) return ".";
  return unsure ? "ambiguous" : ".";
}

/**
 * '1,234.50', '$12.50', '(12.50)', '12,5', '-3', '3-' to a number, reading `decimal` as the decimal separator and the
 * other one as digit grouping. Empty is null; anything that is not exactly a number throws.
 */
export function parseNumber(raw?: string | null, decimal: Decimal = "."): number | null {
  if (raw == null) return null;
  let s = raw
    .trim()
    .replace(/[\s\u00a0'’]/g, "")
    .replace(/[$€£¥₦]/g, "");
  if (!s || s === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const bad = () => new Error(`"${raw}" is not a number`);
  const sci = s.replace(decimal, ".");
  if (/^(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(sci)) {
    const v = Number(sci);
    return neg ? -v : v;
  } // 1.5E-05
  const group = decimal === "." ? "," : ".";
  const parts = s.split(decimal);
  if (parts.length > 2) throw bad();
  const [intPart = "", frac] = parts;
  // Grouping is only legal as well-formed thousands: 1,234,567 yes; 1,2,3 or 12,34 no.
  if (intPart.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(intPart))
    throw bad();
  const digits = intPart.split(group).join("");
  if (!/^\d*$/.test(digits) || (frac !== undefined && !/^\d*$/.test(frac)) || (!digits && !frac))
    throw bad();
  const v = Number(`${digits || "0"}${frac ? `.${frac}` : ""}`);
  return neg ? -v : v;
}

const SLASHED =
  /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(am|pm)?$/i;
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/** Which order the file's dates use. 'ambiguous' when the data cannot say (every day-first number is 12 or less). */
export function detectDateOrder(samples: string[]): DateOrder | "ambiguous" | null {
  let dmy = false,
    mdy = false,
    any = false;
  for (const raw of samples) {
    const s = raw.trim();
    if (!s || ISO.test(s)) continue;
    const m = SLASHED.exec(s);
    if (!m) continue;
    any = true;
    if (m[1]!.length === 4) return "ymd";
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (!any) return null;
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return "ambiguous";
}

function wall(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  zone: CsvZone,
  raw: string,
): string {
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    throw new Error(`"${raw}" is not a valid date`);
  return (zone === "utc" ? probe : new Date(y, mo - 1, d, h, mi, s)).toISOString();
}

/** A date or date-time to an ISO instant. A value with Z or an offset is exact; a bare one is wall time in `zone`. */
export function parseDateTime(raw: string, order: DateOrder, zone: CsvZone): string {
  const s = raw.trim();
  const iso = ISO.exec(s);
  if (iso) {
    if (iso[7]) {
      const t = new Date(s.replace(" ", "T"));
      if (Number.isNaN(+t)) throw new Error(`"${raw}" is not a valid date`);
      return t.toISOString();
    }
    return wall(
      +iso[1]!,
      +iso[2]!,
      +iso[3]!,
      +(iso[4] ?? 0),
      +iso[5]! || 0,
      +(iso[6] ?? 0),
      zone,
      raw,
    );
  }
  const m = SLASHED.exec(s);
  if (!m) throw new Error(`"${raw}" is not a date I can read`);
  const a = +m[1]!,
    b = +m[2]!,
    c = +m[3]!;
  let y: number, mo: number, d: number;
  if (m[1]!.length === 4) [y, mo, d] = [a, b, c];
  else if (order === "ymd") throw new Error(`"${raw}" does not start with a year`);
  else {
    [mo, d] = order === "dmy" ? [b, a] : [a, b];
    y = m[3]!.length === 2 ? 2000 + c : c;
  }
  let h = +(m[4] ?? 0);
  const ap = m[7]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return wall(y, mo, d, h, +(m[5] ?? 0), +(m[6] ?? 0), zone, raw);
}

/** Small stable hash (cyrb53), 53 bits: enough to key a trade within one journal. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export type CsvTrade = {
  journal_id: string;
  instrument_id: string | null;
  setup_id: string | null;
  direction: "long" | "short";
  entry_at: string;
  exit_at: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  gross_pnl: number;
  fees: number;
  pnl_manual: boolean;
  external_id: string;
};
export type Skipped = { row: number; reason: string };
export type CsvContext = {
  journalId: string;
  order: DateOrder;
  zone: CsvZone;
  decimal: Decimal;
  instrumentId: (symbol: string) => string | null;
  setupId: (name: string) => string | null;
};

const r8 = (v: number) => +v.toFixed(8);

/**
 * `row` in Skipped is the 1-based data row (the first row under the header is 1).
 * P&L rules: when a file has both gross and net, fees = gross - net, so the sign convention of the fee column cannot
 * change the result. With gross only, fees are a positive cost (|fee|). With net only, gross = net + |fee|.
 * A P&L the file supplies is flagged manual so the database trigger never recomputes it from prices.
 */
export function buildCsvTrades(
  rows: string[][],
  header: string[],
  map: Partial<Record<Field, string>>,
  ctx: CsvContext,
): { trades: CsvTrade[]; skipped: Skipped[]; warnings: Skipped[] } {
  const col = (r: string[], f: Field) => (map[f] ? r[header.indexOf(map[f]!)]?.trim() : undefined);
  const trades: CsvTrade[] = [];
  const skipped: Skipped[] = [];
  const warnings: Skipped[] = [];
  const num = (r: string[], f: Field) => parseNumber(col(r, f), ctx.decimal);
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const row = i + 1;
    try {
      const entryRaw = col(r, "entry_at"),
        entryPx = num(r, "entry_price");
      if (!entryRaw || entryPx == null) throw new Error("missing entry time or entry price");
      if (entryPx <= 0) throw new Error("entry price must be above zero");
      const exitRaw = col(r, "exit_at");
      const entry_at = parseDateTime(entryRaw, ctx.order, ctx.zone);
      const exit_at = exitRaw ? parseDateTime(exitRaw, ctx.order, ctx.zone) : null;
      if (exit_at && exit_at < entry_at) throw new Error("exit time is before entry time");
      const qty = num(r, "quantity") ?? 1;
      if (qty <= 0) throw new Error("quantity must be above zero");
      const exit_price = num(r, "exit_price");
      const g = num(r, "gross_pnl"),
        n = num(r, "net_pnl"),
        f = num(r, "fees");
      const cost = f == null ? 0 : Math.abs(f);
      const gross = g ?? (n != null ? n + cost : 0);
      const fees = g != null && n != null ? r8(g - n) : cost;
      // The file's own fee column should agree with gross minus net; if it does not, say so rather than hide it.
      if (g != null && n != null && f != null && Math.abs(cost - Math.abs(g - n)) > 0.005)
        warnings.push({
          row,
          reason: `fee column says ${cost} but gross minus net is ${r8(g - n)}; the difference was kept as cost`,
        });
      const d = (col(r, "direction") ?? "long").toLowerCase();
      const direction = d.startsWith("s") ? "short" : "long";
      const sym = col(r, "instrument") ?? "";
      const setup = col(r, "setup") ?? "";
      const trade = {
        journal_id: ctx.journalId,
        instrument_id: sym ? ctx.instrumentId(sym) : null,
        setup_id: setup ? ctx.setupId(setup) : null,
        direction: direction as "long" | "short",
        entry_at,
        exit_at,
        entry_price: entryPx,
        exit_price,
        quantity: qty,
        stop_loss: num(r, "stop_loss"),
        take_profit: num(r, "take_profit"),
        gross_pnl: gross,
        fees,
        pnl_manual: g != null || n != null,
      };
      // Same file twice (or the same row twice in one file) must give the same ids; identical rows get #2, #3...
      const key = hash53(
        [sym, direction, entry_at, exit_at ?? "", entryPx, exit_price ?? "", qty, gross, fees].join(
          "|",
        ),
      );
      const k = (seen.get(key) ?? 0) + 1;
      seen.set(key, k);
      trades.push({ ...trade, external_id: `csv:${key}${k > 1 ? `#${k}` : ""}` });
    } catch (e) {
      skipped.push({ row, reason: (e as Error).message });
    }
  });
  return { trades, skipped, warnings };
}
