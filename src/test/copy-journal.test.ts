import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };
const db: Record<string, Row[]> = {};
let failOn: string | null = null;
const deletedJournals: string[] = [];

/** A tiny in-memory stand-in for the table API: select (all rows of a journal), insert, delete. */
function table(name: string) {
  return {
    select: () => {
      const q = {
        eq: (_col: string, value: string) => {
          const rows = (db[name] ?? []).filter((r) => r.journal_id === value);
          const done = {
            order: () => done,
            range: () => Promise.resolve({ data: rows, error: null, count: rows.length }),
          };
          return done;
        },
      };
      return q;
    },
    insert: (values: Row | Row[]) => {
      const list = Array.isArray(values) ? values : [values];
      if (failOn === name)
        return Object.assign(Promise.resolve({ error: { message: `${name} failed` } }), {
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "x" } }),
          }),
        });
      const withIds = list.map((r) => ({
        ...r,
        id: r.id ?? `new-${name}-${(db[name] ?? []).length + 1}`,
      }));
      db[name] = [...(db[name] ?? []), ...withIds];
      return Object.assign(Promise.resolve({ error: null }), {
        select: () => ({ single: () => Promise.resolve({ data: withIds[0], error: null }) }),
      });
    },
    delete: () => ({
      eq: (_c: string, id: string) => {
        deletedJournals.push(id);
        return Promise.resolve({ error: null });
      },
    }),
  };
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (n: string) => table(n) } }));
vi.mock("@/lib/journal/untyped-table", () => ({ fromTable: (n: string) => table(n) }));

import { copyJournal } from "@/lib/journal/copy-journal";

const source = {
  id: "J1",
  currency: "USD",
  starting_balance: 1000,
  broker: null,
  markets: [],
  deposit_date: null,
  trade_type: "Spot",
  auto_pnl: false,
  quantity_unit: "lots",
  session_categories: [],
};

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  failOn = null;
  deletedJournals.length = 0;
  db.setups = [{ id: "s1", journal_id: "J1", name: "Breakout", created_at: "t" }];
  db.trading_plans = [{ id: "p1", journal_id: "J1", name: "Plan A", created_at: "t" }];
  db.trades = [
    {
      id: "t1",
      journal_id: "J1",
      trade_no: 7,
      setup_id: "s1",
      trading_plan_id: "p1",
      instrument_id: null,
      created_at: "t",
    },
  ];
  db.missed_trades = [{ id: "m1", journal_id: "J1", created_at: "t" }];
  db.trade_screenshots = [
    {
      id: "x1",
      journal_id: "J1",
      trade_id: "t1",
      missed_trade_id: null,
      planned_trade_id: null,
      path: "u/a.webp",
      caption: null,
    },
  ];
});

describe("copyJournal", () => {
  it("copies structure and trades with remapped links, and shares the screenshot file", async () => {
    const id = await copyJournal(source, "Copy", { trades: true, plans: true, missed: false });
    expect(db.journals?.[0]?.name).toBe("Copy");
    expect(id).toBe(db.journals![0]!.id);
    const newSetup = db.setups!.find((s) => s.journal_id === id)!;
    const newPlan = db.trading_plans!.find((p) => p.journal_id === id)!;
    const newTrade = db.trades!.find((t) => t.journal_id === id)!;
    expect(newSetup.id).not.toBe("s1");
    expect(newTrade.setup_id).toBe(newSetup.id);
    expect(newTrade.trading_plan_id).toBe(newPlan.id);
    expect(newTrade.trade_no).toBeUndefined(); // the copy numbers its own trades
    expect(newTrade.pnl_manual).toBe(true);
    const shot = db.trade_screenshots!.find((s) => s.journal_id === id)!;
    expect(shot.trade_id).toBe(newTrade.id);
    expect(shot.path).toBe("u/a.webp");
  });

  it("leaves out what was not asked for", async () => {
    const id = await copyJournal(source, "Copy", { trades: false, plans: false, missed: false });
    expect(db.trades!.filter((t) => t.journal_id === id)).toHaveLength(0);
    expect(db.trading_plans!.filter((p) => p.journal_id === id)).toHaveLength(0);
    expect(db.missed_trades!.filter((m) => m.journal_id === id)).toHaveLength(0);
    expect(db.setups!.filter((s) => s.journal_id === id)).toHaveLength(1);
  });

  it("deletes the new journal and rethrows when a step fails", async () => {
    failOn = "trades";
    await expect(
      copyJournal(source, "Copy", { trades: true, plans: false, missed: false }),
    ).rejects.toThrow("trades failed");
    expect(deletedJournals).toEqual([db.journals![0]!.id]);
  });
});
