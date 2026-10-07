import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Moon, Sun, PanelLeftClose, PanelLeftOpen, Upload } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Logo } from "@/components/Logo";
import { NAV, childPath, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useTrades, useJournal } from "@/lib/journal-context";
import { computeStats, fmtMoney } from "@/lib/metrics";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { ImportDialog } from "@/components/ImportDialog";
import { useProfile } from "@/lib/profile-settings";

const rowCls = "flex h-[38px] w-full items-center gap-3 rounded-md px-3 text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent";

function Group({ item, collapsed, path }: { item: NavItem; collapsed: boolean; path: string }) {
  const active = item.children!.some((c) => path === childPath(c));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const links = item.children!.map((c) => (
    <Link
      key={c.label}
      to={c.to}
      params={c.params as never}
      className={cn("block whitespace-nowrap rounded-md py-2 pl-[40px] pr-2 text-[11px] text-sidebar-foreground hover:bg-sidebar-accent",
        path === childPath(c) && "bg-sidebar-accent font-semibold text-foreground")}
    >
      {c.label}
    </Link>
  ));
  if (collapsed) {
    return (
      <Popover>
        <PopoverTrigger className={cn(rowCls, "justify-center", active && "bg-sidebar-accent")} title={item.label}>
          <item.icon className="h-[18px] w-[18px]" />
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-60 p-2">
          <p className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
          <div className="max-h-[70vh] overflow-y-auto">{links}</div>
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(rowCls, active && "text-foreground")}>
        <item.icon className="h-[18px] w-[18px]" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>{links}</CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(false);
  const { trades, journal } = useTrades({ unfiltered: true });
  const { journals } = useJournal();
  const { settings } = useProfile();
  const drawer = useTradeDrawer();
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("am.theme", next ? "dark" : "light");
  };
  const balance = journal ? computeStats(trades, journal.starting_balance).balance : 0;

  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-r bg-sidebar transition-[width]", collapsed ? "w-14" : "w-[205px]")}>
      <div className={cn("flex h-16 items-center border-b px-4", collapsed && "justify-center px-0")}>
        <Link to="/home"><Logo collapsed={collapsed} /></Link>
      </div>
      <nav className="flex-1 space-y-[2px] overflow-y-auto p-2">
        {NAV.filter((item) => item.to !== "/portfolio" || journals.length > 1).map((item) =>
          item.children ? (
            <Group key={item.label} item={item} collapsed={collapsed} path={path} />
          ) : (
            <Link key={item.label} to={item.to!} title={item.label}
              className={cn(rowCls, collapsed && "justify-center", path === item.to && "bg-sidebar-accent text-foreground")}>
              <item.icon className="h-[18px] w-[18px]" />
              {!collapsed && item.label}
            </Link>
          ),
        )}
        <button onClick={toggleDark} className={cn(rowCls, collapsed && "justify-center")} title="Dark mode">
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {!collapsed && (dark ? "Use Light Mode" : "Use Dark Mode")}
        </button>
        <button onClick={onToggle} className={cn(rowCls, collapsed && "justify-center")} title="Collapse sidebar">
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && "Collapse Sidebar"}
        </button>
      </nav>
      <div className="space-y-2 p-2">
        {collapsed && settings.showBalance && (
          <div className="rounded-lg bg-background px-1 py-2.5 text-center text-[11px] font-bold tabular" title={fmtMoney(balance, journal?.currency)}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: journal?.currency || "USD", notation: "compact", maximumFractionDigits: 0 }).format(balance)}
          </div>
        )}
        {!collapsed && settings.showBalance && (
          <div className="rounded-lg bg-background px-4 py-3">
            <p className="tabular text-[14px] font-bold">{fmtMoney(balance, journal?.currency)}</p>
            <p className="text-[12px] text-t2">Account Balance</p>
          </div>
        )}
        <div className={cn("overflow-hidden rounded-lg bg-ink text-ink-foreground", collapsed ? "flex flex-col" : "flex")}>
          <button onClick={() => drawer.open()} className="flex-1 py-3 text-[12px] font-semibold hover:opacity-90" title="Add new trade">{collapsed ? "+" : "Add New Trade"}</button>
          <button onClick={() => setImportOpen(true)} className={cn("px-3 py-2.5 hover:opacity-90", collapsed ? "border-t border-ink-foreground/20" : "border-l border-ink-foreground/20")} title="Import trades" aria-label="Import trades">
            <Upload className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </aside>
  );
}
