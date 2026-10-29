/**
 * One entry point for every MetaTrader report: work out which kind of file this is and say clearly why when it is
 * not one we can read. The importer never guesses a layout; it either recognises it or explains what to export.
 */
import { parseWallTime, sectionTitle } from "./cells.ts";
import { parseMt4Rows } from "./mt4-rows.ts";
import { parseMt5Rows } from "./mt5-rows.ts";
import { MtParseError, type MtReport } from "./types.ts";

const MT5_SECTIONS = ["positions", "orders", "deals"];

export function parseMtRows(rows: string[][]): MtReport {
  if (rows.length === 0) {
    throw new MtParseError(
      "No table rows found: this does not look like a MetaTrader report.",
      "not-a-report",
    );
  }
  const titles = rows.map(sectionTitle).filter((t): t is string => t !== null);

  if (titles.includes("closed transactions")) return parseMt4Rows(rows);
  if (titles.includes("positions")) return parseMt5Rows(rows);

  const found = titles.filter((t) => MT5_SECTIONS.includes(t));
  if (found.length > 0) {
    throw new MtParseError(
      `This MetaTrader 5 report only has ${found.join(" and ")}. Export it again from the History tab (right click → Report) with the "Positions" view included, as HTML or Excel.`,
      "mt5-no-positions",
    );
  }

  // Data rows are present (server-time cells) but no section title we know: a translated terminal, or another report.
  if (rows.some((r) => r.some((c) => parseWallTime(c) !== null))) {
    throw new MtParseError(
      "This looks like a MetaTrader report, but its section names are not in English, or it is a report type this importer does not read. Set the terminal language to English and export again: MT5 History tab → right click → Report, or MT4 Account History → right click → Save as Detailed Report. Upload the original file, unedited.",
      "unsupported-language",
    );
  }
  throw new MtParseError(
    "This does not look like a MetaTrader account-history report. Export one from MT5 (History tab → right click → Report) or MT4 (Account History → right click → Save as Detailed Report).",
    "not-a-report",
  );
}
