import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Crosshair, ShieldCheck, TrendingUp, Trophy, Wallet } from "lucide-react";
import { useTrades } from "@/lib/journal-context";
import { computeStats } from "@/lib/metrics";

export const Route = createFileRoute("/_authenticated/milestones")({
  head: () => ({ meta: [{ title: "Milestones — AlphaMine" }, { name: "description", content: "Track your trading journal milestones and progress." }, { property: "og:title", content: "Milestones — AlphaMine" }, { property: "og:description", content: "Track your trading journal milestones and progress." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Milestones,
});

function Milestones() {
  const { trades, journal } = useTrades({ unfiltered: true });
  const s = computeStats(trades, journal?.starting_balance ?? 0);
  const milestones = [
    { title: "Journaled Trades", description: "The path to your first true sample size. Journal 50 trades to get meaningful data in AlphaMine.", icon: BookOpen, tone: "var(--chart-5)", current: s.count, goal: 50 },
    { title: "Disciplined Trader", description: "Keep improving your trading discipline by keeping the Tiltmeter green on 100 trades.", icon: ShieldCheck, tone: "var(--chart-3)", current: trades.filter((t) => t.tilt > 0).length, goal: 100 },
    { title: "Optimal Entry", description: "When you are trading, always keep the Sniper milestone in mind. This will help you improve your trade-timing ability.", icon: Crosshair, tone: "var(--loss)", current: trades.filter((t) => t.comments.some((c) => c.phase === "entry" && c.sentiment === "positive")).length, goal: 100 },
    { title: "Perfect Exit", description: "Closing winning trades too early is a big issue for many traders. After 100 perfect exits, you may have overcome this hurdle.", icon: Trophy, tone: "oklch(0.55 0.2 300)", current: trades.filter((t) => t.net_pnl > 0 && t.comments.some((c) => c.phase === "exit" && c.sentiment === "positive")).length, goal: 100 },
    { title: "Great Manager", description: "Closing winners too soon or letting losses run too long are common mistakes. Overcome those issues and make good trade management decisions on your next 50 trades.", icon: TrendingUp, tone: "oklch(0.6 0.1 200)", current: trades.filter((t) => t.comments.some((c) => c.phase === "management" && c.sentiment === "positive")).length, goal: 50 },
    { title: "Account Growth", description: "You're off to a great start. Reach 50 account highs to level up.", icon: Wallet, tone: "var(--chart-5)", current: s.curve.filter((p, i, all) => p.equity > (i ? Math.max(journal?.starting_balance ?? 0, ...all.slice(0, i).map((x) => x.equity)) : journal?.starting_balance ?? 0)).length, goal: 50 },
    { title: "Profitable Days", description: "Build consistency across profitable trading days.", icon: Trophy, tone: "var(--chart-4)", current: s.winDays, goal: 50 },
  ];
  const levels = ["Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"];
  return <div className="max-w-3xl space-y-5">{milestones.map(({ title, description, icon: Icon, tone, current, goal }) => {
    // Seven tiers: each level's goal doubles the base goal (goal, 2x, 4x … 64x). Progress shows the current tier.
    let lvl = 0, prev = 0, next = goal;
    while (lvl < 6 && current >= next) { lvl++; prev = next; next = goal * 2 ** lvl; }
    const pct = lvl === 6 && current >= next ? 100 : Math.min(100, Math.round(((current - prev) / (next - prev)) * 100));
    return <section key={title} className="flex items-center gap-5 rounded-md bg-card p-5 shadow-sm">
      <div className="relative h-16 w-14 shrink-0" style={{ clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", background: "var(--chart-4)" }}>
        <div className="absolute inset-[3px] flex items-center justify-center text-primary-foreground" style={{ clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", background: tone }}><Icon className="h-6 w-6" /></div>
      </div>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p><span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-ink">{levels[lvl]} Level ({lvl + 1}/7)</span></div>
      <div className="w-28 shrink-0 text-right"><span className="text-[10px] font-medium tracking-wide text-muted-foreground">PROGRESS</span><div className="mt-2 flex items-center gap-2"><div className="h-1 flex-1 rounded bg-muted"><div className="h-full rounded bg-profit" style={{ width: `${Math.max(pct, 2)}%` }} /></div><span className="text-[10px] text-muted-foreground">{pct}%</span></div></div>
    </section>;
  })}</div>;
}
