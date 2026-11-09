import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { MILESTONES, MilestonesSkeleton } from "@/components/milestones/MilestoneCard";
import { SimulatorSkeleton, SIMULATOR_RESULTS } from "@/components/strategy/SimulatorLayout";
import { EQUITY_STAT_LABELS } from "@/components/equity/EquityControls";
import { EquitySkeleton } from "@/components/equity/EquitySkeleton";
import { MONTHLY_COLUMNS, MonthlySkeleton } from "@/components/reports/MonthlyTable";
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

describe("other skeletons", () => {
  it("Milestones keeps every card's title and description", () => {
    render(<MilestonesSkeleton />);
    for (const m of MILESTONES) {
      expect(screen.getByText(m.title)).toBeTruthy();
      expect(screen.getByText(m.description)).toBeTruthy();
    }
  });

  it("Equity keeps the stat labels", () => {
    render(<EquitySkeleton />);
    for (const label of EQUITY_STAT_LABELS) expect(screen.getByText(label)).toBeTruthy();
  });

  it("Monthly keeps every column head", () => {
    render(<MonthlySkeleton />);
    for (const h of MONTHLY_COLUMNS) expect(screen.getAllByText(h).length).toBeGreaterThan(0);
  });

  it("Simulator keeps every result panel", () => {
    render(<SimulatorSkeleton />);
    for (const p of [...SIMULATOR_RESULTS.streaks, ...SIMULATOR_RESULTS.distribution])
      expect(screen.getByText(p.title)).toBeTruthy();
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

  it("has a skeleton for the pages whose layout is known before their data arrives", () => {
    for (const path of [
      "/home",
      "/portfolio",
      "/equity",
      "/analytics",
      "/journal",
      "/milestones",
      "/reports/annual",
      "/reports/calendar",
      "/reports/monthly",
      "/strategy-lab/simulator",
    ])
      expect(skeletonFor(path), path).toBeTruthy();
  });

  it("has none for pages that list your own records, whose size depends on how many there are", () => {
    for (const path of [
      "/rules",
      "/open-trades",
      "/missed-trades",
      "/prop-challenge",
      "/edge-finder",
      "/strategy-lab/backtester",
      "/strategy-lab/alternatives",
    ])
      expect(skeletonFor(path), path).toBeUndefined();
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
