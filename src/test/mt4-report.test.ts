import { describe, expect, it } from "vitest";
import { parseMtReport, parseMt5Report, MtParseError, readMtRows } from "@/lib/import/mt/parse-report";
import {
  balanceOpsToCashflows,
  checkCompatibility,
  positionToTrade,
  reportToTrades,
  summarize,
  toImportPayload,
} from "@/lib/import/mt/to-trades";
import { D, PnlEngine, RateResolver } from "@engine/index.ts";
import { mapTrade, type TradeRow } from "@shared/pnl-map.ts";
import { StaticProvider } from "./pnl-engine/helpers.ts";

const td = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const title = (t: string) => `<tr><td colspan=14><b>${t}</b></td></tr>`;
const utf8 = (s: string) => new TextEncoder().encode(s);

const HEADER_WITH_TAXES = [
  "Ticket",
  "Open Time",
  "Type",
  "Size",
  "Item",
  "Price",
  "S / L",
  "T / P",
  "Close Time",
  "Price",
  "Commission",
  "Taxes",
  "Swap",
  "Profit",
];
const HEADER_NO_TAXES = HEADER_WITH_TAXES.filter((h) => h !== "Taxes");

// ticket, open, type, size, item, price, sl, tp, close, price, commission, taxes, swap, profit
const eur = [
  "3001",
  "2026.10.20 08:15:00",
  "buy",
  "0.10",
  "eurusd",
  "1.08500",
  "1.08000",
  "1.09500",
  "2026.10.20 12:40:10",
  "1.09120",
  "-0.70",
  "-0.10",
  "0.00",
  "62.00",
];
const jpy = [
  "3002",
  "2026.10.21 09:00:00",
  "sell",
  "1.00",
  "usdjpy",
  "150.250",
  "0.000",
  "0.000",
  "2026.10.22 10:30:00",
  "149.750",
  "-7.00",
  "0.00",
  "-1.25",
  "333.89",
];
const gold = [
  "3003",
  "2026.10.22 15:00:00",
  "buy",
  "0.05",
  "XAUUSDm",
  "2650.40",
  "2640.00",
  "0.00",
  "2026.10.22 16:00:00",
  "2655.90",
  "-0.35",
  "0.00",
  "0.00",
  "27.50",
];

function statement(opts: { taxes?: boolean; extraClosed?: string; open?: string } = {}): string {
  const taxes = opts.taxes ?? true;
  const drop = (r: string[]) => (taxes ? r : r.filter((_, i) => i !== 11));
  return `<html><body><table>
    <tr><td colspan=4><b>Account: 8123456</b></td><td colspan=4><b>Name: Test Trader</b></td><td colspan=3><b>Currency: USD</b></td><td colspan=3><b>Leverage: 1:100</b></td></tr>
    ${title("Closed Transactions:")}
    ${td(taxes ? HEADER_WITH_TAXES : HEADER_NO_TAXES)}
    ${td(drop(eur))}${td(drop(jpy))}${td(drop(gold))}
    <tr><td>3010</td><td>2026.10.01 00:00:00</td><td>balance</td><td colspan=10>Deposit</td><td>10 000.00</td></tr>
    <tr><td>3011</td><td>2026.10.25 00:00:00</td><td>balance</td><td colspan=10>Withdrawal</td><td>-500.00</td></tr>
    <tr><td>3012</td><td>2026.10.23 11:00:00</td><td>buy limit</td><td>0.10</td><td>eurusd</td><td>1.07000</td><td>0.00000</td><td>0.00000</td><td>2026.10.23 12:00:00</td><td>1.07000</td><td>0.00</td><td>0.00</td><td>0.00</td><td>0.00</td></tr>
    <tr><td>3013</td><td>2026.10.24 11:00:00</td><td>credit</td><td colspan=10>Bonus</td><td>50.00</td></tr>
    ${opts.extraClosed ?? ""}
    <tr><td colspan=10>&nbsp;</td><td>-8.15</td><td>-0.10</td><td>-1.25</td><td>423.39</td></tr>
    ${title("Open Trades:")}
    ${td(HEADER_WITH_TAXES)}
    ${opts.open ?? td(["3020", "2026.10.26 10:00:00", "sell", "0.20", "gbpusd", "1.30000", "0.00000", "0.00000", "", "1.29800", "0.00", "0.00", "0.00", "40.00"])}
    ${title("Working Orders:")}
    ${td(["3030", "2026.10.26 11:00:00", "buy stop", "0.10", "eurusd", "1.10000", "0.00000", "0.00000", "", "", "", ""])}
  </table></body></html>`;
}

