import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { needsTrades, skeletonFor } from "@/components/layout/RouteGate";
import { EVALUATION_LABELS, HOME_CHART_HEIGHT, HOME_CHART_ROWS } from "@/lib/home-layout";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

vi.mock("@/lib/journal/journal-context", () => ({ useJournal: () => ({ journal: null }) }));
vi.mock("@/lib/profile-settings", () => ({
  useProfile: () => ({ settings: { showWeeklyTotals: true, weekStartsOn: 1 } }),
}));

describe("Home skeleton", () => {
  it("keeps the page's own headings, so only the data is a placeholder", () => {
    render(<HomeSkeleton />);
    for (const label of EVALUATION_LABELS) expect(screen.getByText(label)).toBeTruthy();
    for (const title of HOME_CHART_ROWS.flat()) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("Profit Calendar")).toBeTruthy();
  });

  it("gives each chart panel the chart's height", () => {
    const { container } = render(<HomeSkeleton />);
    const charts = [...container.querySelectorAll<HTMLElement>(".skeleton")].filter(
      (el) => el.style.height === `${HOME_CHART_HEIGHT}px`,
    );
    expect(charts).toHaveLength(HOME_CHART_ROWS.flat().length);
  });

  it("draws a six-week calendar with a Total column", () => {
    const { container } = render(<HomeSkeleton />);
    expect(screen.getByText("Total")).toBeTruthy();
    expect(container.querySelectorAll(".h-\\[76px\\]")).toHaveLength(6 * 8);
  });
});

describe("route gate", () => {
  it("only holds back pages that read trades", () => {
    expect(needsTrades("/journal")).toBe(true);
    expect(needsTrades("/settings/account")).toBe(false);
    expect(needsTrades("/plans")).toBe(false);
    expect(needsTrades("/diary/notebook")).toBe(false);
    expect(needsTrades("/diary/sessions")).toBe(true);
  });

  it("has a skeleton only for pages whose layout is fixed", () => {
    expect(skeletonFor("/home")?.type).toBe(HomeSkeleton);
    expect(skeletonFor("/journal")).toBeUndefined();
    expect(skeletonFor("/reports/monthly")).toBeUndefined();
  });
});

describe("useDelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays false when loading finishes inside the delay", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 250), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(false);
    rerender({ on: false });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });

  it("turns true after the delay and false again as soon as loading ends", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 250), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(true);
    rerender({ on: false });
    expect(result.current).toBe(false);
  });
});
