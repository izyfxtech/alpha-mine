import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Brain, CalendarDots, ChartLineUp, FileArrowDown, Flask, MagnifyingGlass, Plus, ShareNetwork } from "@phosphor-icons/react";
import { MkShell, Rv, ThemeToggle, Words, BrandLink } from "@/components/marketing-shell";

const TITLE = "AlphaMine: the trading journal that finds your edge";
const DESC = "Journal trades, measure discipline with the tilt meter, and analyse performance with 16 Chart Lab reports. Imports MetaTrader 5 reports.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE }, { name: "description", content: DESC },
      { property: "og:title", content: TITLE }, { property: "og:description", content: DESC },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }],
  }),
  component: Landing,
});

const nav = [{ href: "#features", label: "Features" }, { href: "#how", label: "How it works" }, { href: "#faq", label: "FAQ" }];

const features = [
  { icon: CalendarDots, t: "Profit calendar", d: "Daily P&L, trade count and tilt score on one calendar, so a bad week is obvious in seconds." },
  { icon: Brain, t: "Tilt meter", d: "Tag entries, management and exits as disciplined or not, then watch the score move by day." },
  { icon: ChartLineUp, t: "Chart Lab", d: "Sixteen reports including drawdown, exit analysis, holding time and SQN by setup." },
  { icon: MagnifyingGlass, t: "Edge Finder", d: "Surfaces the setups, sessions and instruments where your results actually separate from luck." },
  { icon: Flask, t: "Strategy Lab", d: "Test what if exits and run Monte Carlo simulations on your own trade history." },
  { icon: FileArrowDown, t: "MetaTrader 5 import", d: "Drop in an HTML or Excel report and your trades land in the journal with P&L recomputed." },
];

const steps = [
  { n: "01", t: "Bring your trades in", d: "Import a MetaTrader 5 report, upload a spreadsheet, or log a trade by hand with screenshots." },
  { n: "02", t: "Tag your decisions", d: "Mark setup, entry, management and exit quality. Thirty seconds per trade is enough." },
  { n: "03", t: "Read your edge", d: "Open Chart Lab and Edge Finder to see what pays, what leaks, and where discipline slips." },
];

const faqs = [
  { q: "Which platforms can I import from?", a: "MetaTrader 5 report exports in HTML and Excel are supported. You can also import a CSV or Excel file, or add trades by hand with screenshots." },
  { q: "Is my data private?", a: "Every journal belongs to your account and database rules stop other users from reading it. Screenshots sit in a private bucket and open through short lived signed links." },
  { q: "What is the tilt meter?", a: "You tag each entry, management decision and exit. AlphaMine turns those tags into a daily discipline score, so you can see when your process slipped." },
  { q: "Can I keep more than one journal?", a: "Yes. Each journal has its own broker, currency and starting balance, and every report follows the journal you have selected." },
  { q: "Can I show my journal to someone else?", a: "You can create a share link for a journal, handy for a coach or a trading partner." },
  { q: "What does Strategy Lab do?", a: "It replays your history with different exits and runs Monte Carlo simulations, so you can judge an edge by its spread of outcomes, not one lucky run." },
];

