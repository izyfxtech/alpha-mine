import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal/journal-context";
import { useProfile } from "@/lib/profile-settings";
import { cn } from "@/lib/utils";

const TABLES = ["trades", "trading_rules", "planned_trades", "diary_sessions"] as const;

/** Where each step is done, in the order a new trader usually needs it. */
const ITEMS: { table: (typeof TABLES)[number]; title: string; body: string; to: "/journal" | "/rules" | "/plans" | "/diary/sessions" }[] = [
  { table: "trades", title: "Add your first trades", body: "Import a MetaTrader or broker file, or log one by hand.", to: "/journal" },
  { table: "trading_rules", title: "Write your trading rules", body: "Then score each trade against them in Rule Compliance.", to: "/rules" },
  { table: "planned_trades", title: "Plan a trade", body: "Set entry, stop and target before you take it.", to: "/plans" },
  { table: "diary_sessions", title: "Record a session", body: "How the day went and how you felt.", to: "/diary/sessions" },
];

/** Progress is read from real data, so a step ticks itself off when the work is done, not when a button was clicked. */
export function GettingStarted() {
  const { journal } = useJournal();
  const { settings, saveSettings } = useProfile();
  const { data } = useQuery({
    queryKey: ["getting-started", journal?.id],
    enabled: !!journal?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const counts = await Promise.all(TABLES.map(async (t) => {
        const { count, error } = await supabase.from(t).select("id", { count: "exact", head: true }).eq("journal_id", journal!.id);
        if (error) throw error;
        return [t, count ?? 0] as const;
      }));
      return Object.fromEntries(counts) as Record<(typeof TABLES)[number], number>;
    },
  });
  if (!data || settings.hideChecklist) return null;
  const done = ITEMS.filter((i) => data[i.table] > 0).length;
  if (done === ITEMS.length) return null;
  return (
    <section aria-label="Getting started" className="rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Getting started <span className="ml-2 font-normal text-muted-foreground">{done} of {ITEMS.length} done</span></h3>
        <button type="button" aria-label="Hide getting started" className="text-muted-foreground hover:text-foreground" onClick={() => void saveSettings({ hideChecklist: true }).catch(() => undefined)}><X className="h-4 w-4" /></button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ITEMS.map((i) => {
          const ok = data[i.table] > 0;
          return (
            <li key={i.table}>
              <Link to={i.to} className={cn("flex items-start gap-3 rounded-md border p-3 text-left hover:bg-muted/60", ok && "opacity-60")}>
                {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-profit" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span><span className={cn("block text-sm font-medium", ok && "line-through")}>{i.title}</span><span className="block text-xs text-muted-foreground">{i.body}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
