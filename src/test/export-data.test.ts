import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { EXPORT_TABLES, tradesCsv, type ExportFile } from "@/lib/account/export-data";

describe("data export", () => {
  it("covers every table that belongs to a journal", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const tables = types.slice(types.indexOf("Tables: {"), types.indexOf("Views:"));
    const withJournal = [...tables.matchAll(/\n {6}(\w+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g)].filter((m) => /\bjournal_id\b/.test(m[2]!)).map((m) => m[1]!);
    expect(withJournal.length).toBeGreaterThan(15);
    // Internal bookkeeping that is not the person's content.
    const internal = new Set(["merged_trade_ids", "sync_jobs", "trade_pnl_audit"]);
    const missing = withJournal.filter((t) => !internal.has(t) && !EXPORT_TABLES.some((e) => e.table === t));
    expect(missing).toEqual([]);
  });
  it("gives every table a column order that makes paging stable", () => {
    for (const t of EXPORT_TABLES) expect(t.order.length).toBeGreaterThan(0);
  });
  it("writes trades as CSV with quoting, journal name first and a union of columns", () => {
    const file = { exported_at: "", format: 1, note: "", profile: null, journals: [
      { name: "Main, demo", data: { trades: [{ id: "1", notes: 'said "go"', net_pnl: 10 }, { id: "2", extra: "x\ny" }] } },
      { name: "Second", data: { trades: [] } },
    ] } as unknown as ExportFile;
    const lines = tradesCsv(file).split("\r\n");
    expect(lines[0]).toBe("journal,id,notes,net_pnl,extra");
    expect(lines[1]).toBe('"Main, demo",1,"said ""go""",10,');
    expect(tradesCsv(file)).toContain('"x\ny"');
  });
});
