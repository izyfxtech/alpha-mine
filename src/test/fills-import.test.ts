// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fillsToTrades, type RawFill } from "@/lib/import/fills-import";

const fill = (symbol: string, side: "buy" | "sell", quantity: number, price: number, t: number, cost = 0): RawFill => ({ symbol, side, quantity, price, timeMs: Date.UTC(2026, 9, 1, 12, t), cost });

describe("fillsToTrades", () => {
  it("groups fills per symbol into closed trades with legs, weighted prices and positive fees", () => {
    const r = fillsToTrades([
      fill("ES", "buy", 1, 5000, 0, 2), fill("NQ", "sell", 1, 20000, 1, 2),
      fill("ES", "buy", 1, 5010, 2, 2), fill("ES", "sell", 2, 5020, 3, 4),
      fill("NQ", "buy", 1, 19950, 4, 2),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.open).toEqual([]);
    expect(r.trades).toHaveLength(2);
    const es = r.trades.find((t) => t.symbol === "ES")!;
    expect(es).toMatchObject({ direction: "long", entry_price: 5005, exit_price: 5020, quantity: 2, fees: 8 });
    expect(es.legs.map((l) => l.kind)).toEqual(["entry", "entry", "exit"]);
    const nq = r.trades.find((t) => t.symbol === "NQ")!;
    expect(nq).toMatchObject({ direction: "short", entry_price: 20000, exit_price: 19950, fees: 4 });
  });

  it("does not import still-open lots and reports them", () => {
    const r = fillsToTrades([fill("ES", "buy", 3, 5000, 0), fill("ES", "sell", 1, 5010, 1)]);
    expect(r.trades).toEqual([]);
    expect(r.open).toEqual([{ symbol: "ES", side: "buy", lots: 2 }]);
  });

  it("gives the same external id for the same fills, so a re-import adds nothing", () => {
    const fills = [fill("ES", "buy", 1, 5000, 0), fill("ES", "sell", 1, 5010, 1)];
    expect(fillsToTrades(fills).trades[0]!.external_id).toBe(fillsToTrades(fills).trades[0]!.external_id);
  });

  it("skips unreadable fills with a message instead of failing the file", () => {
    const r = fillsToTrades([fill("ES", "buy", 0, 5000, 0), fill("ES", "buy", 1, 5000, 1), fill("ES", "sell", 1, 5001, 2)]);
    expect(r.errors).toHaveLength(1);
    expect(r.trades).toHaveLength(1);
  });
});
