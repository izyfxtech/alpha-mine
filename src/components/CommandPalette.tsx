import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, FileText, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NAV, childPath } from "@/lib/nav";
import { useTrades } from "@/lib/journal-context";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { cn } from "@/lib/utils";

type Item = { key: string; label: string; hint: string; icon: typeof Search; run: () => void };

/** "Search or jump" (Ctrl/Cmd+K): jump to any page, add a trade, or open a trade by ID, instrument or setup. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const drawer = useTradeDrawer();
  const { all } = useTrades({ unfiltered: true });
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setQ(""); setCur(0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => { onOpenChange(false); navigate({ to } as never); };
    const pages: Item[] = [];
    NAV.forEach((n) => {
      if (n.to) pages.push({ key: n.to, label: n.label, hint: "Page", icon: n.icon, run: go(n.to) });
      n.children?.forEach((c) => pages.push({ key: `${n.label}/${c.label}`, label: `${n.label} › ${c.label}`, hint: "Page", icon: n.icon, run: () => { onOpenChange(false); navigate({ to: c.to, params: c.params } as never); } }));
    });
    pages.push({ key: "milestones", label: "Milestones", hint: "Page", icon: FileText, run: go("/milestones") });
    const actions: Item[] = [{ key: "add", label: "Add trade", hint: "Action", icon: Plus, run: () => { onOpenChange(false); drawer.open(); } }];
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    const filtered = [...actions, ...pages].filter((i) => !needle || i.label.toLowerCase().includes(needle));
    const trades: Item[] = !needle ? [] : all
      .filter((t) => String(t.trade_no) === needle || t.instrument.toLowerCase().includes(needle) || (t.setup ?? "").toLowerCase().includes(needle))
      .slice(0, 8)
      .map((t) => ({ key: t.id, label: `#${t.trade_no} ${t.instrument} ${t.direction}`, hint: `${t.entry_at.slice(0, 10)} · ${t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}`, icon: Search, run: () => { onOpenChange(false); drawer.open(t); } }));
    return [...trades, ...filtered.slice(0, 12)];
  }, [q, all, navigate, onOpenChange, drawer]);

  useEffect(() => { setCur(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: "nearest" }); }, [cur]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[cur]?.run(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search or jump</DialogTitle>
        <DialogDescription className="sr-only">Type to jump to a page or find a trade.</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-t4" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search pages, or a trade by ID, instrument or setup…" aria-label="Search or jump" className="h-12 flex-1 bg-transparent text-sm outline-none" />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-t4">Esc</kbd>
        </div>
        <div ref={listRef} role="listbox" className="max-h-[340px] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-t4">Nothing found.</p>}
          {items.map((it, i) => (
            <button key={it.key} data-i={i} role="option" aria-selected={i === cur} onMouseMove={() => setCur(i)} onClick={it.run} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px]", i === cur && "bg-muted")}>
              <it.icon className="h-4 w-4 shrink-0 text-t3" />
              <span className="flex-1 truncate">{it.label}</span>
              <span className="text-[11px] text-t4">{it.hint}</span>
              {i === cur && <CornerDownLeft className="h-3.5 w-3.5 text-t4" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
