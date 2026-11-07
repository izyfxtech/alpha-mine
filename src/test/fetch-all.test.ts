import { describe, expect, it } from "vitest";
import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";

/** A fake PostgREST: `total` rows, and a Max Rows cap that truncates every response, whatever range was asked. */
function server(total: number, maxRows: number) {
  const calls: { from: number; to: number; counted: boolean }[] = [];
  const page = async (from: number, to: number, first: boolean) => {
    const counted = !!countOption(first);
    calls.push({ from, to, counted });
    const end = Math.min(to, from + maxRows - 1, total - 1);
    const data =
      from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => ({ id: from + i }));
    return { data, count: counted ? total : null, error: null };
  };
  return { page, calls };
}

describe("fetchAllRows (AM-C01)", () => {
  it.each([
    [0, 1000],
    [1, 1000],
    [999, 1000],
    [1000, 1000],
    [1001, 1000],
    [2350, 400],
    [2350, 1000],
    [5000, 1000],
    [37, 5],
  ])("returns all %i rows when the server caps each response at %i", async (total, cap) => {
    const s = server(total, cap);
    const rows = await fetchAllRows(s.page);
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((r) => r.id)).size).toBe(total); // no repeats
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => a - b)); // no gaps in order
  });
  it("asks for the exact count once, on the first page only, and needs one request for a small table", async () => {
    const big = server(2350, 1000);
    await fetchAllRows(big.page);
    expect(big.calls.filter((c) => c.counted)).toHaveLength(1);
    expect(big.calls[0]!.counted).toBe(true);
    const small = server(120, 1000);
    await fetchAllRows(small.page);
    expect(small.calls).toHaveLength(1);
  });
  it("surfaces an error instead of returning a partial list", async () => {
    let n = 0;
    await expect(
      fetchAllRows(async () =>
        ++n === 2
          ? { data: null, error: { message: "boom" } }
          : { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), count: 5000, error: null },
      ),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
