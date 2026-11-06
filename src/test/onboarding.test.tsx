import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readSettings } from "@/lib/profile-settings";

let journal: Record<string, unknown>;
vi.mock("@/lib/journal/journal-context", () => ({ useJournal: () => ({ journal }) }));
vi.mock("@/lib/profile-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/profile-settings")>()),
  useProfile: () => ({ profile: { id: "u", display_name: "Izy", email: "", base_currency: "USD" }, settings: { onboarded: false }, saveSettings: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/journal/TradeDrawer", () => ({ useTradeDrawer: () => ({ open: vi.fn() }) }));
vi.mock("@/components/journal/ImportDialog", () => ({ ImportDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) }) },
}));

import { Onboarding, OPEN_ONBOARDING_EVENT } from "@/components/onboarding/Onboarding";

const base = { id: "j", trade_type: "Spot", markets: [] as string[] };
function open() {
  render(<QueryClientProvider client={new QueryClient()}><Onboarding /></QueryClientProvider>);
  fireEvent(window, new Event(OPEN_ONBOARDING_EVENT));
  fireEvent.click(screen.getByText("Get started"));
}

describe("Onboarding journal step", () => {
  it("shows a journal you already set up for confirmation instead of asking again", () => {
    journal = { ...base, name: "FTMO 100k", currency: "EUR", starting_balance: 100000, markets: ["Forex"] };
    open();
    expect(screen.queryByLabelText("Journal name")).toBeNull();
    expect(screen.getByText("FTMO 100k")).toBeTruthy();
    expect(screen.getByText("Looks right")).toBeTruthy();
    fireEvent.click(screen.getByText("Change journal details"));
    expect(screen.getByLabelText("Journal name")).toBeTruthy();
  });
  it("asks for the details when the journal is still the untouched default", () => {
    journal = { ...base, name: "Trading Journal", currency: "USD", starting_balance: 10000 };
    open();
    expect(screen.getByLabelText("Journal name")).toBeTruthy();
  });
});

describe("profile settings", () => {
  it("reads the checklist flag, off by default", () => {
    expect(readSettings({}).hideChecklist).toBe(false);
    expect(readSettings({ hideChecklist: true }).hideChecklist).toBe(true);
  });
});
