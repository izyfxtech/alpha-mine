import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, BookOpen, CheckCircle2, FileDown, PencilLine, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal/journal-context";
import { useProfile } from "@/lib/profile-settings";
import { ImportDialog } from "@/components/journal/ImportDialog";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { CURRENCIES, MARKETS } from "@/components/journal/JournalPicker";
import { cn } from "@/lib/utils";

export const OPEN_ONBOARDING_EVENT = "am:open-onboarding";
const STEPS = ["Welcome", "Your journal", "Your trades", "All set"] as const;
const sel = "h-10 w-full rounded-md border bg-background px-2 text-sm";

/**
 * First-run guide. Shown once to a signed-in user who has not finished it and has no trades yet (so existing users
 * are never interrupted). The finished flag lives in `profiles.settings.onboarded`; "Setup guide" in the account
 * menu opens it again on demand.
 */
export function Onboarding() {
  const { journal } = useJournal();
  const { profile, settings, saveSettings } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const drawer = useTradeDrawer();
  const [forced, setForced] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [f, setF] = useState({ name: "", currency: "USD", amount: "10000", trade_type: "Spot", markets: [] as string[] });
  const [seeded, setSeeded] = useState(false);

  const { data: tradeCount = 0 } = useQuery({
    queryKey: ["onboarding-trade-count", journal?.id],
    enabled: !!journal?.id,
    queryFn: async () => {
      const { count } = await supabase.from("trades").select("id", { count: "exact", head: true }).eq("journal_id", journal!.id);
      return count ?? 0;
    },
  });

  useEffect(() => {
    const open = () => { setForced(true); setDismissed(false); setStep(0); };
    window.addEventListener(OPEN_ONBOARDING_EVENT, open);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, open);
  }, []);

  // Fill the form once the profile and journal are known.
  useEffect(() => {
    if (seeded || !profile || !journal) return;
    setName(profile.display_name);
    setF({ name: journal.name, currency: journal.currency, amount: String(journal.starting_balance), trade_type: journal.trade_type, markets: journal.markets ?? [] });
    setSeeded(true);
  }, [profile, journal, seeded]);

  const due = !!profile && !!journal && !settings.onboarded && tradeCount === 0;
  const open = (due || forced) && !dismissed && !importing;
  if (!journal) return null;

  async function finish(skipped = false) {
    try { await saveSettings({ onboarded: true }); } catch { /* the guide just shows again next time */ }
    setDismissed(true); setForced(false);
    if (!skipped) toast.success("You're set up. Happy journaling!");
  }

  async function saveProfileAndJournal() {
    setBusy(true);
    try {
      if (profile && name.trim() !== profile.display_name) {
        const { error } = await supabase.from("profiles").upsert({ id: profile.id, display_name: name.trim() });
        if (error) throw error;
      }
      const { error } = await supabase.from("journals").update({
        name: f.name.trim() || journal!.name, currency: f.currency, starting_balance: Number(f.amount) || 0, trade_type: f.trade_type, markets: f.markets,
      }).eq("id", journal!.id);
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["journals"] }), qc.invalidateQueries({ queryKey: ["profile"] })]);
      setStep(2);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const go = (to: "/journal" | "/analytics" | "/plans" | "/diary/sessions") => { void finish(true); navigate({ to }); };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) void finish(true); }}>
        <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
          <ol className="mb-1 flex items-center gap-2" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1" aria-current={i === step ? "step" : undefined}>
                <span className={cn("h-1.5 rounded-full", i <= step ? "bg-ink" : "bg-muted")} />
                <span className={cn("text-xs", i === step ? "font-semibold" : "text-muted-foreground")}>{s}</span>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Welcome to AlphaMine</DialogTitle>
                <DialogDescription>Two minutes to set up. You will name your journal, tell us about your account and bring in your first trades.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2"><Label htmlFor="ob-name">What should we call you?</Label><Input id="ob-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" onKeyDown={(e) => e.key === "Enter" && setStep(1)} /></div>
              <div className="flex justify-between gap-2"><Button variant="ghost" onClick={() => finish(true)}>Skip setup</Button><Button onClick={() => setStep(1)}>Get started</Button></div>
            </>
          )}

          {step === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Set up your journal</DialogTitle>
                <DialogDescription>A journal is one trading account. You can add more later and change all of this in settings.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label htmlFor="ob-jname">Journal name</Label><Input id="ob-jname" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="ob-cur">Account currency</Label><select id="ob-cur" className={sel} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="ob-amt">Starting balance</Label><Input id="ob-amt" type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="ob-type">Trade type</Label><select id="ob-type" className={sel} value={f.trade_type} onChange={(e) => setF({ ...f, trade_type: e.target.value })}>{["Spot", "Options", "Futures"].map((c) => <option key={c}>{c}</option>)}</select></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Markets you trade</Label>
                  <div className="flex flex-wrap gap-2">
                    {MARKETS.map((m) => {
                      const on = f.markets.includes(m);
                      return <button key={m} type="button" aria-pressed={on} onClick={() => setF({ ...f, markets: on ? f.markets.filter((x) => x !== m) : [...f.markets, m] })} className={cn("h-9 rounded-full border px-4 text-sm", on ? "border-ink bg-ink text-ink-foreground" : "hover:bg-muted")}>{m}</button>;
                    })}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Importing from MetaTrader? Use the currency shown in the report: a different currency is refused so your numbers stay correct.</p>
              </div>
              <div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setStep(0)}>Back</Button><Button disabled={busy} onClick={saveProfileAndJournal}>Save and continue</Button></div>
            </>
          )}

          {step === 2 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Bring in your trades</DialogTitle>
                <DialogDescription>{tradeCount > 0 ? `You have ${tradeCount} trade${tradeCount === 1 ? "" : "s"} in this journal.` : "Pick whichever is easiest. You can always do the others later."}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Choice icon={<FileDown className="h-5 w-5" />} title="Import a file" body="MetaTrader 4 or 5 report, or a CSV or Excel export from your broker." onClick={() => setImporting(true)} />
                <Choice icon={<PencilLine className="h-5 w-5" />} title="Log a trade by hand" body="Add one trade with its setup, notes and screenshots." onClick={() => { setDismissed(true); drawer.open(); }} />
              </div>
              <div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button variant={tradeCount > 0 ? "default" : "ghost"} onClick={() => setStep(3)}>{tradeCount > 0 ? "Continue" : "I'll do this later"}</Button></div>
            </>
          )}

          {step === 3 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl"><CheckCircle2 className="h-6 w-6 text-profit" />You're all set</DialogTitle>
                <DialogDescription>Here is where to go from here.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice icon={<BookOpen className="h-5 w-5" />} title="Journal" body="Every trade as a table, cards or a screenshot gallery." onClick={() => go("/journal")} />
                <Choice icon={<BarChart3 className="h-5 w-5" />} title="Analytics" body="Win rate, expectancy, drawdown and more." onClick={() => go("/analytics")} />
                <Choice icon={<Sparkles className="h-5 w-5" />} title="Plans" body="Write down your rules and score yourself against them." onClick={() => go("/plans")} />
                <Choice icon={<PencilLine className="h-5 w-5" />} title="Diary" body="Record how each session went and how you felt." onClick={() => go("/diary/sessions")} />
              </div>
              <div className="flex justify-between gap-2"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={() => finish()}>Finish</Button></div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ImportDialog open={importing} onOpenChange={(o) => { setImporting(o); if (!o) void qc.invalidateQueries({ queryKey: ["onboarding-trade-count"] }); }} />
    </>
  );
}

function Choice({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-lg border p-4 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="mt-0.5 rounded-md bg-muted p-2">{icon}</span>
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{body}</span></span>
    </button>
  );
}
