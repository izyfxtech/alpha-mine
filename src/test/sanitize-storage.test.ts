import { describe, expect, it, vi } from "vitest";
import { safeUrl, sanitizeHtml } from "@/lib/sanitize-html";
import { storageGet, storageJson, storageSet } from "@/lib/safe-storage";

describe("sanitizeHtml", () => {
  it("removes scripts, handlers and javascript: URLs but keeps formatting", () => {
    const out = sanitizeHtml(
      '<p onclick="x()">Hi <b>there</b><script>alert(1)</script><a href="javascript:alert(1)">l</a><a href="https://ok.com">ok</a><img src="x" onerror="y()"><iframe src="https://e.com"></iframe></p>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(out).toContain("<b>there</b>");
    expect(out).toContain('href="https://ok.com"');
  });
  it("accepts only http, https and mailto from the prompts", () => {
    expect(safeUrl("example.com")).toBe("https://example.com");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<x>", "image")).toBeNull();
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeUrl("mailto:a@b.co", "image")).toBeNull();
  });
});

describe("safe storage", () => {
  it("never throws when storage is blocked", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    expect(storageGet("k")).toBeNull();
    expect(() => storageSet("k", "v")).not.toThrow();
    expect(storageJson("k", [1])).toEqual([1]);
    vi.unstubAllGlobals();
  });
  it("round-trips and survives corrupt JSON", () => {
    storageSet("am.test", "{bad");
    expect(storageJson("am.test", { ok: true })).toEqual({ ok: true });
    storageSet("am.test", JSON.stringify([2]));
    expect(storageJson("am.test", [])).toEqual([2]);
  });
});

import { compareKeys, pushTo } from "@/lib/group";
import { computeStats, enrichTrade, type TradeRow } from "@/lib/pnl/metrics";

describe("grouping helpers", () => {
  it("pushTo is linear and keeps order", () => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < 50000; i++) pushTo(m, "a", i);
    expect(m.get("a")!.length).toBe(50000);
  });
  it("sorts weekdays in calendar order and numbers naturally", () => {
    expect(["Friday", "Monday", "Sunday", "Tuesday"].sort(compareKeys)).toEqual([
      "Monday",
      "Tuesday",
      "Friday",
      "Sunday",
    ]);
    expect(["Week 41", "Week 3", "Week 12"].sort(compareKeys)).toEqual([
      "Week 3",
      "Week 12",
      "Week 41",
    ]);
  });
});

describe("AM score", () => {
  const row = (i: number): TradeRow => ({
    id: `t${i}`,
    journal_id: "j",
    instrument_id: null,
    setup_id: null,
    trading_plan_id: null,
    direction: "long",
    trade_type: "Spot",
    entry_at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    exit_at: `2026-10-${String(i + 1).padStart(2, "0")}T11:00:00Z`,
    entry_price: 100,
    exit_price: 101,
    quantity: 1,
    stop_loss: 99,
    take_profit: null,
    high_price: null,
    low_price: null,
    otp_hit: null,
    gross_pnl: 50,
    fees: 0,
    net_pnl: 50,
    risk_amount: null,
    is_favorite: false,
    notes: null,
    created_at: "",
    is_break_even: false,
    trade_no: i + 1,
  });
  it("ten straight winners are not a top score", () => {
    const ts = Array.from({ length: 10 }, (_, i) => enrichTrade(row(i), new Map(), new Map(), []));
    expect(computeStats(ts, 10000, []).score).toBeLessThan(50);
  });
});
