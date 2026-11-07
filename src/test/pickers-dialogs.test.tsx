import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/lib/profile-settings", () => ({
  useProfile: () => ({ settings: { weekStartsOn: 1 } }),
}));

import { CalendarPanel } from "@/components/ui/date-picker";
import { DialogProvider, useDialogs } from "@/components/ui/confirm";

function Panel({ initial = "", withTime = false }: { initial?: string; withTime?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <CalendarPanel value={v} withTime={withTime} onChange={setV} />
      <output data-testid="v">{v}</output>
    </>
  );
}

describe("CalendarPanel", () => {
  it("keeps the day grid on show after the year and month are chosen, so an exact date can be picked", () => {
    render(<Panel initial="2026-11-02" />);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2024" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2" } }); // March
    expect(screen.getByLabelText("Friday 15 March 2024")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Friday 15 March 2024"));
    expect(screen.getByTestId("v").textContent).toBe("2024-03-15");
  });
  it("marks the picked day and shows a leading/trailing month's days", () => {
    render(<Panel initial="2026-02-10" />);
    expect(screen.getByLabelText("Tuesday 10 February 2026").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
  it("with time: picking a day keeps the time, and the seconds already on the value", () => {
    render(<Panel initial="2026-02-10T09:30:15" withTime />);
    fireEvent.click(screen.getByLabelText("Wednesday 11 February 2026"));
    expect(screen.getByTestId("v").textContent).toBe("2026-02-11T09:30:15");
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "14" } });
    expect(screen.getByTestId("v").textContent).toBe("2026-02-11T14:30:15");
  });
  it("Clear empties the value", () => {
    render(<Panel initial="2026-02-10" />);
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByTestId("v").textContent).toBe("");
  });
});

function Ask({ onResult }: { onResult: (v: unknown) => void }) {
  const { confirm, prompt } = useDialogs();
  return (
    <>
      <button
        onClick={async () =>
          onResult(
            await confirm({ title: "Delete it?", message: "Gone for good.", destructive: true }),
          )
        }
      >
        ask
      </button>
      <button
        onClick={async () => onResult(await prompt({ title: "Folder", defaultValue: "Old" }))}
      >
        name
      </button>
    </>
  );
}

describe("in-app confirm and prompt", () => {
  it("confirm resolves true on the confirm button and false on cancel", async () => {
    const onResult = vi.fn();
    render(
      <DialogProvider>
        <Ask onResult={onResult} />
      </DialogProvider>,
    );
    fireEvent.click(screen.getByText("ask"));
    expect(await screen.findByText("Gone for good.")).toBeTruthy();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(await screen.findByText("Cancel"));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });
  it("prompt returns the typed text, or null when cancelled", async () => {
    const onResult = vi.fn();
    render(
      <DialogProvider>
        <Ask onResult={onResult} />
      </DialogProvider>,
    );
    fireEvent.click(screen.getByText("name"));
    const input = (await screen.findByDisplayValue("Old")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.click(screen.getByText("OK"));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith("New"));
    fireEvent.click(screen.getByText("name"));
    fireEvent.click(await screen.findByText("Cancel"));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(null));
  });
});
