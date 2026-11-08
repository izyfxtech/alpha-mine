import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { needsTrades, skeletonFor } from "@/components/layout/RouteGate";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

describe("loading skeleton", () => {
  it("announces itself to screen readers and hides the placeholder blocks", () => {
    render(<PageSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(5);
  });

  it("each layout is different, so a page loads as its own shape", () => {
    const blocks = (variant: "dashboard" | "table" | "chart" | "report") => {
      const { container, unmount } = render(<PageSkeleton variant={variant} />);
      const n = container.querySelectorAll(".skeleton").length;
      unmount();
      return n;
    };
    const counts = [blocks("dashboard"), blocks("table"), blocks("chart"), blocks("report")];
    expect(new Set(counts).size).toBe(4);
  });

  it("only holds back pages that read trades", () => {
    expect(needsTrades("/journal")).toBe(true);
    expect(needsTrades("/settings/account")).toBe(false);
    expect(needsTrades("/plans")).toBe(false);
    expect(needsTrades("/diary/notebook")).toBe(false);
    expect(needsTrades("/diary/sessions")).toBe(true);
  });

  it("picks the layout from the page", () => {
    expect(skeletonFor("/journal")).toBe("table");
    expect(skeletonFor("/diary/sessions")).toBe("table");
    expect(skeletonFor("/strategy-lab/alternatives")).toBe("table");
    expect(skeletonFor("/strategy-lab/simulator")).toBe("chart");
    expect(skeletonFor("/chart-lab/sqn")).toBe("chart");
    expect(skeletonFor("/reports/monthly")).toBe("report");
    expect(skeletonFor("/home")).toBe("dashboard");
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
