import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DragHandle, EditableText, useDragReorder, useUsage } from "@/components/settings-parts";
import { useJournal } from "@/lib/journal/journal-context";
import { useJournalTable } from "@/lib/journal/crud";
import { cn } from "@/lib/utils";
import { ItemsToggle, RowActions, sentimentTone } from "@/components/settings/item-controls";
import { card, sel } from "@/components/settings/settings-kit";

type CommentRow = {
  id: string;
  label: string;
  phase: string;
  sentiment: string;
  disabled: boolean;
};
const PHASES: [string, string][] = [
  ["entry", "Entry Comments"],
  ["management", "Trade Management"],
  ["exit", "Exit Comments"],
];

export function AddPopover({
  title,
  placeholder,
  onAdd,
  withSentiment,
}: {
  title: string;
  placeholder: string;
  onAdd: (label: string, sentiment: string) => Promise<boolean>;
  withSentiment?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [sentiment, setSentiment] = useState("neutral");
  const submit = async () => {
    if (label.trim() && (await onAdd(label.trim(), sentiment))) {
      setLabel("");
      setOpen(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" aria-label={`Add to ${title}`}>
          Add <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <Input
          autoFocus
          aria-label={placeholder}
          placeholder={placeholder}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {withSentiment && (
          <select
            aria-label="Classification"
            className={sel}
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value)}
          >
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        )}
        <Button size="sm" className="w-full" disabled={!label.trim()} onClick={() => void submit()}>
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function PhaseCard({
  phase,
  title,
  rows,
  tab,
  t,
  usage,
  all,
}: {
  phase: string;
  title: string;
  rows: CommentRow[];
  tab: "active" | "disabled";
  t: ReturnType<typeof useJournalTable<"comment_definitions">>;
  usage: Map<string, number>;
  all: CommentRow[];
}) {
  const { rowProps, over } = useDragReorder(
    rows.map((r) => r.id),
    (ids) => t.reorder(ids),
  );
  return (
    <section className={cn(card, "min-w-0 pb-2")}>
      <div className="flex h-[58px] items-center justify-between border-b px-[14px]">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {tab === "active" && (
          <AddPopover
            title={title}
            placeholder="New comment"
            withSentiment
            onAdd={async (label, sentiment) => {
              if (
                all.some((c) => c.phase === phase && c.label.toLowerCase() === label.toLowerCase())
              ) {
                toast.error(`"${label}" already exists in ${title}`);
                return false;
              }
              await t.insert({ phase, label, sentiment, position: all.length });
              return true;
            }}
          />
        )}
      </div>
      {!rows.length && (
        <p className="px-4 py-8 text-center text-[12px] text-t4">
          {tab === "active" ? "No comments added" : "Nothing is disabled."}
        </p>
      )}
      {rows.map((c) => (
        <div
          key={c.id}
          {...(tab === "active" ? rowProps(c.id) : {})}
          className={cn(
            "flex min-h-[41px] items-center gap-1 px-2 text-[13px]",
            over === c.id && "bg-muted",
          )}
        >
          {tab === "active" ? <DragHandle /> : <span className="w-4" />}
          {tab === "active" ? (
            <EditableText
              value={c.label}
              label="Comment"
              onSave={(v) => void t.update(c.id, { label: v })}
            />
          ) : (
            <span className="flex-1 px-2">{c.label}</span>
          )}
          <select
            aria-label={`Classification of ${c.label}`}
            className={cn(
              "h-8 shrink-0 bg-transparent px-1 text-[12px] outline-none",
              sentimentTone(c.sentiment),
            )}
            value={c.sentiment}
            onChange={(e) => t.update(c.id, { sentiment: e.target.value })}
          >
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
          <RowActions
            disabled={tab === "disabled"}
            name={c.label}
            used={usage.get(c.id) ?? 0}
            onDisable={() => {
              void t.update(c.id, { disabled: true });
              toast.success(`"${c.label}" disabled. It stays on your existing trades.`);
            }}
            onRestore={() => void t.update(c.id, { disabled: false })}
            onDelete={() => void t.remove(c.id)}
          />
        </div>
      ))}
    </section>
  );
}

export function Comments() {
  const { journal } = useJournal();
  const t = useJournalTable("comment_definitions", journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const all = t.rows as unknown as CommentRow[];
  return (
    <div>
      <ItemsToggle
        value={tab}
        onChange={setTab}
        disabledCount={all.filter((c) => c.disabled).length}
      />
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {PHASES.map(([phase, title]) => (
          <PhaseCard
            key={phase}
            phase={phase}
            title={title}
            tab={tab}
            t={t}
            usage={usage.comment}
            all={all}
            rows={all.filter((c) => c.phase === phase && (tab === "disabled") === !!c.disabled)}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Sessions -------------------------------- */
