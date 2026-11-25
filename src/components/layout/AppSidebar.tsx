import { useDarkMode } from "@/lib/use-dark-mode";
import { safeCurrency } from "@/lib/currencies";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Moon, Sun, PanelLeftClose, PanelLeftOpen, Upload } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { NAV, type NavItem } from "@/lib/nav";
import { navSlug } from "@/lib/tour";
import { cn } from "@/lib/utils";
import { useTrades } from "@/lib/journal/journal-context";
import { balanceOf, fmtMoney } from "@/lib/pnl/metrics";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { ImportDialog } from "@/components/journal/ImportDialog";
import { useProfile } from "@/lib/profile-settings";

const rowCls =
  "flex h-[38px] w-full items-center gap-3 rounded-md px-3 text-[12px] font-medium text-sidebar-foreground hover:bg-sidebar-accent";

function isCurrentSection(item: NavItem, path: string) {
  return (item.matches ?? [item.to]).some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [dark, toggleDark] = useDarkMode();
  const { trades, journal, flows } = useTrades({ unfiltered: true });
  const { settings } = useProfile();
  const drawer = useTradeDrawer();
  const [importOpen, setImportOpen] = useState(false);
  // Only the balance is shown here, so skip the full report (curve, drawdown, ratios) and only redo the sum when the data changes.
  const startingBalance = journal?.starting_balance;
  const balance = useMemo(
    () => (startingBalance == null ? 0 : balanceOf(trades, startingBalance, flows)),
    [trades, startingBalance, flows],
  );

  return (
    <aside
      className={cn(
        "sticky top-0 z-20 flex h-dvh min-h-0 shrink-0 flex-col overflow-hidden border-r bg-sidebar transition-[width]",
        collapsed ? "w-14" : "w-52",
      )}
    >
      <div
        className={cn("flex h-16 items-center border-b px-4", collapsed && "justify-center px-0")}
      >
        <Link to="/home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        aria-label="Main navigation"
      >
        {NAV.map((item) => {
          const active = isCurrentSection(item, path);
          return (
            <Link
              key={item.label}
              to={item.to as never}
              params={item.params as never}
              title={item.label}
              data-tour={navSlug(item.label)}
              aria-current={active ? "page" : undefined}
              className={cn(rowCls, collapsed && "justify-center", active && "bg-sidebar-accent")}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {!collapsed && item.label}
            </Link>
          );
        })}
        <button
          onClick={toggleDark}
          className={cn(rowCls, collapsed && "justify-center")}
          title="Dark mode"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {!collapsed && (dark ? "Use Light Mode" : "Use Dark Mode")}
        </button>
        <button
          onClick={onToggle}
          className={cn(rowCls, collapsed && "justify-center")}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
          {!collapsed && "Collapse Sidebar"}
        </button>
      </nav>
      <div className="flex flex-col gap-2 border-t border-sidebar-border p-2">
        {collapsed && settings.showBalance && (
          <div
            className="rounded-lg bg-background px-1 py-2.5 text-center text-xs font-bold tabular"
            title={fmtMoney(balance, journal?.currency)}
          >
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: safeCurrency(journal?.currency),
              notation: "compact",
              maximumFractionDigits: 0,
            }).format(balance)}
          </div>
        )}
        {!collapsed && settings.showBalance && (
          <div className="rounded-lg bg-background px-4 py-3">
            <p className="tabular text-[14px] font-bold">{fmtMoney(balance, journal?.currency)}</p>
            <p className="text-[12px] text-t2">Account Balance</p>
          </div>
        )}
        <div
          data-tour="add-trade"
          className={cn(
            "overflow-hidden rounded-lg bg-ink text-ink-foreground",
            collapsed ? "flex flex-col" : "flex",
          )}
        >
          <button
            onClick={() => drawer.open()}
            className="flex-1 py-3 text-[12px] font-semibold hover:opacity-90"
            title="Add new trade"
          >
            {collapsed ? "+" : "Add New Trade"}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className={cn(
              "px-3 py-2.5 hover:opacity-90",
              collapsed ? "border-t border-ink-foreground/20" : "border-l border-ink-foreground/20",
            )}
            title="Import trades"
            aria-label="Import trades"
          >
            <Upload className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </aside>
  );
}
