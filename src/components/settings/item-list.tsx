import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DragHandle,
  EditableText,
  plural,
  useDragReorder,
  useUsage,
} from "@/components/settings-parts";
import { useJournal, useTrades } from "@/lib/journal/journal-context";
import { STARTER_RULES } from "@/lib/pnl/compliance";
import { useJournalTable } from "@/lib/journal/crud";
import { cn } from "@/lib/utils";
import { ItemsToggle, RowActions } from "@/components/settings/item-controls";
import { card } from "@/components/settings/settings-kit";

type ItemRow = Record<string, string | boolean | number | null> & { id: string; disabled: boolean };

export function ItemList({
  table,
  field,
  label,
  describe,
}: {
  table: "instruments" | "setups" | "trading_rules";
  field: "symbol" | "name";
  label: string;
  describe?: boolean;
}) {
  const { journal } = useJournal();
  const { all: allTrades } = useTrades({ unfiltered: true, includeOpen: true });
  const ruleUse = useMemo(() => {
    const m = new Map<string, number>();
    for (const tr of allTrades)
      for (const c of tr.ruleChecks) m.set(c.rule_id, (m.get(c.rule_id) ?? 0) + 1);
    return m;
  }, [allTrades]);
  const t = useJournalTable(table, journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const [name, setName] = useState("");
  const all = t.rows as unknown as ItemRow[];
  const rows = all.filter((r) => (tab === "disabled") === !!r.disabled);
  const { rowProps, over } = useDragReorder(
    rows.map((r) => r.id),
    (ids) => t.reorder(ids),
  );
  const used = (n: string, id?: string) =>
    table === "trading_rules"
      ? (ruleUse.get(id ?? "") ?? 0)
      : ((table === "instruments" ? usage.inst : usage.setup).get(n) ?? 0);
  const addStarters = async () => {
    for (const r of STARTER_RULES)
      if (!exists(r.name))
        await t.insert({ name: r.name, description: r.description, position: all.length });
  };
  const exists = (n: string, except?: string) =>
    all.some((r) => r.id !== except && String(r[field] ?? "").toLowerCase() === n.toLowerCase());
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (exists(n)) {
      toast.error(
        `${label} "${n}" already exists${all.find((r) => String(r[field]).toLowerCase() === n.toLowerCase())?.disabled ? " (it is under Disabled Items)" : ""}`,
      );
      return;
    }
    await t.insert({ [field]: n, position: all.length });
    setName("");
  };
  const extra = describe ? "description" : null;
  return (
    <div className="max-w-[700px]">
      <ItemsToggle
        value={tab}
        onChange={setTab}
        disabledCount={all.filter((r) => r.disabled).length}
      />
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
            placeholder={`New ${label}`}
            aria-label={`New ${label}`}
            className="h-9 bg-card"
          />
          <Button
            type="submit"
            variant={name.trim() ? "ink" : "secondary"}
            disabled={!name.trim()}
            className="shrink-0"
          >
            Add {label}
          </Button>
        </form>
      )}
      <div className={cn(card, "py-1")}>
        <div className="flex h-[42px] items-center gap-2 px-3 text-[13px] font-semibold">
          <span className="w-4" />
          <span className={describe ? "w-[230px]" : "flex-1"}>Name</span>
          {describe && <span className="flex-1">Description</span>}
        </div>
        {!rows.length && (
          <p className="px-5 py-8 text-center text-[12px] text-t4">
            {tab === "active" ? `No ${label.toLowerCase()}s yet.` : "Nothing is disabled."}
          </p>
        )}
        {rows.map((r) => {
          const n = String(r[field] ?? "");
          return (
            <div
              key={r.id}
              {...(tab === "active" ? rowProps(r.id) : {})}
              className={cn(
                "flex min-h-[37px] items-center gap-2 border-t px-3 text-[13px]",
                over === r.id && "bg-muted",
              )}
            >
              {tab === "active" ? <DragHandle /> : <span className="w-4" />}
              {tab === "active" ? (
                <EditableText
                  value={n}
                  label={label}
                  className={describe ? "!flex-none w-[230px]" : undefined}
                  onSave={(v) => {
                    if (exists(v, r.id)) toast.error(`${label} "${v}" already exists`);
                    else void t.update(r.id, { [field]: v });
                  }}
                />
              ) : (
                <span className={cn("px-2", describe ? "w-[230px]" : "flex-1")}>{n}</span>
              )}
              {extra && (
                <EditableText
                  value={String(r[extra] ?? "")}
                  label="Description"
                  className="text-t3"
                  onSave={(v) => void t.update(r.id, { [extra]: v })}
                />
              )}
              {tab === "disabled" && (
                <span className="flex-1 text-xs text-t4">{plural(used(n, r.id), "trade")}</span>
              )}
              <RowActions
                disabled={tab === "disabled"}
                name={n}
                used={used(n, r.id)}
                onDisable={() => {
                  void t.update(r.id, { disabled: true });
                  toast.success(
                    `"${n}" disabled. It stays on your existing trades; restore it under Disabled Items.`,
                  );
                }}
                onRestore={() => void t.update(r.id, { disabled: false })}
                onDelete={() => void t.remove(r.id)}
              />
            </div>
          );
        })}
      </div>
      {table === "trading_rules" && tab === "active" && !all.length && (
        <Button variant="secondary" className="mt-3" onClick={() => void addStarters()}>
          Add 5 suggested rules
        </Button>
      )}
      {table === "trading_rules" && (
        <p className="mt-2 text-xs text-t4">
          Rate each trade against these rules in the trade drawer. Disabling a rule keeps its
          history on past trades.
        </p>
      )}
      {tab === "active" && describe && (
        <p className="mt-2 text-xs text-t4">
          Double-click a name or description to edit it. Drag the handle to reorder.
        </p>
      )}
    </div>
  );
}

/* ------------------------------ Trade comments ------------------------------ */
