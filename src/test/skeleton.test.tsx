import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { needsTrades } from "@/components/layout/RouteGate";

describe("loading skeleton", () => {
  it("announces itself to screen readers and hides the placeholder blocks", () => {
    render(<PageSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(5);
  });

  it("only holds back pages that read trades", () => {
    expect(needsTrades("/journal")).toBe(true);
    expect(needsTrades("/analytics")).toBe(true);
    expect(needsTrades("/settings/account")).toBe(false);
    expect(needsTrades("/plans")).toBe(false);
    expect(needsTrades("/diary/notebook")).toBe(false);
    expect(needsTrades("/diary/sessions")).toBe(true);
  });
});
