/**
 * The spreadsheet library (SheetJS) is large, so it is loaded only when an .xlsx file is actually opened or exported.
 * Import it through this function and nowhere else, so it stays out of the main bundle.
 */
export const loadXlsx = () => import("xlsx");

/** The first sheet of an .xlsx as rows of text, exactly as Excel displays them (dates and numbers keep their format). */
export async function firstSheetRows(bytes: Uint8Array): Promise<string[][]> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!ws) return [];
  return (
    XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      blankrows: false,
    }) as unknown[][]
  ).map((r) => r.map((c) => (c == null ? "" : String(c))));
}
