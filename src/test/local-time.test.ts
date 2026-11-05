import { afterEach, describe, expect, it } from "vitest";
import { fromInputValue, localDateTime, localDay, localMonth, localWeekStart, toInputValue } from "@/lib/time/local-time";
import { dayKey } from "@/lib/pnl/metrics";

const original = process.env.TZ;
const inZone = (tz: string, fn: () => void) => { process.env.TZ = tz; try { fn(); } finally { process.env.TZ = original; } };
afterEach(() => { process.env.TZ = original; });

describe("one time policy (AM-M03, AM-X03)", () => {
  it("a trade at 23:30Z is the same day everywhere it is shown: Lagos sees 21 Oct, New York sees 20 Oct", () => {
    const t = "2026-10-20T23:30:00Z";
    inZone("Africa/Lagos", () => { expect(localDay(t)).toBe("2026-10-21"); expect(dayKey(t)).toBe("2026-10-21"); expect(new Date(t).getDay()).toBe(3); });
    inZone("America/New_York", () => { expect(localDay(t)).toBe("2026-10-20"); expect(dayKey(t)).toBe("2026-10-20"); expect(new Date(t).getDay()).toBe(2); });
    inZone("UTC", () => expect(localDay(t)).toBe("2026-10-20"));
  });
  it("day key, month key and weekday always agree with each other in the same zone", () => {
    for (const tz of ["Africa/Lagos", "America/New_York", "Pacific/Auckland", "Asia/Kolkata", "UTC"]) inZone(tz, () => {
      for (const t of ["2026-10-31T23:30:00Z", "2026-11-01T00:30:00Z", "2026-03-31T22:59:59Z", "2026-12-31T23:59:00Z"]) {
        const d = new Date(t);
        expect(localDay(t).slice(0, 7)).toBe(localMonth(t));
        expect(localDay(t)).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    });
  });
  it("the weekly digest key is one Monday for the whole week (it used to split in UTC-ahead zones)", () => {
    inZone("Africa/Lagos", () => {
      // Monday 19 Oct 2026, 00:30 and 12:00 Lagos time (UTC+1)
      expect(localWeekStart("2026-10-18T23:30:00Z")).toBe("2026-10-19");
      expect(localWeekStart("2026-10-19T11:00:00Z")).toBe("2026-10-19");
      expect(localWeekStart("2026-10-25T22:00:00Z")).toBe("2026-10-19"); // Sunday 23:00 Lagos
      expect(localWeekStart("2026-10-25T23:30:00Z")).toBe("2026-10-26"); // Monday 00:30 Lagos
    });
  });
  it("list times are shown in local time and match the form", () => {
    inZone("Africa/Lagos", () => { expect(localDateTime("2026-10-20T06:15:42Z")).toBe("2026-10-20 07:15"); expect(toInputValue("2026-10-20T06:15:42Z")).toBe("2026-10-20T07:15:42"); });
    expect(localDateTime(null)).toBe("");
  });
});

describe("form round trips never move a stored time (AM-M01, AM-Y02)", () => {
  const stamps = ["2026-01-15T14:00:00Z", "2026-07-15T14:00:00Z", "2026-10-25T00:30:00Z", "2026-03-08T07:30:00Z", "2026-11-01T05:30:00Z", "2026-10-20T06:15:42Z"];
  it.each(["Africa/Lagos", "America/New_York", "Europe/London", "Pacific/Auckland", "Asia/Kolkata", "UTC"])("open and save untouched in %s", (tz) => {
    inZone(tz, () => { for (const s of stamps) expect(fromInputValue(toInputValue(s), s)).toBe(s); });
  });
  it.each(["Africa/Lagos", "America/New_York", "Europe/London", "Pacific/Auckland"])("repeated open-and-save does not drift in %s", (tz) => {
    inZone(tz, () => { let v = "2026-10-20T12:00:00.000Z"; for (let i = 0; i < 5; i++) v = fromInputValue(toInputValue(v), v); expect(v).toBe("2026-10-20T12:00:00.000Z"); });
  });
  it("even a form that re-parses the text (no original) is stable, because the text carries seconds and the date's own offset", () => {
    inZone("America/New_York", () => { for (const s of stamps) expect(new Date(toInputValue(s)).toISOString()).toBe(new Date(s).toISOString()); });
  });
  it("an edited field is taken as typed", () => {
    inZone("Africa/Lagos", () => expect(fromInputValue("2026-10-20T08:00:00", "2026-10-20T06:15:42Z")).toBe("2026-10-20T07:00:00.000Z"));
  });
});

describe("a trade that crosses a local midnight", () => {
  // 23:30 local on 31 March, built from local parts so it is the same wall time in every test zone.
  const iso = new Date(2026, 2, 31, 23, 30).toISOString();
  it("has one day and one month everywhere", () => {
    expect(localDay(iso)).toBe("2026-03-31");
    expect(localMonth(iso)).toBe("2026-03");
    expect(localDateTime(iso)).toBe("2026-03-31 23:30");
  });
});
