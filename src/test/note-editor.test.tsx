import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "@/components/diary/NoteEditor";

// The rich editor needs a real browser; a plain textarea stands in for it.
vi.mock("@/components/RichEditor", () => ({
  RichEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const page = { id: "n1", title: "Plan", content: "hello" };

function setup(save = vi.fn().mockResolvedValue(true)) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <NoteEditor page={page} save={save} onDelete={() => {}} />
    </QueryClientProvider>,
  );
  return { save, ...view };
}

describe("NoteEditor autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves once, 700 ms after typing stops", async () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "hello w" } });
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "hello world" } });
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    await act(() => vi.advanceTimersByTimeAsync(699));
    expect(save).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toMatchObject({ title: "Plan", content: "hello world" });
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("does not save when the text is put back to what was stored", async () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "hello" } });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("saves the pending edit straight away when the editor goes away", async () => {
    const { save, unmount } = setup();
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "changed" } });
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toMatchObject({ content: "changed" });
  });

  it("reports a failed save and retries on the next edit", async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    setup(save);
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "a" } });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(screen.getByRole("status").textContent).toMatch(/Not saved/);
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "ab" } });
    await act(() => vi.advanceTimersByTimeAsync(750));
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });
});
