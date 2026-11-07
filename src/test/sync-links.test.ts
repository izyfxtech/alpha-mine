import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let failInsert = false;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [{ option_id: "a" }, { option_id: "b" }], error: null }),
      }),
      insert: async (rows: unknown[]) => {
        calls.push(`insert ${rows.length}`);
        return { error: failInsert ? { message: "boom" } : null };
      },
      delete: () => ({
        eq: () => ({
          in: async (_c: string, ids: string[]) => {
            calls.push(`delete ${ids.join(",")}`);
            return { error: null };
          },
        }),
      }),
    }),
  },
}));
import { syncLinks } from "@/lib/journal/sync-links";

describe("syncLinks", () => {
  it("adds what is missing before removing what is gone", async () => {
    calls.length = 0;
    expect(await syncLinks("t", "trade_id", "x", "j", ["b", "c"])).toBeNull();
    expect(calls).toEqual(["insert 1", "delete a"]);
  });
  it("removes nothing when the insert fails, so tags are never wiped", async () => {
    calls.length = 0;
    failInsert = true;
    expect(await syncLinks("t", "trade_id", "x", "j", ["c"])).toBe("boom");
    expect(calls).toEqual(["insert 1"]);
  });
});
