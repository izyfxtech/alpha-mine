import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Trash2 } from "lucide-react";
import {
  DragHandle,
  EditableText,
  plural,
  useDragReorder,
  useUsage,
} from "@/components/settings-parts";
import { useJournal } from "@/lib/journal/journal-context";
import { useJournalTable } from "@/lib/journal/crud";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/ui/confirm";
import { AddPopover } from "@/components/settings/comments";
import { ItemsToggle, RowActions } from "@/components/settings/item-controls";
import { card } from "@/components/settings/settings-kit";

type CatRow = { id: string; name: string; position: number };
type OptRow = { id: string; label: string; category_id: string; disabled: boolean };
const SLOTS = 20;

function StatCard({
  slot,
  cat,
  tab,
  cats,
  options,
  opts,
  usage,
}: {
  slot: number;
  cat?: CatRow;
  tab: "active" | "disabled";
  cats: ReturnType<typeof useJournalTable<"custom_stat_categories">>;
  options: ReturnType<typeof useJournalTable<"custom_stat_options">>;
  opts: OptRow[];
  usage: Map<string, number>;
}) {
  const { confirm } = useDialogs();
  const mine = opts.filter((o) => o.category_id === cat?.id);
  const shown = mine.filter((o) => (tab === "disabled") === !!o.disabled);
  const { rowProps, over } = useDragReorder(
    shown.map((o) => o.id),
    (ids) => options.reorder(ids),
  );
  const title = cat?.name ?? `Custom Comment ${slot}`;
  const remove = async () => {
    if (!cat) return;
    const n = mine.reduce((a, o) => a + (usage.get(o.id) ?? 0), 0);
    if (
      await confirm({
        title: `Delete "${cat.name}" permanently?`,
        message: `All of its tags are deleted too.${n ? ` ${plural(n, "tag assignment")} on your trades will be removed.` : ""} This cannot be undone.`,
        destructive: true,
      })
    )
      void cats.remove(cat.id);
  };
  return (
    <section className={cn(card, "group min-h-[200px] min-w-0 pb-2")}>
      <div className="flex h-[58px] items-center justify-between gap-2 border-b px-[14px]">
        {cat ? (
          <EditableText
            value={cat.name}
            label="Statistic name"
            className="!px-0 text-[13px] font-semibold"
            onSave={(v) => void cats.update(cat.id, { name: v })}
          />
        ) : (
          <h3 className="truncate text-[13px] font-semibold">{title}</h3>
        )}
        {cat && (
          <button
            type="button"
            aria-label={`Delete statistic ${cat.name}`}
            title="Delete this statistic"
            onClick={remove}
            className="rounded p-1 text-t4 opacity-0 hover:bg-muted hover:text-loss focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {tab === "active" && (
          <AddPopover
            title={title}
            placeholder="New tag"
            onAdd={async (label) => {
              if (cat && mine.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
                toast.error(`"${label}" already exists in ${title}`);
                return false;
              }
              let id = cat?.id;
              if (!id) {
                const made = await cats.insert({ name: title, position: slot - 1 });
                id = (made as unknown as CatRow | undefined)?.id;
              }
              if (!id) return false;
              await options.insert({ category_id: id, label, position: mine.length });
              return true;
            }}
          />
        )}
      </div>
      {!shown.length && (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[12px] text-t3">
          <MessageSquare className="h-8 w-8 text-t4" strokeWidth={1.25} />
          {tab === "active" ? "No comments added" : "Nothing is disabled."}
        </div>
      )}
      {shown.map((o) => (
        <div
          key={o.id}
          {...(tab === "active" ? rowProps(o.id) : {})}
          className={cn(
            "flex min-h-[41px] items-center gap-1 px-2 text-[13px]",
            over === o.id && "bg-muted",
          )}
        >
          {tab === "active" ? <DragHandle /> : <span className="w-4" />}
          {tab === "active" ? (
            <EditableText
              value={o.label}
              label="Tag"
              onSave={(v) => void options.update(o.id, { label: v })}
            />
          ) : (
            <span className="flex-1 px-2">{o.label}</span>
          )}
          <RowActions
            disabled={tab === "disabled"}
            name={o.label}
            used={usage.get(o.id) ?? 0}
            onDisable={() => {
              void options.update(o.id, { disabled: true });
              toast.success(`"${o.label}" disabled. It stays on your existing trades.`);
            }}
            onRestore={() => void options.update(o.id, { disabled: false })}
            onDelete={() => void options.remove(o.id)}
          />
        </div>
      ))}
    </section>
  );
}

export function CustomStatistics() {
  const { journal } = useJournal();
  const cats = useJournalTable("custom_stat_categories", journal?.id, "position", true);
  const options = useJournalTable("custom_stat_options", journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const catRows = cats.rows as unknown as CatRow[];
  const opts = options.rows as unknown as OptRow[];
  // 20 fixed slots: used ones in order, then empty "Custom Comment N" placeholders
  const slots = Array.from({ length: SLOTS }, (_, i) => catRows[i]);
  return (
    <div>
      <ItemsToggle
        value={tab}
        onChange={setTab}
        disabledCount={opts.filter((o) => o.disabled).length}
      />
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {slots.map((cat, i) => (
          <StatCard
            key={cat?.id ?? `slot-${i}`}
            slot={i + 1}
            cat={cat}
            tab={tab}
            cats={cats}
            options={options}
            opts={opts}
            usage={usage.option}
          />
        ))}
      </div>
    </div>
  );
}
