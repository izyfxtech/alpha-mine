import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import { Empty, Panel } from "@/components/kit";
import { useEdgeInsights } from "@/lib/use-edge-insights";
import type { EdgeInsight } from "@/lib/edge-finder";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/edge-finder")({
  head: () => ({ meta: [{ title: "Edge Finder — AlphaMine" }, { name: "description", content: "Automatically finds the strong and weak parts of your trading." }] }),
  component: EdgeFinder,
});

const GROUPS: EdgeInsight["group"][] = ["System Edge", "Edge Leak", "Mistake Impact", "Risk", "Outliers"];

function Card({ i }: { i: EdgeInsight }) {
  const Icon = i.kind === "strength" ? ArrowUpRight : i.kind === "weakness" ? ArrowDownRight : Minus;
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", i.kind === "strength" ? "bg-pill-win text-profit" : i.kind === "weakness" ? "bg-pill-loss text-loss" : "bg-chip text-t3")}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{i.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-t3">{i.body}</p>
      </div>
      {i.value && <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular", i.kind === "strength" ? "bg-pill-win text-profit" : i.kind === "weakness" ? "bg-pill-loss text-loss" : "bg-chip")}>{i.value}</span>}
    </div>
  );
}

function EdgeFinder() {
  const insights = useEdgeInsights();
  if (!insights.length) return <Panel title="Edge Finder"><Empty>Edge Finder needs at least 10 trades. Keep journaling, ideally with trade comments, and it will start pointing out the strong and weak parts of your trading.</Empty></Panel>;
  const strengths = insights.filter((i) => i.kind === "strength").length, weaknesses = insights.filter((i) => i.kind === "weakness").length;
  return (
    <div className="mx-auto max-w-[1000px] space-y-[22px]">
      <div className="flex items-center gap-3 rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <Sparkles className="h-6 w-6" />
        <div>
          <h1 className="text-[16px] font-bold">Edge Finder found {insights.length} insight{insights.length === 1 ? "" : "s"} in your journal</h1>
          <p className="text-[12px] text-t3">{strengths} strength{strengths === 1 ? "" : "s"} and {weaknesses} weakness{weaknesses === 1 ? "" : "es"}, based on all trades, ignoring the current filters.</p>
        </div>
      </div>
      {GROUPS.map((g) => {
        const items = insights.filter((i) => i.group === g);
        return items.length ? <Panel key={g} title={g}><div className="space-y-3">{items.map((i) => <Card key={i.id} i={i} />)}</div></Panel> : null;
      })}
    </div>
  );
}
