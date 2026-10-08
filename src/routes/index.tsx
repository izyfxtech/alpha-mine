import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ArrowRight, ArrowUpRight, Brain, CalendarDays, Check, FlaskConical, LineChart, MoveUpRight, ShieldCheck, Sparkles } from "lucide-react";

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
    <div className="min-h-screen overflow-hidden bg-background">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Primary navigation">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#method" className="transition-colors hover:text-foreground">Our approach</a>
          <Link to="/auth" className="font-semibold text-foreground">Sign in <ArrowUpRight className="ml-1 inline size-4" /></Link>
        </nav>
        <Button size="sm" className="md:hidden" asChild><Link to="/auth">Get started</Link></Button>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:pb-32 lg:pt-20">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-profit/20 bg-profit-soft px-3 py-1.5 text-xs font-semibold text-profit"><Sparkles className="size-3.5" /> Built for deliberate traders</div>
            <h1 className="max-w-3xl text-5xl font-bold leading-[.98] tracking-[-0.06em] text-foreground sm:text-6xl lg:text-[5.7rem]">Turn your trades into <span className="text-profit">better decisions.</span></h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">AlphaMine helps you see the patterns hidden in your journal — so you can trade your process, not your emotions.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4"><Button size="lg" className="rounded-full px-6" asChild><Link to="/auth">Start journaling free <ArrowRight data-icon="inline-end" /></Link></Button><span className="text-xs text-muted-foreground">No credit card required</span></div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-2"><Check className="size-4 text-profit" /> Private by default</span><span className="flex items-center gap-2"><Check className="size-4 text-profit" /> Built for consistency</span></div>
          </div>
          <div className="relative min-h-[400px] lg:min-h-[500px]">
            <div className="absolute inset-4 rounded-[2rem] bg-ink shadow-2xl shadow-ink/20" />
            <div className="relative ml-auto max-w-md rotate-[2deg] rounded-2xl border border-white/10 bg-[#171a1a] p-5 text-white shadow-2xl lg:mt-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs text-white/50">Performance overview</p><p className="mt-1 text-2xl font-semibold tracking-tight">+18.42%</p></div><div className="rounded-full bg-profit/15 px-2.5 py-1 text-xs text-profit">This month</div></div>
              <div className="mt-8 flex h-44 items-end gap-2 border-b border-white/10 bg-[linear-gradient(to_bottom,transparent_49%,rgba(255,255,255,.08)_50%,transparent_51%)] px-2"><div className="h-[36%] flex-1 rounded-t bg-white/10" /><div className="h-[48%] flex-1 rounded-t bg-white/15" /><div className="h-[42%] flex-1 rounded-t bg-white/10" /><div className="h-[65%] flex-1 rounded-t bg-profit/70" /><div className="h-[58%] flex-1 rounded-t bg-profit/80" /><div className="h-[82%] flex-1 rounded-t bg-profit" /><div className="h-[76%] flex-1 rounded-t bg-profit" /><div className="h-[94%] flex-1 rounded-t bg-profit" /></div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-xs"><div><p className="text-white/45">Win rate</p><p className="mt-1 text-sm font-semibold">64.8%</p></div><div><p className="text-white/45">Profit factor</p><p className="mt-1 text-sm font-semibold">2.14</p></div><div><p className="text-white/45">Tilt score</p><p className="mt-1 text-sm font-semibold text-profit">Low</p></div></div>
            </div>
            <div className="absolute -bottom-2 -left-2 hidden rounded-xl border bg-card p-4 shadow-xl sm:block lg:-left-8"><div className="flex items-center gap-3"><div className="rounded-lg bg-profit-soft p-2 text-profit"><ShieldCheck className="size-5" /></div><div><p className="text-[10px] text-muted-foreground">Process score</p><p className="font-semibold">8.7 / 10</p></div></div></div>
          </div>
        </section>

        <section id="features" className="border-y bg-card/60 px-6 py-20 lg:px-10"><div className="mx-auto max-w-7xl"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-profit">One clear view</p><h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Less noise. More signal.</h2><p className="mt-4 leading-7 text-muted-foreground">Everything you need to understand what is working, what is not, and why.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2 lg:grid-cols-4">{features.map((f) => (<div key={f.t} className="bg-card p-7 transition-colors hover:bg-muted"><f.icon className="size-5 text-profit" /><h3 className="mt-12 font-semibold">{f.t}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{f.d}</p></div>))}</div></div></section>
        <section id="method" className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-20 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-profit">The AlphaMine method</p><h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Make your journal a feedback loop.</h2></div><Button variant="outline" className="w-fit rounded-full" asChild><Link to="/auth">See your edge <MoveUpRight data-icon="inline-end" /></Link></Button></section>
      </main>
      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground lg:px-10">© AlphaMine · A calmer way to trade.</footer>
    </div>
  );
}
