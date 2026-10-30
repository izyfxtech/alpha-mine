import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Lightbox } from "@/components/journal/Lightbox";
import { ScreenshotGallery, TradeCards } from "@/components/journal/TradeViews";
import { readSettings } from "@/lib/profile-settings";
import type { Trade } from "@/lib/pnl/metrics";
import type { Shot } from "@/components/journal/Screenshots";

const trade = (id: string, net: number): Trade => ({ id, instrument: id.toUpperCase(), direction: "long", entry_at: "2026-10-20T08:00:00Z", exit_at: "2026-10-20T09:00:00Z", net_pnl: net, setup: "Breakout", notes: null, is_favorite: false, r: null } as unknown as Trade);
const shot = (id: string, tradeId: string): Shot => ({ id, trade_id: tradeId, missed_trade_id: null, planned_trade_id: null, path: id, caption: null, url: `https://img.test/${id}.png` });

function Harness({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const items = [1, 2, 3].map((n) => ({ url: `https://img.test/${n}.png`, title: `Shot ${n}` }));
  return <Lightbox items={items} index={i} onIndex={setI} onClose={onClose} />;
}

describe("Lightbox", () => {
  it("steps with the arrow keys, wraps around and closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("journal views", () => {
  const trades = [trade("eurusd", 50), trade("gbpusd", -20), trade("usdjpy", 10)];
  const shots = new Map([["eurusd", [shot("a", "eurusd"), shot("b", "eurusd")]], ["gbpusd", [shot("c", "gbpusd")]]]);

  it("gallery shows every screenshot and filters by result", () => {
    render(<ScreenshotGallery trades={trades} shotsByTrade={shots} onOpen={() => {}} />);
    expect(screen.getByText("3 screenshots")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Losers" }));
    expect(screen.getByText("1 screenshot")).toBeTruthy();
  });
  it("gallery explains an empty state", () => {
    render(<ScreenshotGallery trades={trades} shotsByTrade={new Map()} onOpen={() => {}} />);
    expect(screen.getByText(/No screenshots yet/)).toBeTruthy();
  });
  it("cards show one card per trade and open the trade on click", () => {
    const onOpen = vi.fn();
    render(<TradeCards trades={trades} shotsByTrade={shots} onOpen={onOpen} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    fireEvent.click(screen.getByText("USDJPY"));
    expect(onOpen).toHaveBeenCalledWith(trades[2]);
  });
});

describe("profile settings", () => {
  it("defaults onboarded to false and only accepts a real boolean", () => {
    expect(readSettings(null).onboarded).toBe(false);
    expect(readSettings({ onboarded: "yes" }).onboarded).toBe(false);
    expect(readSettings({ onboarded: true }).onboarded).toBe(true);
  });
});
