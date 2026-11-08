import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { RichEditor } from "@/components/RichEditor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Draft = { title: string; content: string };
type NotePage = { id: string; title: string; content: string | null };

/**
 * One open note. It is keyed by the note's id, so switching notes starts a fresh editor and the old one saves on its way out.
 * Edits are saved 700 ms after typing stops, and immediately when the tab is hidden or closed.
 */
export function NoteEditor({
  page,
  save,
  onDelete,
}: {
  page: NotePage;
  save: (
    id: string,
    patch: { title: string; content: string; updated_at: string },
  ) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content ?? "");
  // The latest edit that has not been saved yet, if any.
  const [unsaved, setUnsaved] = useState<Draft | null>(null);
  const saving = useMutation({
    mutationFn: async (edit: Draft) => {
      const ok = await save(page.id, { ...edit, updated_at: new Date().toISOString() });
      if (!ok) throw new Error("The note was not saved.");
    },
    // A newer edit typed while this one was saving stays unsaved.
    onSuccess: (_, edit) => setUnsaved((current) => (current === edit ? null : current)),
  });
  const saveState = saving.isError ? "failed" : unsaved ? "saving" : "saved";
  // Saves 700 ms after typing stops. A failed save is retried by the next edit.
  const saveSoon = useDebouncedCallback((edit: Draft) => saving.mutate(edit), 700);

  const edit = (next: Draft) => {
    setTitle(next.title);
    setContent(next.content);
    saving.reset();
    const changed = next.title !== page.title || next.content !== (page.content ?? "");
    setUnsaved(changed ? next : null);
    if (changed) saveSoon(next);
    else saveSoon.cancel(); // typed back to what is stored: nothing left to save
  };

  useEffect(() => {
    // Save at once when hiding the tab, leaving the page or switching notes; warn if closing the tab with an edit unsaved.
    const onHide = () => {
      if (document.visibilityState === "hidden") saveSoon.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveSoon.isPending()) {
        saveSoon.flush();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveSoon.flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveSoon.flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
      saveSoon.flush();
    };
  }, [saveSoon]);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => edit({ title: e.target.value, content })}
          className="flex-1 bg-transparent text-[16px] font-bold outline-none"
        />
        <span
          className={cn("text-xs", saveState === "failed" ? "text-destructive" : "text-t4")}
          role="status"
        >
          {saveState === "saving"
            ? "Saving…"
            : saveState === "failed"
              ? "Not saved — retrying on your next edit"
              : "Saved"}
        </span>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Delete note">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <RichEditor
        value={content}
        onChange={(html) => edit({ title, content: html })}
        className="min-h-0 flex-1"
      />
    </>
  );
}
