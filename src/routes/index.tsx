import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { CalendarDays, LineChart, Brain, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AlphaMine — The trading journal that finds your edge" },
      { name: "description", content: "Journal trades, track discipline with the tilt meter, and analyse performance with 16 Chart Lab reports." },
      { property: "og:title", content: "AlphaMine — The trading journal that finds your edge" },
      { property: "og:description", content: "Journal trades, track discipline with the tilt meter, and analyse performance with 16 Chart Lab reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: CalendarDays, t: "Profit calendar", d: "Daily P&L, trade count and tilt meter at a glance." },
  { icon: LineChart, t: "Chart Lab", d: "Drawdown, exit analysis, holding time, SQN and more." },
  { icon: Brain, t: "Tilt meter", d: "Tag entries, management and exits to measure discipline." },
  { icon: FlaskConical, t: "Strategy Lab", d: "What-if exits and Monte Carlo simulation of your edge." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Logo />
        <Button asChild><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
          Your trades already contain your edge. <span className="text-profit">Mine it.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">AlphaMine is a trading journal built for traders who want hard numbers on their performance and their discipline.</p>
        <Button size="lg" className="mt-8" asChild><Link to="/auth">Start journaling — free</Link></Button>
        <div className="mt-20 grid gap-4 md:grid-cols-4">
          {features.map((f) => (
            <div key={f.t} className="rounded-xl border bg-card p-5">
              <f.icon className="h-5 w-5 text-profit" />
              <h3 className="mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
