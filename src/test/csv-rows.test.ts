import { describe, expect, it } from "vitest";
import { buildCsvTrades, detectDateOrder, detectDecimal, parseDateTime, parseNumber, type CsvContext } from "@/lib/import/csv-rows";

describe("parseNumber (AM-M17)", () => {
  it.each([["1,234.50", 1234.5], ["$12.50", 12.5], ["(12.50)", -12.5], ["-3", -3], ["3-", -3], ["1,234,567", 1234567], ["  7 ", 7], ["1.5E-05", 0.000015], ["1,234", 1234]])("dot decimal: %s", (s, v) => expect(parseNumber(s, ".")).toBe(v));
  it.each([["1.234,50", 1234.5], ["12,5", 12.5], ["(12,50)", -12.5], ["1.234.567", 1234567], ["150,123", 150.123], ["1,085", 1.085], ["0,125", 0.125], ["1,0850", 1.085], ["1.234", 1234]])("comma decimal: %s", (s, v) => expect(parseNumber(s, ",")).toBe(v));
  it("empty is null, junk throws", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(() => parseNumber("abc")).toThrow();
    expect(() => parseNumber("1,2,3")).toThrow();
    expect(() => parseNumber("12,34", ".")).toThrow(); // not valid grouping when dot is the decimal
    expect(() => parseNumber("1.2.3", ",")).toThrow();
    expect(() => parseNumber("1.2.3", ".")).toThrow();
  });
});

describe("detectDecimal: a lone 150,123 must never be guessed (the 1,000x error)", () => {
  it("reads the separator from the whole file", () => {
    expect(detectDecimal(["62,00", "150,123", "0,125"])).toBe(",");   // 62,00 proves comma-decimal
    expect(detectDecimal(["1.234,50", "150,123"])).toBe(",");
    expect(detectDecimal(["62.00", "1,234.50", "150.123"])).toBe(".");
    expect(detectDecimal(["1,234,567", "5"])).toBe(".");
    expect(detectDecimal(["1.234.567", "5"])).toBe(",");
    expect(detectDecimal(["1.085", "1.091", "2", "3"])).toBe("."); // lone dotted prices are ordinary English numbers
    expect(detectDecimal(["10", "20", ""])).toBe(".");
  });
  it("asks when the data cannot say", () => {
    expect(detectDecimal(["150,123", "151,456"])).toBe("ambiguous");
    expect(detectDecimal(["62.00", "12,5"])).toBe("ambiguous"); // mixed formats in one file
  });
  it("the USDJPY and 0,125 cases from the audit read correctly once the separator is known", () => {
    const d = detectDecimal(["150,123", "62,50"]);
    expect(d).toBe(",");
    expect(parseNumber("150,123", d === "ambiguous" ? "." : d)).toBe(150.123);
    expect(parseNumber("0,125", ",")).toBe(0.125);
  });
});

describe("parseDateTime (AM-M17)", () => {
  it("reads day-first and month-first only as told", () => {
    expect(parseDateTime("13/02/2026 14:30", "dmy", "utc")).toBe("2026-02-13T14:30:00.000Z");
    expect(parseDateTime("03/04/2026", "dmy", "utc")).toBe("2026-04-03T00:00:00.000Z");
    expect(parseDateTime("03/04/2026", "mdy", "utc")).toBe("2026-03-04T00:00:00.000Z");
    expect(parseDateTime("20.10.2026 14:30", "dmy", "utc")).toBe("2026-10-20T14:30:00.000Z");
  });
  it("a bare time is wall time in the chosen zone; Z and offsets are exact", () => {
    expect(parseDateTime("2026-10-20 14:30:15", "dmy", "utc")).toBe("2026-10-20T14:30:15.000Z");
    expect(parseDateTime("2026-10-20T14:30:00+01:00", "dmy", "utc")).toBe("2026-10-20T13:30:00.000Z");
    expect(parseDateTime("2026-10-20T14:30:00Z", "dmy", "local")).toBe("2026-10-20T14:30:00.000Z");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(() => parseDateTime("31/02/2026", "dmy", "utc")).toThrow();
    expect(() => parseDateTime("13/13/2026", "mdy", "utc")).toThrow();
    expect(() => parseDateTime("hello", "dmy", "utc")).toThrow();
  });
  it("handles am/pm", () => expect(parseDateTime("10/20/2026 12:05 AM", "mdy", "utc")).toBe("2026-10-20T00:05:00.000Z"));
  it("detects the order or says it is ambiguous", () => {
    expect(detectDateOrder(["13/02/2026", "01/02/2026"])).toBe("dmy");
    expect(detectDateOrder(["02/13/2026"])).toBe("mdy");
    expect(detectDateOrder(["03/04/2026", "05/06/2026"])).toBe("ambiguous");
    expect(detectDateOrder(["2026-10-20 10:00"])).toBeNull();
  });
});