function Landing() {
  const [open, setOpen] = useState(false);
  return (
    <MkShell>
      {/* Floating navigation */}
      <header className="fixed inset-x-0 top-3 z-40 mx-auto w-fit max-w-[calc(100%-24px)]">
        <nav aria-label="Primary" className="flex items-center gap-4 rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-nav)] px-3 py-2 backdrop-blur-xl">
          <BrandLink />
          <div className="hidden items-center gap-1 md:flex">
            {nav.map((l) => <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]">{l.label}</a>)}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth" className="mk-btn mk-btn-sec hidden text-sm md:inline-flex">Sign in</Link>
            <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative z-50 h-9 w-9 rounded-lg border border-[var(--mk-line)] md:hidden">
              <span className="absolute left-2.5 top-3.5 h-0.5 w-4 rounded-full bg-[var(--mk-fg)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: open ? "translateY(3px) rotate(45deg)" : "none" }} />
              <span className="absolute left-2.5 top-[21px] h-0.5 w-4 rounded-full bg-[var(--mk-fg)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: open ? "translateY(-4px) rotate(-45deg)" : "none" }} />
            </button>
          </div>
        </nav>
      </header>
      <div className={`fixed inset-0 z-30 bg-[var(--mk-panel)] backdrop-blur-2xl transition-opacity duration-500 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!open}>
        <div className="flex h-full flex-col justify-center gap-6 px-6">
          {[...nav, { href: "/auth", label: "Sign in" }].map((l, i) => (
            <a key={l.href} href={l.href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="text-4xl font-semibold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transitionDelay: open ? `${Math.min(i * 60, 400)}ms` : "0ms", opacity: open ? 1 : 0, transform: open ? "none" : "translateY(24px)" }}>{l.label}</a>
          ))}
        </div>
      </div>

      <main id="main">
        {/* Hero */}
        <section className="mk-wrap pb-16 pt-40 text-center md:pt-48">
          <h1 className="mk-grad mx-auto text-5xl font-semibold md:text-7xl" style={{ maxWidth: 680 }}>Your trades already contain your edge.<br />Mine it.</h1>
          <p className="mx-auto mt-6 text-lg text-[var(--mk-mute)]" style={{ maxWidth: 680 }}>AlphaMine is a trading journal that puts hard numbers on your results and on your discipline. Import from MetaTrader 5, tag your decisions, and see what actually pays.</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
            <p className="text-sm text-[var(--mk-mute)]">Sixteen Chart Lab reports. Private to your account.</p>
          </div>
          <Rv className="mt-16"><ProductMock /></Rv>
        </section>

        {/* Problem to solution */}
        <section className="mk-wrap py-24">
          <Rv>
            <h2 className="mx-auto text-center text-3xl font-semibold md:text-4xl" style={{ maxWidth: 680 }}>A P&L number tells you what happened. It never tells you why.</h2>
          </Rv>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <Rv><div className="mk-card h-full p-6"><p className="text-sm font-semibold text-[var(--mk-mute)]">Without a journal</p><p className="mt-3 text-xl">You remember the big winner and the one you should have skipped. Everything in between blurs, so the same leaks come back every month.</p></div></Rv>
            <Rv delay={100}><div className="mk-card h-full p-6"><p className="text-sm font-semibold text-[var(--mk-acc)]">With AlphaMine</p><p className="mt-3 text-xl">Each trade carries its setup, its discipline tags and its screenshots. Patterns show up in the data before they show up in your balance.</p></div></Rv>
          </div>
        </section>

        {/* Benefits */}
        <section id="features" className="mk-wrap scroll-mt-24 py-24">
          <Rv><h2 className="text-3xl font-semibold md:text-4xl" style={{ maxWidth: 680 }}>Everything you need to review a trade, a week or a whole strategy</h2></Rv>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Rv key={f.t} delay={(i % 3) * 80}>
                <article className="mk-card h-full p-6">
                  <f.icon size={28} className="text-[var(--mk-acc)]" />
                  <h3 className="mt-4 text-xl font-semibold">{f.t}</h3>
                  <p className="mt-2 text-base text-[var(--mk-mute)]">{f.d}</p>
                </article>
              </Rv>
            ))}
          </div>
        </section>

        {/* Tagline reveal */}
        <section className="mk-wrap py-32">
          <p className="mx-auto text-4xl font-semibold md:text-5xl" style={{ maxWidth: 680 }}>
            <Words text="Most traders review their results. Few review their decisions. AlphaMine shows you both, so the next trade starts from evidence instead of memory." />
          </p>
        </section>

        {/* How it works */}
        <section id="how" className="mk-wrap scroll-mt-24 py-24">
          <Rv><h2 className="text-3xl font-semibold md:text-4xl" style={{ maxWidth: 680 }}>From a raw report to a clear read in three steps</h2></Rv>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <Rv key={s.n} delay={i * 100}>
                <li className="mk-card h-full list-none p-6">
                  <span className="font-mono text-sm text-[var(--mk-acc)]">{s.n}</span>
                  <h3 className="mt-3 text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 text-base text-[var(--mk-mute)]">{s.d}</p>
                </li>
              </Rv>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="faq" className="mk-wrap scroll-mt-24 py-24">
          <Rv><h2 className="text-3xl font-semibold md:text-4xl">Questions traders ask first</h2></Rv>
          <div className="mt-12 divide-y divide-[var(--mk-line)] rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)]" style={{ maxWidth: 760 }}>
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="flex items-center justify-between gap-4 text-lg font-semibold">{f.q}<Plus size={20} className="mk-plus shrink-0 text-[var(--mk-mute)]" /></summary>
                <p className="mt-3 text-base text-[var(--mk-mute)]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mk-wrap pb-24 pt-16 text-center">
          <Rv>
            <div className="rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] px-6 py-16">
              <h2 className="mx-auto text-4xl font-semibold md:text-5xl" style={{ maxWidth: 680 }}>Find out what your trades have been telling you</h2>
              <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri mt-8">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
            </div>
          </Rv>
        </section>
      </main>

      <footer className="border-t border-[var(--mk-line)] py-8">
        <div className="mk-wrap flex flex-col items-center justify-between gap-4 text-sm text-[var(--mk-mute)] sm:flex-row">
          <BrandLink />
          <div className="flex items-center gap-6">{nav.map((l) => <a key={l.href} href={l.href} className="transition-colors duration-300 hover:text-[var(--mk-fg)]">{l.label}</a>)}<Link to="/privacy" className="transition-colors duration-300 hover:text-[var(--mk-fg)]">Privacy</Link><Link to="/terms" className="transition-colors duration-300 hover:text-[var(--mk-fg)]">Terms</Link><Link to="/auth" className="transition-colors duration-300 hover:text-[var(--mk-fg)]">Sign in</Link></div>
          <p>© {new Date().getFullYear()} AlphaMine</p>
        </div>
      </footer>
    </MkShell>
  );
}

/** Product preview drawn in code. Figures are illustrative sample data. */
function ProductMock() {
  const kpis = [["Net P&L", "+$4,812.37", true], ["Profit factor", "1.84", false], ["Tilt score", "82", false]] as const;
  return (
    <div className="mx-auto rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] p-2 text-left" style={{ maxWidth: 920 }}>
      <div className="rounded-lg bg-[var(--mk-bg)] p-4 md:p-6">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">Equity curve</p><p className="text-xs text-[var(--mk-mute)]">Sample data</p></div>
        <svg viewBox="0 0 800 220" className="mt-4 h-auto w-full" role="img" aria-label="Sample equity curve rising with two shallow drawdowns">
          {[40, 90, 140, 190].map((y) => <line key={y} x1="0" x2="800" y1={y} y2={y} stroke="var(--mk-line)" strokeWidth="1" />)}
          <path d="M0 190 L70 176 L130 182 L200 148 L260 156 L330 112 L390 124 L460 84 L520 96 L590 58 L650 70 L720 34 L800 26 L800 220 L0 220 Z" fill="var(--mk-acc)" opacity="0.12" />
          <path d="M0 190 L70 176 L130 182 L200 148 L260 156 L330 112 L390 124 L460 84 L520 96 L590 58 L650 70 L720 34 L800 26" fill="none" stroke="var(--mk-acc)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {kpis.map(([k, v, pos]) => (
            <div key={k} className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3">
              <p className="text-xs text-[var(--mk-mute)]">{k}</p>
              <p className={`mt-1 font-mono text-2xl font-semibold ${pos ? "text-[var(--mk-acc)]" : ""}`}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
