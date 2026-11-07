import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DragHandle, EditableText, useDragReorder } from "@/components/settings-parts";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal/journal-context";
import { cn } from "@/lib/utils";
import { ItemsToggle, RowActions } from "@/components/settings/item-controls";
import { card } from "@/components/settings/settings-kit";

export function SessionCategories() {
  const { journal, refresh } = useJournal();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const [name, setName] = useState("");
  const active = journal?.session_categories ?? [];
  const disabled = journal?.disabled_session_categories ?? [];
  const list = tab === "active" ? active : disabled;
  const save = async (patch: {
    session_categories?: string[];
    disabled_session_categories?: string[];
  }) => {
    if (!journal) return;
    const { error } = await supabase.from("journals").update(patch).eq("id", journal.id);
    if (error) toast.error(error.message);
    else refresh();
  };
  const { rowProps, over } = useDragReorder(
    list,
    (next) => void save({ session_categories: next }),
  );
  /** Sessions store category names as text, so a rename has to be applied to them too. */
  const rename = async (from: string, to: string) => {
    if (!journal || [...active, ...disabled].some((c) => c.toLowerCase() === to.toLowerCase())) {
      toast.error(`"${to}" already exists`);
      return;
    }
    const { data: sessions, error: readErr } = await supabase
      .from("diary_sessions")
      .select("id,categories")
      .eq("journal_id", journal.id)
      .contains("categories", [from]);
    if (readErr) {
      toast.error(readErr.message);
      return;
    }
    const results = await Promise.all(
      (sessions ?? []).map((s) =>
        supabase
          .from("diary_sessions")
          .update({ categories: s.categories.map((c: string) => (c === from ? to : c)) })
          .eq("id", s.id),
      ),
    );
    // Rename the list only once every session moved, so a failure never leaves sessions under a category that no longer exists.
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(failed.error.message);
      return;
    }
    await save({ session_categories: active.map((c) => (c === from ? to : c)) });
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if ([...active, ...disabled].some((c) => c.toLowerCase() === n.toLowerCase())) {
      toast.error(
        `"${n}" already exists${disabled.includes(n) ? " (it is under Disabled Items)" : ""}`,
      );
      return;
    }
    await save({ session_categories: [...active, n] });
    setName("");
  };
  return (
    <div className="max-w-[700px]">
      <ItemsToggle value={tab} onChange={setTab} disabledCount={disabled.length} />
      {tab === "active" && (
        <form
          className="mb-4 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Session Category"
            aria-label="New Session Category"
            className="h-9 bg-card"
          />
          <Button
            type="submit"
            variant={name.trim() ? "ink" : "secondary"}
            disabled={!name.trim()}
            className="shrink-0"
          >
            Add Session Category
          </Button>
        </form>
      )}
      <div className={cn(card, "py-1")}>
        <div className="flex h-[42px] items-center px-3 pl-9 text-[13px] font-semibold">Name</div>
        {!list.length && (
          <p className="px-5 py-8 text-center text-[12px] text-t4">
            {tab === "active" ? "No session categories yet." : "Nothing is disabled."}
          </p>
        )}
        {list.map((c) => (
          <div
            key={c}
            {...(tab === "active" ? rowProps(c) : {})}
            className={cn(
              "flex min-h-[37px] items-center gap-2 border-t px-3 text-[13px]",
              over === c && "bg-muted",
            )}
          >
            {tab === "active" ? <DragHandle /> : <span className="w-4" />}
            {tab === "active" ? (
              <EditableText value={c} label="Session category" onSave={(v) => void rename(c, v)} />
            ) : (
              <span className="flex-1 px-2">{c}</span>
            )}
            <RowActions
              disabled={tab === "disabled"}
              name={c}
              used={0}
              onDisable={() => {
                void save({
                  session_categories: active.filter((x) => x !== c),
                  disabled_session_categories: [...disabled, c],
                });
                toast.success(`"${c}" disabled. Existing sessions keep it.`);
              }}
              onRestore={() =>
                void save({
                  session_categories: [...active, c],
                  disabled_session_categories: disabled.filter((x) => x !== c),
                })
              }
              onDelete={() =>
                void save({ disabled_session_categories: disabled.filter((x) => x !== c) })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- Custom statistics ---------------------------- */