describe("MT4 statement parsing", () => {
  const r = parseMtReport(utf8(statement()));

  it("detects the platform and reads the account header", () => {
    expect(r.platform).toBe("mt4");
    expect(r.account).toEqual({
      login: "8123456",
      currency: "USD",
      server: null,
      mode: null,
      type: null,
      name: "Test Trader",
    });
  });

  it("imports only closed buy/sell rows: not balance, credit, pending orders, totals, open trades or working orders", () => {
    expect(r.positions.map((p) => p.ticket)).toEqual(["3001", "3002", "3003"]);
    expect(r.skipped).toEqual([]);
  });

  it("reads prices, size, times, SL/TP and the three money columns", () => {
    const p = r.positions[0]!;
    expect(p).toMatchObject({
      side: "buy",
      volume: 0.1,
      openPrice: 1.085,
      closePrice: 1.0912,
      stopLoss: 1.08,
      takeProfit: 1.095,
      swap: 0,
      profit: 62,
    });
    expect(p.openWallMs).toBe(Date.UTC(2026, 9, 20, 8, 15, 0));
    expect(p.closeWallMs).toBe(Date.UTC(2026, 9, 20, 12, 40, 10));
    expect(r.positions[1]).toMatchObject({
      side: "sell",
      stopLoss: null,
      takeProfit: null,
      swap: -1.25,
    }); // 0.000 means "no stop"
  });

  it("folds Taxes into commission so net stays exact", () => {
    expect(r.positions[0]!.commission).toBeCloseTo(-0.8, 10);
    expect(summarize(r).net).toBeCloseTo(62 - 0.8 + (333.89 - 7 - 1.25) + (27.5 - 0.35), 8);
  });

  it("reads the same trades when the build has no Taxes column", () => {
    const nt = parseMtReport(utf8(statement({ taxes: false })));
    expect(nt.positions).toHaveLength(3);
    expect(nt.positions[0]!.commission).toBe(-0.7);
    expect(nt.positions[2]!.profit).toBe(27.5);
  });

  it("upper-cases an all-lower-case item but keeps broker suffixes", () => {
    expect(r.positions.map((p) => p.symbol)).toEqual(["EURUSD", "USDJPY", "XAUUSDm"]);
  });

  it("takes price digits from the printed prices", () => {
    expect(r.digitsBySymbol).toEqual({ EURUSD: 5, USDJPY: 3, XAUUSDm: 2 });
  });

  it("reports deposits and withdrawals with their sign", () => {
    expect(r.balanceOps.map((b) => [b.deal, b.amount, b.comment])).toEqual([
      ["3010", 10000, "Deposit"],
      ["3011", -500, "Withdrawal"],
    ]);
  });

  it("counts open trades, never imports them, and says so", () => {
    expect(r.openCount).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/1 open trade is in the statement and not imported/);
  });

  it("skips a duplicate ticket and a row it cannot trust, with a reason", () => {
    const bad = td([
      "3004",
      "2026.10.23 10:00:00",
      "buy",
      "0.10",
      "gbpusd",
      "1.30000",
      "",
      "",
      "",
      "",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
    ]);
    const dup = td(eur);
    const rr = parseMtReport(utf8(statement({ extraClosed: bad + dup })));
    expect(rr.positions).toHaveLength(3);
    expect(rr.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/close time/),
      "duplicate ticket 3001",
    ]);
  });

  it("copes with the unclosed tags and entities real MT4 files contain", () => {
    const sloppy = `<table><tr><td colspan=14>Account: 777&nbsp;&nbsp;Currency: EUR
      <tr><td colspan=14><b>Closed Transactions:</b>
      <tr><td>1<td>2026.10.20 08:00:00<td>sell<td>1&nbsp;000.00<td>eurusd<td>1.08000<td>0.00000<td>0.00000<td>2026.10.20 09:00:00<td>1.07900<td>0.00<td>0.00<td>1&nbsp;000.50</table>`;
    const rr = parseMtReport(utf8(sloppy));
    expect(rr.account?.login).toBe("777");
    expect(rr.positions[0]).toMatchObject({ volume: 1000, profit: 1000.5 });
  });

  it("reads the same file written as UTF-16", () => {
    const s = statement();
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      bytes[2 + i * 2] = s.charCodeAt(i) & 0xff;
      bytes[3 + i * 2] = s.charCodeAt(i) >> 8;
    }
    expect(parseMtReport(bytes).positions).toHaveLength(3);
  });
});

