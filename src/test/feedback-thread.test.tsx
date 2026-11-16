import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { FeedbackRow } from "@/lib/mentor/hooks";

const state = { canEdit: false, myId: "mentor-1", rows: [] as FeedbackRow[] };
const post = vi.fn(async () => {});
vi.mock("@/lib/profile-settings", () => ({ useProfile: () => ({ profile: { id: state.myId } }) }));
vi.mock("@/lib/journal/journal-context", () => ({ useCanEdit: () => state.canEdit }));
vi.mock("@/lib/mentor/hooks", () => ({
  useFeedback: () => ({ data: state.rows, isLoading: false, error: null }),
}));
vi.mock("@/lib/mentor/api", () => ({
  postFeedback: (...a: unknown[]) => post(...(a as [])),
  editFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  resolveFeedback: vi.fn(),
}));

import { FeedbackThread } from "@/components/mentor/FeedbackThread";
import { DialogProvider } from "@/components/ui/confirm";

const row = (over: Partial<FeedbackRow>): FeedbackRow => ({
  id: "f1",
  journal_id: "j1",
  target_type: "trade",
  target_id: "t1",
  parent_id: null,
  author_id: "mentor-1",
  author_name: "Mia",
  body: "Good patience.",
  resolved_at: null,
  created_at: new Date().toISOString(),
  ...over,
});
const old = new Date(Date.now() - 60 * 60_000).toISOString();

function renderThread(
  ui: ReactNode = <FeedbackThread journalId="j1" targetType="trade" targetId="t1" />,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DialogProvider>{ui}</DialogProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  post.mockClear();
  Object.assign(state, { canEdit: false, myId: "mentor-1", rows: [] });
});

describe("FeedbackThread", () => {
  it("a mentor with no feedback yet is invited to write the first note, and posting sends the target", async () => {
    renderThread();
    expect(screen.getByText(/No feedback yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Write feedback on this trade"), {
      target: { value: "  Nice entry  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post feedback" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        journalId: "j1",
        targetType: "trade",
        targetId: "t1",
        body: "Nice entry",
      }),
    );
  });
  it("does not send an empty note", () => {
    renderThread();
    expect(
      (screen.getByRole("button", { name: "Post feedback" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("a mentor can edit and delete their own fresh message but not an old one or the student's", () => {
    state.rows = [
      row({ id: "fresh", body: "fresh note" }),
      row({ id: "old", body: "old note", created_at: old, author_id: "mentor-1" }),
      row({
        id: "theirs",
        body: "student reply",
        author_id: "student-1",
        author_name: "Sam",
        parent_id: "fresh",
      }),
    ];
    renderThread();
    // one Edit and one Delete (the fresh message); the old message and the student's reply have neither
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete this feedback" })).toHaveLength(1);
  });
  it("the journal owner can delete and resolve any thread, but cannot edit a mentor's words", () => {
    Object.assign(state, { canEdit: true, myId: "student-1" });
    state.rows = [
      row({ id: "r1", author_id: "mentor-1" }),
      row({ id: "r2", parent_id: "r1", author_id: "mentor-1", body: "more" }),
    ];
    renderThread();
    expect(screen.getAllByRole("button", { name: "Delete this feedback" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Mark resolved/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.getByLabelText("Ask your mentor something")).toBeTruthy();
  });
  it("a reply goes into its thread", async () => {
    state.rows = [row({ id: "root" })];
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
    fireEvent.change(screen.getByLabelText("Write a reply"), { target: { value: "Agreed" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" }).at(-1)!);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({
        journalId: "j1",
        targetType: "trade",
        targetId: "t1",
        body: "Agreed",
        parentId: "root",
      }),
    );
  });
  it("shows a resolved thread as resolved and lets its author reopen it", () => {
    state.rows = [row({ resolved_at: new Date().toISOString() })];
    renderThread();
    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reopen/ })).toBeTruthy();
  });
});
