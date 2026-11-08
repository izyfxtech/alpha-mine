import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { cumulative } from "@/lib/numbers";
import { useWhenChanged } from "@/lib/use-when-changed";

describe("cumulative", () => {
  it("returns running totals, optionally from a starting value", () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
    expect(cumulative([5, -2], 100)).toEqual([105, 103]);
    expect(cumulative([])).toEqual([]);
  });
});

describe("useWhenChanged", () => {
  it("fires on change only, and the state it sets is correct in the same render", () => {
    const calls: [number, number][] = [];
    const { result, rerender } = renderHook(
      ({ v }) => {
        const [mirror, setMirror] = useState(-1);
        useWhenChanged(v, (next, prev) => {
          calls.push([next, prev]);
          setMirror(next * 10);
        });
        return mirror;
      },
      { initialProps: { v: 1 } },
    );
    expect(calls).toEqual([]); // not on first render
    expect(result.current).toBe(-1);
    act(() => rerender({ v: 2 }));
    expect(result.current).toBe(20);
    act(() => rerender({ v: 2 }));
    expect(calls).toEqual([[2, 1]]);
  });
});