describe("file detection and unsupported files", () => {
  const code = (bytes: Uint8Array) => {
    try {
      parseMtReport(bytes);
    } catch (e) {
      return e instanceof MtParseError ? e.code : "other";
    }
    return "none";
  };

  it("tells MT5 from MT4", () => {
    const mt5 = `<table>${td(["Trade History Report"])}${td(["Account:", "5012345 (USD, MetaQuotes-Demo, demo, Hedge)"])}${td(["Positions"])}${td(["2026.10.20 08:15:00", "52001", "EURUSD", "buy", "0.10", "1.08500", "1.08000", "1.09500", "2026.10.20 12:40:10", "1.09120", "-0.70", "0.00", "62.00"])}</table>`;
    expect(parseMtReport(utf8(mt5)).platform).toBe("mt5");
    expect(parseMtReport(utf8(statement())).platform).toBe("mt4");
  });

  it("explains an MT5 report that has no Positions table", () => {
    expect(
      code(
        utf8(`<table>${td(["Deals"])}${td(["2026.10.01 00:00:00", "1", "", "balance"])}</table>`),
      ),
    ).toBe("mt5-no-positions");
  });

  it("recognises a translated terminal instead of silently importing nothing", () => {
    const es = `<table>${td(["Cuenta: 5012345"])}${td(["Posiciones"])}${td(["2026.10.20 08:15:00", "52001", "EURUSD", "compra", "0.10", "1.08500"])}</table>`;
    expect(code(utf8(es))).toBe("unsupported-language");
  });

  it("rejects a page that is not a MetaTrader report", () => {
    expect(code(utf8("<table><tr><td>hello</td></tr></table>"))).toBe("not-a-report");
    expect(code(utf8("just some text"))).toBe("not-a-report");
  });

  it("rejects an empty file", () => {
    expect(code(new Uint8Array())).toBe("empty");
  });

  it("the MT5-only entry point still refuses an MT4 statement", () => {
    expect(() => parseMt5Report(utf8(statement()))).toThrow(MtParseError);
  });

  it("readMtRows exposes the extracted table", () => {
    expect(readMtRows(utf8("<table><tr><td>a</td></tr></table>"))).toEqual([["a"]]);
  });
});

