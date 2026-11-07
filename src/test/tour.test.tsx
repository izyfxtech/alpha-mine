import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SpotlightTour } from "@/components/onboarding/SpotlightTour";
import { START_TOUR_EVENT, TOUR_STEPS, navSlug, placePopover } from "@/lib/tour";
import { NAV } from "@/lib/nav";

const view = { width: 1200, height: 800 }, size = { width: 320, height: 180 };

describe("placePopover", () => {
  it("puts the card to the right of a sidebar item and keeps it on screen", () => {
    const p = placePopover({ top: 780, left: 0, width: 200, height: 38 }, size, view);
    expect(p.left).toBe(214);
    expect(p.top).toBeLessThanOrEqual(view.height - size.height - 12);
  });
  it("falls back to the left, then below, when there is no room", () => {
    expect(placePopover({ top: 100, left: 1000, width: 190, height: 40 }, size, view).left).toBe(1000 - 14 - 320);
    const below = placePopover({ top: 100, left: 300, width: 780, height: 40 }, { width: 400, height: 100 }, { width: 1100, height: 800 });
    expect(below.top).toBe(154);
  });
  it("centres when there is no target", () => expect(placePopover(null, size, view)).toEqual({ top: 310, left: 440 }));
});

describe("tour steps", () => {
  it("every sidebar step points at an item that exists in the menu", () => {
    const slugs = new Set(NAV.map((n) => navSlug(n.label)));
    for (const s of TOUR_STEPS.filter((s) => s.target?.startsWith("nav-"))) expect(slugs.has(s.target!), s.target!).toBe(true);
  });
});

describe("SpotlightTour", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("walks through steps with the buttons and keys, skips targets that are not on screen, and closes", () => {
    const el = document.createElement("div"); el.dataset.tour = "nav-home"; el.scrollIntoView = () => {};
    el.getBoundingClientRect = () => ({ top: 80, left: 8, width: 190, height: 38, right: 198, bottom: 118, x: 8, y: 80, toJSON: () => ({}) });
    document.body.appendChild(el);
    render(<SpotlightTour />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { window.dispatchEvent(new Event(START_TOUR_EVENT)); });
    expect(screen.getByText("A quick look around")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy(); // the intro and Home; everything else is not on screen
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByRole("dialog").textContent).toContain("Home");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("A quick look around")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
