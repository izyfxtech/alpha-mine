import type { LucideIcon } from "lucide-react";
import { BookOpen, Crosshair, ShieldCheck, TrendingUp, Trophy, Wallet } from "lucide-react";
import { SkeletonGhost } from "@/components/ui/skeleton";

export const MILESTONES = [
  {
    title: "Journaled Trades",
    description:
      "The path to your first true sample size. Journal 50 trades to get meaningful data in EdgeWhiz.",
    icon: BookOpen,
    tone: "var(--chart-5)",
    goal: 50,
  },
  {
    title: "Disciplined Trader",
    description:
      "Keep improving your trading discipline by keeping the Tiltmeter green on 100 trades.",
    icon: ShieldCheck,
    tone: "var(--chart-3)",
    goal: 100,
  },
  {
    title: "Optimal Entry",
    description:
      "When you are trading, always keep the Sniper milestone in mind. This will help you improve your trade-timing ability.",
    icon: Crosshair,
    tone: "var(--loss)",
    goal: 100,
  },
  {
    title: "Perfect Exit",
    description:
      "Closing winning trades too early is a big issue for many traders. After 100 perfect exits, you may have overcome this hurdle.",
    icon: Trophy,
    tone: "oklch(0.55 0.2 300)",
    goal: 100,
  },
  {
    title: "Great Manager",
    description:
      "Closing winners too soon or letting losses run too long are common mistakes. Overcome those issues and make good trade management decisions on your next 50 trades.",
    icon: TrendingUp,
    tone: "oklch(0.6 0.1 200)",
    goal: 50,
  },
  {
    title: "Account Growth",
    description: "You're off to a great start. Reach 50 account highs to level up.",
    icon: Wallet,
    tone: "var(--chart-5)",
    goal: 50,
  },
  {
    title: "Profitable Days",
    description: "Build consistency across profitable trading days.",
    icon: Trophy,
    tone: "var(--chart-4)",
    goal: 50,
  },
] as const;
export type Milestone = (typeof MILESTONES)[number];
export type MilestoneTitle = Milestone["title"];

const LEVELS = ["Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"];

/** Seven tiers: each level's goal doubles the base goal (goal, 2x, 4x … 64x). Progress shows the current tier. */
export function milestoneProgress(current: number, goal: number) {
  let lvl = 0,
    prev = 0,
    next = goal;
  while (lvl < 6 && current >= next) {
    lvl++;
    prev = next;
    next = goal * 2 ** lvl;
  }
  const pct =
    lvl === 6 && current >= next
      ? 100
      : Math.min(100, Math.round(((current - prev) / (next - prev)) * 100));
  return { level: lvl, pct };
}

const HEX = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";

/** One milestone. Without `progress` the level and percentage are placeholders and the rest is as it will be. */
export function MilestoneCard({
  milestone: { title, description, icon: Icon, tone },
  progress,
}: {
  milestone: { title: string; description: string; icon: LucideIcon; tone: string };
  progress?: { level: number; pct: number };
}) {
  const levelText = (lvl: number) => `${LEVELS[lvl]} Level (${lvl + 1}/7)`;
  return (
    <section className="flex items-center gap-5 rounded-md bg-card p-5 shadow-sm">
      <div
        className="relative h-16 w-14 shrink-0"
        style={{ clipPath: HEX, background: "var(--chart-4)" }}
      >
        <div
          className="absolute inset-[3px] flex items-center justify-center text-primary-foreground"
          style={{ clipPath: HEX, background: tone }}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
        {progress ? (
          <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink">
            {levelText(progress.level)}
          </span>
        ) : (
          <SkeletonGhost className="mt-3 rounded-full px-3 py-1 text-xs font-medium">
            {levelText(0)}
          </SkeletonGhost>
        )}
      </div>
      <div className="w-28 shrink-0 text-right">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">PROGRESS</span>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 rounded bg-muted">
            {progress && (
              <div
                className="h-full rounded bg-profit"
                style={{ width: `${Math.max(progress.pct, 2)}%` }}
              />
            )}
          </div>
          {progress ? (
            <span className="text-xs text-muted-foreground">{progress.pct}%</span>
          ) : (
            <SkeletonGhost className="text-xs">100%</SkeletonGhost>
          )}
        </div>
      </div>
    </section>
  );
}

/** The milestones page with no progress yet. */
export function MilestonesSkeleton() {
  return (
    <div className="max-w-3xl space-y-5">
      {MILESTONES.map((m) => (
        <MilestoneCard key={m.title} milestone={m} />
      ))}
    </div>
  );
}
