import { useMemo, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrades } from "@/lib/journal-context";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop ordering for a list of ids. Dropping on a later row puts the dragged row after it,
 * dropping on an earlier row puts it before, so any row can reach either end.
 */
export function useDragReorder(ids: string[], onReorder: (next: string[]) => void) {
  const from = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const rowProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { from.current = id; e.dataTransfer.effectAllowed = "move"; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (over !== id) setOver(id); },
    onDragEnd: () => { from.current = null; setOver(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const src = from.current; from.current = null; setOver(null);
      if (!src || src === id) return;
      const without = ids.filter((x) => x !== src);
      const target = without.indexOf(id);
      without.splice(ids.indexOf(src) < ids.indexOf(id) ? target + 1 : target, 0, src);
      onReorder(without);
    },
  });
  return { rowProps, over };
}

export const DragHandle = () => <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-t4" aria-hidden />;

/** Text that turns into an input on double-click; Enter or leaving the field saves, Escape cancels. */
export function EditableText({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return <span role="button" tabIndex={0} title="Double-click to rename" aria-label={`${label}: ${value}. Double-click or press Enter to rename`}
      onDoubleClick={() => { setDraft(value); setEditing(true); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "F2") { setDraft(value); setEditing(true); } }}
      className={cn("min-w-0 flex-1 cursor-text truncate rounded px-2 py-1.5 text-sm hover:bg-muted", className)}>{value || <span className="text-t4">Unnamed</span>}</span>;
  }
  const done = (save: boolean) => { setEditing(false); const v = draft.trim(); if (save && v && v !== value) onSave(v); };
  return <Input autoFocus aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => done(true)}
    onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }} className={cn("h-8 flex-1", className)} />;
}

/** How many trades use each instrument, setup, comment and custom-statistic tag (over all trades, unfiltered). */
export function useUsage() {
  const { trades } = useTrades({ unfiltered: true });
  return useMemo(() => {
    const inst = new Map<string, number>(), setup = new Map<string, number>(), comment = new Map<string, number>(), option = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string | null | undefined) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
    trades.forEach((t) => { bump(inst, t.instrument); bump(setup, t.setup); t.comments.forEach((c) => bump(comment, c.id)); t.customStats.forEach((o) => bump(option, o)); });
    return { inst, setup, comment, option };
  }, [trades]);
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Small "12 trades" badge shown next to list entries so you can see what a rename or delete affects. */
export const UsageBadge = ({ n }: { n: number }) => <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[10px] tabular text-t3" title="Trades using this">{plural(n, "trade")}</span>;

/** Asks the user to type a name before an irreversible deletion. */
export function TypedConfirm({ open, onOpenChange, title, description, phrase, confirmLabel, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description: ReactNode; phrase: string; confirmLabel: string; onConfirm: () => void | Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTyped(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild><div className="space-y-3 text-sm text-t3">{description}<p>Type <b className="text-t1">{phrase}</b> to confirm.</p></div></DialogDescription>
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Confirmation text" placeholder={phrase} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={typed.trim() !== phrase || busy} onClick={async () => { setBusy(true); try { await onConfirm(); setTyped(""); onOpenChange(false); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
