import { describe, expect, it } from "vitest";
import { numberOrNull } from "@/lib/numbers";
import { byEntry, sortedByEntry } from "@/lib/pnl/sort";
import { storageStringMap, storageStrings } from "@/lib/safe-storage";

describe("numberOrNull", () => {
  it("treats empty input as no value", () => {
    for (const v of [null, undefined, "", "   "]) expect(numberOrNull(v)).toBeNull();
  });
  it("keeps zero and parses text", () => {
    expect(numberOrNull(0)).toBe(0);
    expect(numberOrNull("0")).toBe(0);
    expect(numberOrNull(" 1.5 ")).toBe(1.5);
  });
});

describe("sorting by entry", () => {
  const a = { entry_at: "2026-01-02T10:00:00Z" },
    b = { entry_at: "2026-01-01T10:00:00Z" };
  it("orders oldest first without touching the input", () => {
    const input = [a, b];
    expect(sortedByEntry(input)).toEqual([b, a]);
    expect(input).toEqual([a, b]);
    expect(byEntry(a, b)).toBeGreaterThan(0);
  });
});

describe("stored lists", () => {
  it("accept only the expected shape", () => {
    localStorage.setItem("k1", JSON.stringify(["a", "b"]));
    localStorage.setItem("k2", JSON.stringify([1, 2]));
    localStorage.setItem("k3", "not json");
    localStorage.setItem("k4", JSON.stringify({ x: "1", y: 2 }));
    expect(storageStrings("k1")).toEqual(["a", "b"]);
    expect(storageStrings("k2")).toEqual([]);
    expect(storageStrings("k3")).toEqual([]);
    expect(storageStringMap("k4")).toEqual({ x: "1" });
    expect(storageStrings("missing")).toEqual([]);
  });
});
