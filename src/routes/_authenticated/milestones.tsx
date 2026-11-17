import { createFileRoute } from "@tanstack/react-router";
import {
  MILESTONES,
  MilestoneCard,
  milestoneProgress,
  type MilestoneTitle,
} from "@/components/milestones/MilestoneCard";
import { useTrades } from "@/lib/journal/journal-context";
import { computeStats } from "@/lib/pnl/metrics";

export const Route = createFileRoute("/_authenticated/milestones")({
  head: () => ({
    meta: [
      { title: "Milestones — EdgeWhiz" },
      { name: "description", content: "Track your trading journal milestones and progress." },
      { property: "og:title", content: "Milestones — EdgeWhiz" },
      {
        property: "og:description",
        content: "Track your trading journal milestones and progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Milestones,
});

function Milestones() {
  const { trades, journal, flows } = useTrades({ unfiltered: true });
  const start = journal?.starting_balance ?? 0;
  const s = computeStats(trades, start, flows);
  const positive = (phase: string) => (t: (typeof trades)[number]) =>
    t.comments.some((c) => c.phase === phase && c.sentiment === "positive");
  const current: Record<MilestoneTitle, number> = {
    "Journaled Trades": s.count,
    "Disciplined Trader": trades.filter((t) => t.tilt > 0).length,
    "Optimal Entry": trades.filter(positive("entry")).length,
    "Perfect Exit": trades.filter((t) => t.net_pnl > 0 && positive("exit")(t)).length,
    "Great Manager": trades.filter(positive("management")).length,
    "Account Growth": s.curve.filter(
      (p, i, all) =>
        p.equity > (i ? Math.max(start, ...all.slice(0, i).map((x) => x.equity)) : start),
    ).length,
    "Profitable Days": s.winDays,
  };
  return (
    <div className="max-w-3xl space-y-5">
      {MILESTONES.map((m) => (
        <MilestoneCard
          key={m.title}
          milestone={m}
          progress={milestoneProgress(current[m.title], m.goal)}
        />
      ))}
    </div>
  );
}
