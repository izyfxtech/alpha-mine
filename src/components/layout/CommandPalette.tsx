import { useEffect, useMemo, useRef, useState } from "react";
import { useWhenChanged } from "@/lib/use-when-changed";
import { localDay } from "@/lib/time/local-time";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, FileText, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CHARTS, NAV, SETTINGS } from "@/lib/nav";
import { useTrades } from "@/lib/journal/journal-context";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { cn } from "@/lib/utils";

type Item = { key: string; label: string; hint: string; icon: typeof Search; run: () => void };

/** "Search or jump" (Ctrl/Cmd+K): jump to any page, add a trade, or open a trade by ID, instrument or setup. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const drawer = useTradeDrawer();
  const { all } = useTrades({ unfiltered: true });
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useWhenChanged(open, (isOpen) => {
    if (isOpen) {
      setQ("");
      setCur(0);
    }
  });

  const items = useMemo<Item[]>(() => {
    const go =
      (to: string, search?: Record<string, string>, params?: Record<string, string>) => () => {
        onOpenChange(false);
        navigate({ to, search, params } as never);
      };
    const pages: Item[] = NAV.map((item) => ({
      key: item.to,
      label: item.label,
      hint: "Page",
      icon: item.icon,
      run: go(item.to, undefined, item.params),
    }));
    const journalPages = [
      ["Open trades", "/open-trades"],
      ["Trading plans", "/plans"],
      ["Missed trades", "/missed-trades"],
      ["Notebook", "/diary/notebook"],
      ["Sessions", "/diary/sessions"],
    ] as const;
    journalPages.forEach(([label, to]) =>
      pages.push({
        key: to,
        label: `Journal · ${label}`,
        hint: "Page",
        icon: NAV[2]!.icon,
        run: go(to),
      }),
    );
    const reportViews = [
      ["Reports overview", "overview"],
      ["Trade breakdown", "breakdown"],
      ["Equity", "equity"],
      ["Calendar", "calendar"],
      ["Chart Lab", "chart-lab"],
    ] as const;
    reportViews.forEach(([label, view]) =>
      pages.push({
        key: `reports/${view}`,
        label: `Reports · ${label}`,
        hint: "Report",
        icon: NAV[3]!.icon,
        run: go("/reports", { view }),
      }),
    );
    CHARTS.forEach(([chart, label]) =>
      pages.push({
        key: `reports/chart-lab/${chart}`,
        label: `Chart Lab · ${label}`,
        hint: "Report",
        icon: NAV[3]!.icon,
        run: go("/reports", { view: "chart-lab", chart }),
      }),
    );
    SETTINGS.forEach(([section, label]) =>
      pages.push({
        key: `settings/${section}`,
        label: `Settings · ${label}`,
        hint: "Setting",
        icon: NAV[4]!.icon,
        run: go("/settings/$section", undefined, { section }),
      }),
    );
    pages.push(
      {
        key: "edge-finder",
        label: "Reports · Edge Finder",
        hint: "Page",
        icon: NAV[3]!.icon,
        run: go("/edge-finder"),
      },
      {
        key: "rules",
        label: "Reports · Rule compliance",
        hint: "Page",
        icon: NAV[3]!.icon,
        run: go("/rules"),
      },
      {
        key: "prop-challenge",
        label: "Reports · Prop challenge",
        hint: "Page",
        icon: NAV[3]!.icon,
        run: go("/prop-challenge"),
      },
      {
        key: "milestones",
        label: "Reports · Milestones",
        hint: "Page",
        icon: FileText,
        run: go("/milestones"),
      },
    );
    const actions: Item[] = [
      {
        key: "add",
        label: "Add trade",
        hint: "Action",
        icon: Plus,
        run: () => {
          onOpenChange(false);
          drawer.open();
        },
      },
    ];
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    const filtered = [...actions, ...pages].filter(
      (i) => !needle || i.label.toLowerCase().includes(needle),
    );
    const trades: Item[] = !needle
      ? []
      : all
          .filter(
            (t) =>
              String(t.trade_no) === needle ||
              t.instrument.toLowerCase().includes(needle) ||
              (t.setup ?? "").toLowerCase().includes(needle),
          )
          .slice(0, 8)
          .map((t) => ({
            key: t.id,
            label: `#${t.trade_no} ${t.instrument} ${t.direction}`,
            hint: `${localDay(t.entry_at)} · ${t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}`,
            icon: Search,
            run: () => {
              onOpenChange(false);
              drawer.open(t);
            },
          }));
    return [...trades, ...filtered.slice(0, 12)];
  }, [q, all, navigate, onOpenChange, drawer]);

  useWhenChanged(q, () => setCur(0));
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cur]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCur((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCur((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[cur]?.run();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search or jump</DialogTitle>
        <DialogDescription className="sr-only">
          Type to jump to a page or find a trade.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="h-4 w-4 text-t4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages, or a trade by ID, instrument or setup…"
            aria-label="Search or jump"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-xs text-t4">Esc</kbd>
        </div>
        <div ref={listRef} role="listbox" className="max-h-[340px] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-t4">Nothing found.</p>
          )}
          {items.map((it, i) => (
            <button
              key={it.key}
              data-i={i}
              role="option"
              aria-selected={i === cur}
              onMouseMove={() => setCur(i)}
              onClick={it.run}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px]",
                i === cur && "bg-muted",
              )}
            >
              <it.icon className="h-4 w-4 shrink-0 text-t3" />
              <span className="flex-1 truncate">{it.label}</span>
              <span className="text-xs text-t4">{it.hint}</span>
              {i === cur && <CornerDownLeft className="h-3.5 w-3.5 text-t4" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
