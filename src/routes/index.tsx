import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, Brain, CalendarDots, ChartLineUp, FileArrowDown, Flask, MagnifyingGlass, Plus, type Icon } from "@phosphor-icons/react";
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

const steps = [
  { t: "Bring your trades in", d: "Import a MetaTrader 5 report, upload a spreadsheet, or log a trade by hand with screenshots." },
  { t: "Tag your decisions", d: "Mark setup, entry, management and exit quality. Thirty seconds per trade is enough." },
  { t: "Read your edge", d: "Open Chart Lab and Edge Finder to see what pays, what leaks, and where discipline slips." },
];

const faqs = [
  { q: "Which platforms can I import from?", a: "MetaTrader 5 report exports in HTML and Excel are supported. You can also import a CSV or Excel file, or add trades by hand with screenshots." },
  { q: "Is my data private?", a: "Every journal belongs to your account and database rules stop other users from reading it. Screenshots sit in a private bucket and open through short lived signed links." },
  { q: "What is the tilt meter?", a: "You tag each entry, management decision and exit. AlphaMine turns those tags into a daily discipline score, so you can see when your process slipped." },
  { q: "Can I keep more than one journal?", a: "Yes. Each journal has its own broker, currency and starting balance, and every report follows the journal you have selected." },
  { q: "Can I show my journal to someone else?", a: "You can create a read only share link for a journal, handy for a coach or a trading partner. Stop sharing whenever you like." },
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
        <section className="mk-wrap pb-24 pt-40 text-center md:pt-48">
          <h1 className="mk-grad mx-auto text-5xl font-semibold md:text-7xl" style={{ maxWidth: 680 }}>Your trades already contain your edge.<br />Mine it.</h1>
          <p className="mx-auto mt-6 text-lg text-[var(--mk-mute)]" style={{ maxWidth: 680 }}>AlphaMine is a trading journal that puts hard numbers on your results and on your discipline. Import from MetaTrader 5, tag your decisions, and see what actually pays.</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
            <p className="text-sm text-[var(--mk-mute)]">Sixteen Chart Lab reports. Private to your account.</p>
          </div>
          <Rv className="mt-16"><Stage><Dashboard /></Stage></Rv>
        </section>

        {/* Statement */}
        <Section>
          <p className="text-4xl font-semibold md:text-5xl" style={{ maxWidth: 820 }}>
            <Words text="Most traders review their results. Few review their decisions. AlphaMine shows you both, so the next trade starts from evidence instead of memory." />
          </p>
        </Section>

        {/* Features, bento */}
        <Section id="features" n="01" label="Features" title="Everything you need to review a trade, a week or a whole strategy">
          <div className="grid gap-4 lg:grid-cols-6">
            <Bento span="lg:col-span-4" icon={CalendarDots} title="Profit calendar" body="Daily P&L, trade count and tilt score on one calendar, so a bad week is obvious in seconds.">
              <div className="mx-auto" style={{ maxWidth: 320 }}><Cal /></div>
            </Bento>
            <Bento span="lg:col-span-2" icon={Brain} title="Tilt meter" body="Tag entries, management and exits as disciplined or not, then watch the score move by day.">
              <div className="space-y-3" aria-hidden>{[["Entries", 84], ["Management", 71], ["Exits", 90]].map(([k, v]) => <Meter key={k} label={String(k)} value={Number(v)} />)}</div>
            </Bento>
            <Bento span="lg:col-span-2" icon={ChartLineUp} title="Chart Lab" body="Sixteen reports including drawdown, exit analysis, holding time and SQN by setup.">
              <div className="flex h-20 items-end gap-2" aria-hidden>{[30, 52, 40, 68, 56, 80, 64, 92].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 7 ? "var(--mk-acc)" : "var(--mk-line)" }} />)}</div>
            </Bento>
            <Bento span="lg:col-span-2" icon={MagnifyingGlass} title="Edge Finder" body="Surfaces the setups, sessions and instruments where your results separate from luck.">
              <div className="space-y-3" aria-hidden>{[["Session", 78], ["Setup", 55], ["Instrument", 34]].map(([k, v]) => <Meter key={k} label={String(k)} value={Number(v)} />)}</div>
            </Bento>
            <Bento span="lg:col-span-2" icon={Flask} title="Strategy Lab" body="Test what if exits and run Monte Carlo simulations on your own trade history.">
              <svg viewBox="0 0 200 80" className="h-20 w-full" aria-hidden fill="none" strokeWidth="2" strokeLinecap="round">
                {[["M0 60 L50 52 L100 40 L150 28 L200 8", 1], ["M0 60 L50 56 L100 50 L150 46 L200 40", 0.5], ["M0 60 L50 58 L100 56 L150 62 L200 58", 0.35], ["M0 60 L50 64 L100 62 L150 70 L200 74", 0.35]].map(([d, o], i) => <path key={i} d={String(d)} stroke="var(--mk-acc)" opacity={Number(o)} />)}
              </svg>
            </Bento>
            <Bento span="lg:col-span-6" icon={FileArrowDown} title="MetaTrader 5 import" body="Drop in an HTML or Excel report and your trades land in the journal with P&L recomputed.">
              <div className="flex flex-wrap gap-2">{["HTML report", "Excel report", "CSV file", "Manual entry"].map((c) => <span key={c} className="rounded-full border border-[var(--mk-line)] px-3 py-1 text-sm text-[var(--mk-mute)]">{c}</span>)}</div>
            </Bento>
          </div>
          <p className="mt-4 text-sm text-[var(--mk-mute)]">Visuals use sample data.</p>
        </Section>

        {/* How it works, connected steps */}
        <Section id="how" n="02" label="How it works" title="From a raw report to a clear read in three steps">
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-[var(--mk-line)] md:block" aria-hidden />
            {steps.map((s, i) => (
              <Rv key={s.t} delay={i * 100}>
                <li className="relative list-none">
                  <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-[var(--mk-line)] bg-[var(--mk-bg)] font-mono text-sm text-[var(--mk-acc)]">{i + 1}</span>
                  <h3 className="mt-5 text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 text-base text-[var(--mk-mute)]">{s.d}</p>
                </li>
              </Rv>
            ))}
          </ol>
        </Section>

        {/* FAQ, two columns */}
        <Section id="faq" n="03" label="FAQ" title="Questions traders ask first" split>
          <div className="divide-y divide-[var(--mk-line)] border-y border-[var(--mk-line)]">
            {faqs.map((f) => (
              <details key={f.q} className="py-5">
                <summary className="flex items-center justify-between gap-4 text-lg font-semibold">{f.q}<Plus size={20} className="mk-plus shrink-0 text-[var(--mk-mute)]" /></summary>
                <p className="mt-3 text-base text-[var(--mk-mute)]">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="mk-wrap pb-24 pt-8">
          <Rv>
            <div className="mk-stage rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] px-6 py-20 text-center">
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

/** One section template: ruled top edge, numbered eyebrow, left aligned title. `split` puts the title beside the content. */
function Section({ id, n, label, title, split, children }: { id?: string; n?: string; label?: string; title?: string; split?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="mk-wrap scroll-mt-24">
      <div className="border-t border-[var(--mk-line)] py-24">
        {title ? (
          <div className={split ? "grid gap-12 lg:grid-cols-[1fr_1.5fr]" : ""}>
            <Rv className={split ? "" : "mb-12"}>
              <p className="font-mono text-sm text-[var(--mk-acc)]">{n} {label}</p>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl" style={{ maxWidth: 560 }}>{title}</h2>
            </Rv>
            {children}
          </div>
        ) : children}
      </div>
    </section>
  );
}

function Bento({ span, icon: I, title, body, children }: { span: string; icon: Icon; title: string; body: string; children: ReactNode }) {
  return (
    <Rv className={span}>
      <article className="mk-card flex h-full flex-col gap-6 p-6">
        <div><I size={28} className="text-[var(--mk-acc)]" /><h3 className="mt-4 text-xl font-semibold">{title}</h3><p className="mt-2 text-base text-[var(--mk-mute)]">{body}</p></div>
        <div className="mt-auto">{children}</div>
      </article>
    </Rv>
  );
}

const Meter = ({ label, value }: { label: string; value: number }) => (
  <div><div className="flex justify-between text-xs text-[var(--mk-mute)]"><span>{label}</span><span className="font-mono">{value}</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-[var(--mk-line)]"><div className="h-full rounded-full bg-[var(--mk-acc)]" style={{ width: `${value}%` }} /></div></div>
);

const CAL = [0, 1, 1, 2, -1, 0, 0, 1, 2, 1, -1, 1, 0, 0, 2, 1, -1, 1, 1, 0, 0, 1, 1, 2, 0, 1, 0, 0, -1, 1, 2, 1, 1, 0, 0];
const calBg = (v: number) => v === 2 ? "var(--mk-acc)" : v === 1 ? "color-mix(in srgb, var(--mk-acc) 45%, transparent)" : v === -1 ? "color-mix(in srgb, #ef4444 60%, transparent)" : "var(--mk-s2)";
const Cal = () => <div className="grid grid-cols-7 gap-1" aria-hidden>{CAL.map((v, i) => <div key={i} className="aspect-square" style={{ background: calBg(v), borderRadius: 4 }} />)}</div>;

const Stage = ({ children }: { children: ReactNode }) => (
  <div className="mk-stage mx-auto rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3 md:p-8" style={{ maxWidth: 1040 }}>{children}</div>
);

/** Hero product preview. The same calendar, meters and curve reappear in the feature cards below. */
function Dashboard() {
  const kpis = [["Net P&L", "+$4,812.37", true], ["Profit factor", "1.84", false], ["Tilt score", "82", false]] as const;
  return (
    <div role="img" aria-label="Sample AlphaMine dashboard with KPIs, an equity curve and a profit calendar" className="rounded-xl border border-[var(--mk-line)] bg-[var(--mk-bg)] text-left">
      <div className="flex items-center justify-between border-b border-[var(--mk-line)] px-4 py-3 text-sm">
        <div className="flex gap-4 font-semibold">{["Home", "Journal", "Chart Lab"].map((t, i) => <span key={t} className={i === 0 ? "" : "text-[var(--mk-mute)]"}>{t}</span>)}</div>
        <span className="text-xs text-[var(--mk-mute)]">Sample data</span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <div className="grid gap-3">{kpis.map(([k, v, pos]) => (
          <div key={k} className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3"><p className="text-xs text-[var(--mk-mute)]">{k}</p><p className={`mt-1 font-mono text-2xl font-semibold ${pos ? "text-[var(--mk-acc)]" : ""}`}>{v}</p></div>
        ))}</div>
        <div className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3 md:col-span-2">
          <p className="text-xs text-[var(--mk-mute)]">Equity curve</p>
          <svg viewBox="0 0 400 200" className="mt-2 h-auto w-full" aria-hidden>
            {[40, 90, 140, 190].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="var(--mk-line)" />)}
            <path d="M0 180 L35 170 L65 175 L100 148 L130 154 L165 118 L195 126 L230 92 L260 100 L295 66 L325 76 L360 40 L400 30 L400 200 L0 200 Z" fill="var(--mk-acc)" opacity="0.12" />
            <path d="M0 180 L35 170 L65 175 L100 148 L130 154 L165 118 L195 126 L230 92 L260 100 L295 66 L325 76 L360 40 L400 30" fill="none" stroke="var(--mk-acc)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
        <div className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3"><p className="mb-2 text-xs text-[var(--mk-mute)]">October</p><Cal /></div>
      </div>
    </div>
  );
}
