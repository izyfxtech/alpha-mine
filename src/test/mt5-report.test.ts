import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseMt5Report, parseMt5Rows, parseNumber, parseWallTime, Mt5ParseError } from "@/lib/import/mt/parse-report";
import { D, PnlEngine, RateResolver } from "@engine/index.ts";
import { mapTrade, type TradeRow } from "@shared/pnl-map.ts";
import { StaticProvider } from "./pnl-engine/helpers.ts";
import { balanceOpsToCashflows, checkCompatibility, positionToTrade, reportToTrades, summarize } from "@/lib/import/mt/to-trades";

const th = (cells: string[]) => `<tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
const td = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

const POS_HEADER = ["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"];

const rows = {
  eur: ["2026.10.20 08:15:00", "52001", "EURUSD", "buy", "0.10", "1.08500", "1.08000", "1.09500", "2026.10.20 12:40:10", "1.09120", "-0.70", "0.00", "62.00"],
  jpy: ["2026.10.21 09:00:00", "52002", "USDJPY", "sell", "1.00", "150.250", "", "", "2026.10.22 10:30:00", "149.750", "-7.00", "-1.25", "333.89"],
  gold: ["2026.10.22 15:00:00", "52003", "XAUUSD", "buy", "0.05", "2 650.40", "2 640.00", "0.00", "2026.10.22 16:00:00", "2 655.90", "-0.35", "0.00", "27.50"],
};

function reportHtml(extra = ""): string {
  return `<html><body><table>
    ${th(["Trade History Report"])}
    ${td(["Name:", "Test Trader"])}
    ${td(["Account:", "5012345 (USD, MetaQuotes-Demo, demo, Hedge)"])}
    ${td(["Company:", "MetaQuotes Ltd."])}
    ${th(["Positions"])}
    ${th(POS_HEADER)}
    ${td(rows.eur)}${td(rows.jpy)}${td(rows.gold)}
    ${td(["", "", "", "", "", "", "", "", "", "", "-8.05", "-1.25", "423.39"])}
    ${extra}
    ${th(["Deals"])}
    ${th(["Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Commission", "Fee", "Swap", "Profit", "Balance", "Comment"])}
    ${td(["2026.10.01 00:00:00", "1", "", "balance", "", "", "", "", "", "", "", "10 000.00", "10 000.00", "Deposit"])}
    ${td(["2026.10.25 00:00:00", "9", "", "balance", "", "", "", "", "", "", "", "-500.00", "12 929.62", "Withdrawal"])}
  </table></body></html>`;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    out[2 + i * 2] = s.charCodeAt(i) & 0xff;
    out[3 + i * 2] = s.charCodeAt(i) >> 8;
  }
  return out;
}

describe("cell parsing", () => {
  it("reads MT5 numbers with space and NBSP thousands separators", () => {
    expect(parseNumber("3 340.12")).toBe(3340.12);
    expect(parseNumber("1 234.50")).toBe(1234.5);
    expect(parseNumber("-0.70")).toBe(-0.7);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("buy")).toBeNull();
  });
  it("reads server wall time and rejects impossible dates", () => {
    expect(parseWallTime("2026.10.23 14:05:09")).toBe(Date.UTC(2026, 9, 23, 14, 5, 9));
    expect(parseWallTime("2026.13.45 00:00:00")).toBeNull();
    expect(parseWallTime("Time")).toBeNull();
  });
});

describe("parseMt5Report (HTML)", () => {
  const check = (bytes: Uint8Array) => {
    const r = parseMt5Report(bytes);
    expect(r.account).toMatchObject({ login: "5012345", currency: "USD", server: "MetaQuotes-Demo", mode: "demo", type: "hedge" });
    expect(r.positions).toHaveLength(3); // the totals row is ignored
    const [eur, jpy, gold] = r.positions;
    expect(eur).toMatchObject({ ticket: "52001", symbol: "EURUSD", side: "buy", volume: 0.1, stopLoss: 1.08, takeProfit: 1.095, commission: -0.7, swap: 0, profit: 62 });
    expect(jpy).toMatchObject({ side: "sell", stopLoss: null, takeProfit: null, profit: 333.89, swap: -1.25 });
    expect(gold).toMatchObject({ openPrice: 2650.4, closePrice: 2655.9, takeProfit: null }); // "0.00" TP = not set
    expect(r.digitsBySymbol).toMatchObject({ EURUSD: 5, USDJPY: 3, XAUUSD: 2 });
    expect(r.balanceOps).toEqual([
      expect.objectContaining({ amount: 10000, comment: "Deposit" }),
      expect.objectContaining({ amount: -500, comment: "Withdrawal" }),
    ]);
    expect(r.skipped).toEqual([]);
  };
  it("parses UTF-16LE with BOM, as MT5 writes it", () => check(utf16le(reportHtml())));
  it("parses plain UTF-8", () => check(utf8(reportHtml())));

  it("reports rows it cannot trust instead of importing them", () => {
    const bad = td(["2026.10.23 10:00:00", "52004", "GBPUSD", "buy", "0.10", "1.30000", "", "", "", "", "0.00", "0.00", "0.00"]);
    const r = parseMt5Report(utf8(reportHtml(bad)));
    expect(r.positions).toHaveLength(3);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/close time/) })]);
  });
  it("skips duplicate tickets", () => {
    const r = parseMt5Report(utf8(reportHtml(td(rows.eur))));
    expect(r.positions).toHaveLength(3);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: "duplicate ticket 52001" })]);
  });
  it("throws a helpful error when there is no Positions section", () => {
    expect(() => parseMt5Report(utf8("<table><tr><td>hello</td></tr></table>"))).toThrow(Mt5ParseError);
    expect(() => parseMt5Rows([["Deals"], ["x"]])).toThrow(/Positions/);
  });
});

describe("parseMt5Report (Excel)", () => {
  it("parses the same layout from an .xlsx export, tolerating spacer columns", () => {
    const aoa = [
      ["Trade History Report"],
      ["", "Account:", "", "5012345 (USD, MetaQuotes-Demo, demo, Hedge)"],
      ["Positions"],
      POS_HEADER,
      ["", ...rows.eur],
      ["", ...rows.jpy],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const buf = XLSX.write({ SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } }, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = parseMt5Report(new Uint8Array(buf));
    expect(r.account?.login).toBe("5012345");
    expect(r.positions.map((p) => p.ticket)).toEqual(["52001", "52002"]);
    expect(r.positions[0]!.openPrice).toBe(1.085);
  });
});

describe("to-trades", () => {
  const report = parseMt5Report(utf8(reportHtml()));
  const ids = new Map([["EURUSD", "i-eur"]]);

  it("maps costs so net = profit + commission + swap, and marks the P&L as broker-supplied", () => {
    const [t] = reportToTrades(report, "j1", ids, { kind: "fixed", offsetMinutes: 0 });
    expect(t).toMatchObject({
      instrument_id: "i-eur", direction: "long", gross_pnl: 62, commission: -0.7, swap: 0, fees: 0.7, net_pnl: 61.3,
      pnl_manual: true, source: "mt5", external_id: "52001", raw_symbol: "EURUSD", quantity: 0.1,
    });
    const jpy = positionToTrade(report.positions[1]!, "j1", null, { kind: "fixed", offsetMinutes: 0 });
    expect(jpy).toMatchObject({ direction: "short", fees: 8.25, net_pnl: 325.64, instrument_id: null });
  });

  it("converts server time to UTC (GMT+3 summer server)", () => {
    const t = positionToTrade(report.positions[0]!, "j1", null, { kind: "fixed", offsetMinutes: 180 });
    expect(t.entry_at).toBe("2026-10-20T05:15:00.000Z");
  });
  it("applies New York close DST: Oct 20 is GMT+3", () => {
    const t = positionToTrade(report.positions[0]!, "j1", null, { kind: "ny-close" });
    expect(t.entry_at).toBe("2026-10-20T05:15:00.000Z");
  });

  it("maps deposits and withdrawals to idempotent cashflows", () => {
    expect(balanceOpsToCashflows(report, "j1", { kind: "fixed", offsetMinutes: 0 })).toEqual([
      { journal_id: "j1", occurred_on: "2026-10-01", amount: 10000, note: "MT5: Deposit", external_id: "mt5-deal:1" },
      { journal_id: "j1", occurred_on: "2026-10-25", amount: -500, note: "MT5: Withdrawal", external_id: "mt5-deal:9" },
    ]);
  });

  it("summarises the report", () => {
    expect(summarize(report)).toMatchObject({ trades: 3, symbols: 3, net: 414.09 });
  });

  it("refuses another account or currency, warns on server mismatch", () => {
    expect(checkCompatibility(report, { currency: "USD", mt_login: "999" })).toMatchObject({ ok: false });
    expect(checkCompatibility(report, { currency: "EUR" })).toMatchObject({ ok: false });
    expect(checkCompatibility(report, { currency: "usd", mt_login: "5012345" })).toEqual({ ok: true, warnings: [] });
    const w = checkCompatibility(report, { currency: "USD", mt_server: "Other-Live" });
    expect(w).toMatchObject({ ok: true });
    expect(w.ok && w.warnings).toHaveLength(1);
  });
});

describe("import -> P&L engine round trip", () => {
  it("every imported row maps and reconciles against an independent calculation", async () => {
    const report = parseMt5Report(utf8(reportHtml()));
    const trades = reportToTrades(report, "j1", new Map(), { kind: "fixed", offsetMinutes: 0 });
    const engine = new PnlEngine({
      rates: new RateResolver({ providers: [new StaticProvider("test", { JPYUSD: String(1 / 149.75) })] }),
    });
    const journal = { id: "j1", currency: "USD", quantity_unit: "lots" as const };
    const out: Record<string, string | undefined> = {};
    for (const [i, t] of trades.entries()) {
      const row = { ...t, id: `t${i}`, is_break_even: false, risk_amount: null, instrument_id: null } as unknown as TradeRow;
      const m = mapTrade(row, undefined, journal, new Map());
      if (!("trade" in m)) throw new Error(`${t.raw_symbol}: ${m.skip}`);
      // USDJPY and XAUUSD profit in JPY / USD; only JPY needs the rate table.
      const res = await engine.computeClosed({ ...m.trade, spec: { ...m.trade.spec } });
      out[t.raw_symbol] = res.reconciliation?.status;
      expect(res.grossSource).toBe("broker");
      expect(res.netAccount?.toString()).toBe(D(t.net_pnl).toString());
    }
    expect(out).toEqual({ EURUSD: "OK", USDJPY: "OK", XAUUSD: "OK" });
  });
});