describe("MT4 -> journal rows", () => {
  const r = parseMtReport(utf8(statement()));
  const utc = { kind: "fixed", offsetMinutes: 0 } as const;

  it("tags trades as mt4 with the order ticket as the idempotency key", () => {
    const rows = reportToTrades(r, "j1", new Map(), utc);
    expect(rows.map((t) => [t.source, t.external_id, t.raw_symbol])).toEqual([
      ["mt4", "3001", "EURUSD"],
      ["mt4", "3002", "USDJPY"],
      ["mt4", "3003", "XAUUSDm"],
    ]);
    expect(rows[0]).toMatchObject({
      fees: 0.8,
      gross_pnl: 62,
      direction: "long",
      pnl_manual: true,
    });
    expect(rows[0]!.net_pnl).toBeCloseTo(61.2, 8);
  });

  it("keys deposits by platform so MT4 and MT5 ids can never collide", () => {
    expect(balanceOpsToCashflows(r, "j1", utc).map((c) => c.external_id)).toEqual([
      "mt4-deal:3010",
      "mt4-deal:3011",
    ]);
  });

  it("builds the RPC payload from broker facts only", () => {
    const p = toImportPayload(r, { kind: "fixed", offsetMinutes: 120 }, { withCashflows: true });
    expect(p.platform).toBe("mt4");
    expect(p.account).toEqual({ login: "8123456", server: null, currency: "USD" });
    expect(p.instruments).toEqual(expect.arrayContaining([{ symbol: "EURUSD", digits: 5 }]));
    expect(p.positions[0]).toEqual({
      external_id: "3001",
      raw_symbol: "EURUSD",
      direction: "long",
      entry_at: "2026-10-20T06:15:00.000Z",
      exit_at: "2026-10-20T10:40:10.000Z", // server GMT+2 -> UTC
      entry_price: 1.085,
      exit_price: 1.0912,
      quantity: 0.1,
      stop_loss: 1.08,
      take_profit: 1.095,
      gross_pnl: 62,
      commission: -0.8,
      swap: 0,
    });
    expect(p.positions[0]).not.toHaveProperty("net_pnl");
    expect(p.positions[0]).not.toHaveProperty("fees");
    expect(p.cashflows).toHaveLength(2);
    expect(toImportPayload(r, utc).cashflows).toEqual([]); // deposits are opt-in
  });

  it("checks platform, account and currency before anything is written", () => {
    const ok = { currency: "USD", mt_platform: "mt4", mt_login: "8123456" };
    expect(checkCompatibility(r, ok)).toEqual({ ok: true, warnings: [] });
    expect(checkCompatibility(r, { ...ok, mt_platform: "mt5" })).toEqual({
      ok: false,
      error: expect.stringMatching(/MetaTrader 4 report.*MetaTrader 5 account/),
    });
    expect(checkCompatibility(r, { ...ok, mt_login: "1" })).toEqual({
      ok: false,
      error: expect.stringMatching(/account 8123456.*account 1/),
    });
    expect(checkCompatibility(r, { ...ok, currency: "EUR" })).toEqual({
      ok: false,
      error: expect.stringMatching(/USD.*EUR/),
    });
    expect(checkCompatibility(r, { currency: "USD" })).toEqual({ ok: true, warnings: [] }); // an unlinked journal accepts it
  });

  it("an imported MT4 trade reconciles against the independent P&L calculation", async () => {
    const t = positionToTrade(r.positions[0]!, "j1", null, utc, "mt4");
    const engine = new PnlEngine({
      rates: new RateResolver({ providers: [new StaticProvider("test", {})] }),
    });
    const m = mapTrade(
      {
        ...t,
        id: "t1",
        is_break_even: false,
        risk_amount: null,
        instrument_id: null,
      } as unknown as TradeRow,
      undefined,
      { id: "j1", currency: "USD", quantity_unit: "lots" },
      new Map(),
    );
    if (!("trade" in m)) throw new Error(m.skip);
    const res = await engine.computeClosed({ ...m.trade, spec: { ...m.trade.spec } });
    expect(res.grossSource).toBe("broker");
    expect(res.reconciliation?.status).toBe("OK");
    expect(res.netAccount?.toString()).toBe(D(t.net_pnl).toString());
  });
});
