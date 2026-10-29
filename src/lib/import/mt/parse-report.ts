/**
 * MetaTrader report files (MT4 statement .htm, MT5 report .html/.xlsx) -> `MtReport`.
 *
 * All parsing lives in `supabase/functions/_shared/mt/` (pure, DOM-free, reusable from an Edge Function). This file
 * only turns uploaded BYTES into table rows: HTML through the shared extractor, Excel through SheetJS (browser side).
 * The old `Mt5*` names remain as aliases so existing imports keep working.
 */
import * as XLSX from "xlsx";
import {
  MtParseError,
  decodeText,
  htmlToRows,
  isXlsx,
  parseMt5Rows,
  parseMtRows,
  parseNumber,
  parseWallTime,
  clean,
  type MtAccount,
  type MtBalanceOp,
  type MtPosition,
  type MtReport,
} from "@shared/mt/index.ts";

export { MtParseError, parseMtRows, parseMt5Rows, parseNumber, parseWallTime, isXlsx };
export type { MtAccount, MtBalanceOp, MtPosition, MtReport };
export type { MtPlatform, MtErrorCode } from "@shared/mt/index.ts";

// Back-compat aliases for the MT5-only names this module used to export.
export { MtParseError as Mt5ParseError };
export type Mt5Account = MtAccount;
export type Mt5Position = MtPosition;
export type Mt5BalanceOp = MtBalanceOp;
export type Mt5Report = MtReport;

function xlsxToRows(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const rows: string[][] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    // raw:false gives the formatted text, so "0.10" and "1.08500" keep the digits the terminal printed.
    for (const r of XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    })) {
      const cells = r.map(clean);
      if (cells.some(Boolean)) rows.push(cells);
    }
  }
  return rows;
}

/** Uploaded bytes -> table rows. */
export function readMtRows(bytes: Uint8Array): string[][] {
  if (bytes.length === 0) throw new MtParseError("The file is empty.", "empty");
  return isXlsx(bytes) ? xlsxToRows(bytes) : htmlToRows(decodeText(bytes));
}

/** Entry point: raw bytes of an uploaded MT4 or MT5 report. The platform is detected from the file itself. */
export function parseMtReport(bytes: Uint8Array): MtReport {
  return parseMtRows(readMtRows(bytes));
}

/** MT5-only entry point, kept for callers that must reject MT4 files. */
export function parseMt5Report(bytes: Uint8Array): MtReport {
  const rows = readMtRows(bytes);
  if (rows.length === 0)
    throw new MtParseError(
      "No table rows found: this does not look like a MetaTrader 5 report.",
      "not-a-report",
    );
  return parseMt5Rows(rows);
}
