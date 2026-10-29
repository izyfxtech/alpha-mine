/** Cell helpers shared by the MT4 and MT5 row parsers. Pure. */

const WS = /[\s\u00a0\u2007\u202f]+/g;
export const clean = (v: unknown): string => (v == null ? "" : String(v).replace(WS, " ").trim());

const DATETIME = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026.10.23 14:05:09" -> wall ms (server clock encoded as UTC). null when not a datetime. */
export function parseWallTime(s: string): number | null {
  const m = DATETIME.exec(clean(s));
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const ms = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(se ?? 0));
  // Date.UTC silently rolls 2026.13.45 over: round-trip to reject it.
  const back = new Date(ms);
  if (back.getUTCMonth() !== +mo! - 1 || back.getUTCDate() !== +d!) return null;
  return ms;
}

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
const stripGrouping = (s: unknown) => clean(s).replace(/ /g, "").replace(/,/g, "");

/**
 * Terminals print "1 234.56" (space or NBSP thousands separator, dot decimal). Commas are treated as thousands
 * separators. Returns null for blanks and anything else so callers decide what is acceptable.
 */
export function parseNumber(s: unknown): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = stripGrouping(s);
  if (!NUMBER.test(t)) return null;
  return Number(t);
}

export const decimalsOf = (s: unknown): number => {
  const t = stripGrouping(s);
  return NUMBER.test(t) ? (t.split(".")[1] ?? "").length : 0;
};

/** Trim leading/trailing empty cells (spacer columns) but keep the empties in the middle, they are meaningful. */
export function trimCells(cells: string[]): string[] {
  let a = 0;
  let b = cells.length;
  while (a < b && !cells[a]) a++;
  while (b > a && !cells[b - 1]) b--;
  return cells.slice(a, b);
}

/** The text of a row that holds exactly one non-empty cell (a section title), lower-cased, without a trailing colon. */
export function sectionTitle(row: string[]): string | null {
  const cells = row.filter(Boolean);
  if (cells.length !== 1) return null;
  return cells[0]!.toLowerCase().replace(/:\s*$/, "").trim();
}