const header = ["Time", "Symbol", "Side", "Price", "Exit", "Qty", "P&L", "Fee", "Net"];
const map = { entry_at: "Time", instrument: "Symbol", direction: "Side", entry_price: "Price", exit_price: "Exit", quantity: "Qty", gross_pnl: "P&L", fees: "Fee", net_pnl: "Net" } as const;
const ctx: CsvContext = { journalId: "j", order: "dmy", zone: "utc", decimal: ".", instrumentId: () => "i", setupId: () => null };
const row = (over: Partial<Record<string, string>> = {}) => { const base: Record<string, string> = { Time: "2026-10-20 10:00", Symbol: "EURUSD", Side: "buy", Price: "1.085", Exit: "1.091", Qty: "1", "P&L": "100", Fee: "-2.00", Net: "98", ...over }; return header.map((h) => base[h]!); };

describe("buildCsvTrades", () => {
  it("signed fees reduce net instead of inflating it (AM-H05)", () => {
    const { trades } = buildCsvTrades([row()], header, map, ctx);
    expect(trades[0]!.gross_pnl).toBe(100);
    expect(trades[0]!.fees).toBe(2);
  });
  it("positive fee columns give the same result", () => {
    expect(buildCsvTrades([row({ Fee: "2.00" })], header, map, ctx).trades[0]!.fees).toBe(2);
  });
  it("gross only: a negative fee is still a cost; net only: gross = net + cost", () => {
    const g = buildCsvTrades([row({ Net: "" })], header, map, ctx).trades[0]!;
    expect(g.fees).toBe(2);
    const n = buildCsvTrades([row({ "P&L": "" })], header, map, ctx).trades[0]!;
    expect(n.gross_pnl).toBe(100);
    expect(n.fees).toBe(2);
  });
  it("a file-supplied P&L is manual so the trigger keeps it (AM-H03)", () => {
    expect(buildCsvTrades([row()], header, map, ctx).trades[0]!.pnl_manual).toBe(true);
    expect(buildCsvTrades([row({ "P&L": "", Net: "" })], header, map, ctx).trades[0]!.pnl_manual).toBe(false);
  });
  it("importing the same file twice yields the same external ids (AM-H04)", () => {
    const a = buildCsvTrades([row(), row({ Symbol: "GBPUSD" })], header, map, ctx).trades.map((t) => t.external_id);
    const b = buildCsvTrades([row(), row({ Symbol: "GBPUSD" })], header, map, ctx).trades.map((t) => t.external_id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
  });
  it("two identical rows in one file stay two trades", () => {
    const ids = buildCsvTrades([row(), row()], header, map, ctx).trades.map((t) => t.external_id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toMatch(/#2$/);
  });
  it("a European file (comma decimal) imports 150,123 as 150.123", () => {
    const eu = { ...ctx, decimal: "," as const };
    const t = buildCsvTrades([row({ Price: "150,123", Exit: "150,456", "P&L": "33,30", Fee: "-0,70", Net: "32,60" })], header, map, eu).trades[0]!;
    expect([t.entry_price, t.exit_price, t.gross_pnl, t.fees]).toEqual([150.123, 150.456, 33.3, 0.7]);
  });
  it("warns when the fee column disagrees with gross minus net", () => {
    const r = buildCsvTrades([row({ Fee: "5.00" })], header, map, ctx); // gross 100, net 98, so 2 was really taken
    expect(r.trades[0]!.fees).toBe(2);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.reason).toMatch(/fee column says 5/);
    expect(buildCsvTrades([row()], header, map, ctx).warnings).toHaveLength(0);
  });
  it("bad rows are skipped with a row number and reason, good rows still import (AM-M17)", () => {
    const r = buildCsvTrades([row(), row({ Time: "31/02/2026" }), row({ Price: "" }), row({ "P&L": "abc" }), row({ Qty: "0" })], header, map, ctx);
    expect(r.trades).toHaveLength(1);
    expect(r.skipped.map((s) => s.row)).toEqual([2, 3, 4, 5]);
    expect(r.skipped[1]!.reason).toMatch(/missing entry/);
  });
});

import { detectDelimiter, parseCsv } from "@/lib/import/csv-mapping";
describe("delimiters (AM-L03)", () => {
  it("reads semicolon and tab files", () => {
    expect(parseCsv("a;b;c\n1;2,5;3")).toEqual([["a", "b", "c"], ["1", "2,5", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("decides from the header, so decimal commas in the data cannot outvote a semicolon", () => {
    const cols = "A;B;C;D;E;F";
    const rows = Array.from({ length: 9 }, () => "1,0850;1,0912;0,10;62,00;-0,70;61,30").join("\n");
    expect(detectDelimiter(`${cols}\n${rows}`)).toBe(";");
    expect(detectDelimiter('"Time, UTC";Symbol;Qty\n"x, y";EURUSD;1')).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });
});
