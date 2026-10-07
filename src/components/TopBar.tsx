import { useEffect, useMemo, useState } from "react";
import { computeInsights } from "@/lib/insights";
import { ShareJournalDialog } from "@/components/ShareJournal";
import { CommandPalette } from "@/components/CommandPalette";
import { useProfile } from "@/lib/profile-settings";
import { JournalPicker } from "@/components/JournalPicker";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Award, Bell, BookOpen, FileText, HelpCircle, LogOut, Search, Settings, Share2, UserCircle2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTrades } from "@/lib/journal-context";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { FilterPanel, FilterToggle, type FilterMode } from "@/components/FilterBar";

export function TopBar() {
  const navigate = useNavigate();
  const onPortfolio = useRouterState({ select: (st) => st.location.pathname === "/portfolio" });
  const qc = useQueryClient();
  const { all } = useTrades({ unfiltered: true });
  const drawer = useTradeDrawer();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const allowSharing = useProfile().settings.allowSharing;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [read, setRead] = useState<string[]>([]);
  useEffect(() => { try { setRead(JSON.parse(localStorage.getItem("am-read-insights") ?? "[]")); } catch { /* ignore */ } }, []);
  const markRead = (ids: string[]) => setRead((v) => { const n = [...new Set([...v, ...ids])]; localStorage.setItem("am-read-insights", JSON.stringify(n)); return n; });
  const recent = useMemo(() => computeInsights(all), [all]);
  const unread = recent.filter((t) => !read.includes(t.id)).length;

  const [fmode, setFmode] = useState<FilterMode>("closed");
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="z-20 shrink-0">
    <header className="flex h-[63px] items-center gap-3 bg-card px-[21px] shadow-[0_1px_4px_rgba(60,40,90,0.06)]">
      {!onPortfolio && <FilterToggle mode={fmode} setMode={setFmode} />}
      {!onPortfolio && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Filter settings" title="Journal settings" onClick={() => navigate({ to: "/settings/$section", params: { section: "journal" } })}><Settings className="h-4 w-4" /></Button>}
      <div className="flex-1" />
      <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search or jump" className="hidden h-9 w-[230px] items-center gap-2 rounded-md border border-line2 bg-card px-3 text-left text-[12px] text-t2 hover:bg-muted md:flex">
        <Search className="h-4 w-4" /><span className="flex-1">Search or jump</span><kbd className="text-[10px] text-t4">{isMac ? "⌘K" : "Ctrl+K"}</kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShareJournalDialog open={shareOpen} onOpenChange={setShareOpen} />
      <JournalPicker />
      <Sheet>
        <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[9px] font-semibold text-primary-foreground tabular">{unread > 99 ? "99+" : unread}</span>}</Button></SheetTrigger>
        <SheetContent side="right" className="flex w-[380px] flex-col gap-0 p-0 sm:max-w-[380px]">
          <SheetHeader className="flex-row items-center justify-between space-y-0 border-b p-4 pr-12"><SheetTitle>Notifications</SheetTitle><Button variant="ghost" size="sm" disabled={!unread} onClick={() => markRead(recent.map((t) => t.id))}>Mark all read</Button></SheetHeader>
          <div className="flex-1 overflow-y-auto text-sm">
          {recent.length ? recent.map((n) => <button key={n.id} className="w-full border-b px-4 py-3 text-left hover:bg-muted/50" onClick={() => { markRead([n.id]); const t = all.find((x) => x.id === n.tradeId); if (t) drawer.open(t); }}>
            <span className="flex justify-between gap-2 text-xs font-semibold"><span>{n.title}</span>{!read.includes(n.id) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-profit" />}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{n.body}</span>
            <span className="mt-1 flex justify-between text-[10px] uppercase text-muted-foreground"><span>Journal</span><span>{n.at.slice(0, 16).replace("T", " ")}</span></span>
          </button>) : <p className="p-4 text-muted-foreground">You're all caught up. Insights appear here as you log trades.</p>}
          </div>
        </SheetContent>
      </Sheet>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Account menu"><UserCircle2 className="h-5 w-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate({ to: "/milestones" })}><Award className="h-4 w-4" />Milestones</DropdownMenuItem>
          {allowSharing && <DropdownMenuItem onSelect={() => setShareOpen(true)}><Share2 className="h-4 w-4" />Share journal</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => navigate({ to: "/settings/$section", params: { section: "account" } })}><Settings className="h-4 w-4" />Account settings</DropdownMenuItem>
          <DropdownMenuItem asChild><a href="https://edgewonk.com/course" target="_blank" rel="noopener noreferrer"><BookOpen className="h-4 w-4" />Journaling course</a></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="https://edgewonk.com/changelog" target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" />Changelog</a></DropdownMenuItem>
          <DropdownMenuItem asChild><a href="https://edgewonk.com/help" target="_blank" rel="noopener noreferrer"><HelpCircle className="h-4 w-4" />Help & FAQ</a></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4" />Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <FilterPanel mode={onPortfolio ? "closed" : fmode} />
    </div>
  );
}
