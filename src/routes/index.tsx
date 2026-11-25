import { createFileRoute, Link } from "@tanstack/react-router";
import { CHARTS, NAV } from "@/lib/nav";
import { type ReactNode } from "react";
import {
  ArrowRight,
  Brain,
  CalendarDots,
  ChartLineUp,
  FileArrowDown,
  Flask,
  MagnifyingGlass,
  Plus,
  type Icon,
} from "@phosphor-icons/react";
import { Rv } from "@/components/marketing/marketing-shell";
import { Section, SiteLayout } from "@/components/marketing/site";
import { Cal, Meter } from "@/components/analytics/visuals";
import { PerformanceRadar, type PerformanceMetric } from "@/components/home/PerformanceRadar";

const TITLE = "EdgeWhiz: the trading journal that finds your edge";
const DESC = `Journal trades, measure discipline with the tilt meter, and analyse performance with ${CHARTS.length} Chart Lab reports. Imports MetaTrader 5 reports.`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    t: "Bring your trades in",
    d: "Import a MetaTrader 5 report, upload a spreadsheet, or log a trade by hand with screenshots.",
  },
  {
    t: "Tag your decisions",
    d: "Mark setup, entry, management and exit quality. Thirty seconds per trade is enough.",
  },
  {
    t: "Read your edge",
    d: "Open Chart Lab and Edge Finder to see what pays, what leaks, and where discipline slips.",
  },
];

const faqs = [
  {
    q: "Which platforms can I import from?",
    a: "MetaTrader 5 report exports (HTML and Excel) and MetaTrader 4 statements are supported. You can also import a CSV or Excel file, or add trades by hand with screenshots.",
  },
  {
    q: "Is my data private?",
    a: "Every journal belongs to your account and database rules stop other users from reading it. Screenshots sit in a private bucket and open through short lived signed links.",
  },
  {
    q: "What is the tilt meter?",
    a: "You tag each entry, management decision and exit. EdgeWhiz turns those tags into a daily discipline score, so you can see when your process slipped.",
  },
  {
    q: "Can I keep more than one journal?",
    a: "Yes. Each journal has its own broker, currency and starting balance, and every report follows the journal you have selected.",
  },
  {
    q: "Can I show my journal to someone else?",
    a: "You can create a read only share link for a journal, handy for a coach or a trading partner. Stop sharing whenever you like.",
  },
  {
    q: "What does Strategy Lab do?",
    a: "It replays your history with different exits and runs Monte Carlo simulations, so you can judge an edge by its spread of outcomes, not one lucky run.",
  },
];

function Landing() {
  return (
    <SiteLayout>
      <main>
        <section className="mk-wrap pb-14 pt-12 md:pt-16">
          <div className="grid items-center gap-10 xl:grid-cols-[0.78fr_1.22fr] xl:gap-12">
            <div className="max-w-[500px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mk-acc)]">
                Trading journal · execution review
              </p>
              <h1 className="mk-grad mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] md:text-5xl">
                Review the trade, not just the result.
              </h1>
              <p className="mt-5 max-w-[470px] text-base leading-relaxed text-[var(--mk-mute)] md:text-lg">
                Keep your fills, setup, screenshots and notes together. Compare results by account,
                market and session to see what to repeat and what to change.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">
                  Start a journal <ArrowRight size={18} weight="bold" />
                </Link>
                <Link to="/features" className="mk-btn mk-btn-sec">
                  Explore features
                </Link>
              </div>
              <p className="mt-4 text-xs text-[var(--mk-mute)]">
                MetaTrader 4/5 · CSV · Excel · manual entry
              </p>
            </div>
            <Rv className="min-w-0">
              <Stage>
                <Dashboard />
              </Stage>
            </Rv>
          </div>
        </section>

        {/* Statement */}
        <Section>
          <p
            className="mx-auto text-center text-3xl font-medium leading-snug md:text-4xl"
            style={{ maxWidth: 820 }}
          >
            Net P&amp;L says what happened. Your setup, session and execution notes help explain why
            and what to change next.
          </p>
        </Section>

        {/* Features, bento */}
        <Section
          id="features"
          label="Features"
          title="Tools that use the same trade record, from review to risk analysis"
        >
          <div className="grid gap-4 lg:grid-cols-6">
            <Bento
              span="lg:col-span-4"
              icon={CalendarDots}
              title="Profit calendar"
              body="Daily P&L, trade count and tilt score on one calendar, so a bad week is obvious in seconds."
            >
              <div className="mx-auto" style={{ maxWidth: 320 }}>
                <Cal />
              </div>
            </Bento>
            <Bento
              span="lg:col-span-2"
              icon={Brain}
              title="Tilt meter"
              body="Tag entries, management and exits as disciplined or not, then watch the score move by day."
            >
              <div className="space-y-3" aria-hidden>
                {[
                  ["Entries", 84],
                  ["Management", 71],
                  ["Exits", 90],
                ].map(([k, v]) => (
                  <Meter key={k} label={String(k)} value={Number(v)} />
                ))}
              </div>
            </Bento>
            <Bento
              span="lg:col-span-2"
              icon={ChartLineUp}
              title="Chart Lab"
              body="Seventeen reports including drawdown, exit analysis, holding time and SQN by setup."
            >
              <div className="flex h-20 items-end gap-2" aria-hidden>
                {[30, 52, 40, 68, 56, 80, 64, 92].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${h}%`,
                      background: i === 7 ? "var(--mk-acc)" : "var(--mk-line)",
                    }}
                  />
                ))}
              </div>
            </Bento>
            <Bento
              span="lg:col-span-2"
              icon={MagnifyingGlass}
              title="Edge Finder"
              body="Surfaces the setups, sessions and instruments where your results separate from luck."
            >
              <div className="space-y-3" aria-hidden>
                {[
                  ["Session", 78],
                  ["Setup", 55],
                  ["Instrument", 34],
                ].map(([k, v]) => (
                  <Meter key={k} label={String(k)} value={Number(v)} />
                ))}
              </div>
            </Bento>
            <Bento
              span="lg:col-span-2"
              icon={Flask}
              title="Strategy Lab"
              body="Test what if exits and run Monte Carlo simulations from your win rate and average win and loss."
            >
              <svg
                viewBox="0 0 200 80"
                preserveAspectRatio="none"
                className="h-20 w-full"
                aria-hidden
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
              >
                {[
                  ["M0 60 L50 52 L100 40 L150 28 L200 8", 1],
                  ["M0 60 L50 56 L100 50 L150 46 L200 40", 0.5],
                  ["M0 60 L50 58 L100 56 L150 62 L200 58", 0.35],
                  ["M0 60 L50 64 L100 62 L150 70 L200 74", 0.35],
                ].map(([d, o], i) => (
                  <path
                    key={i}
                    d={String(d)}
                    stroke="var(--mk-acc)"
                    vectorEffect="non-scaling-stroke"
                    opacity={Number(o)}
                  />
                ))}
              </svg>
            </Bento>
            <Bento
              span="lg:col-span-6"
              icon={FileArrowDown}
              title="MetaTrader 5 import"
              body="Drop in an HTML or Excel report and your trades land in the journal with the broker's P&L kept and independently checked."
            >
              <div className="flex flex-wrap gap-2">
                {["HTML report", "Excel report", "CSV file", "Manual entry"].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-[var(--mk-line)] px-3 py-1 text-sm text-[var(--mk-mute)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Bento>
          </div>
          <p className="mt-4 text-sm text-[var(--mk-mute)]">Visuals use sample data.</p>
        </Section>

        {/* How it works, connected steps */}
        <Section
          id="how"
          label="How it works"
          title="From a raw report to a clear read in three steps"
        >
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            <div
              className="absolute left-0 right-0 top-5 hidden h-px bg-[var(--mk-line)] md:block"
              aria-hidden
            />
            {steps.map((s, i) => (
              <Rv key={s.t} delay={i * 100}>
                <li className="relative list-none">
                  <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-[var(--mk-line)] bg-[var(--mk-bg)] font-mono text-sm text-[var(--mk-acc)]">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 text-base text-[var(--mk-mute)]">{s.d}</p>
                </li>
              </Rv>
            ))}
          </ol>
        </Section>

        {/* FAQ, two columns */}
        <Section id="faq" label="FAQ" title="Questions traders ask first" split>
          <div className="divide-y divide-[var(--mk-line)] border-y border-[var(--mk-line)]">
            {faqs.map((f) => (
              <details key={f.q} className="py-5">
                <summary className="flex items-center justify-between gap-4 text-lg font-semibold">
                  {f.q}
                  <Plus size={20} className="mk-plus shrink-0 text-[var(--mk-mute)]" />
                </summary>
                <p className="mt-3 text-base text-[var(--mk-mute)]">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="mk-wrap pb-24 pt-8">
          <Rv>
            <div className="rounded-2xl bg-[var(--mk-s1)] px-6 py-20 text-center">
              <h2 className="mx-auto text-3xl font-semibold md:text-4xl" style={{ maxWidth: 680 }}>
                Find out what your trades have been telling you
              </h2>
              <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri mt-8">
                Start journaling free <ArrowRight size={18} weight="bold" />
              </Link>
            </div>
          </Rv>
        </section>
      </main>
    </SiteLayout>
  );
}

function Bento({
  span,
  icon: I,
  title,
  body,
  children,
}: {
  span: string;
  icon: Icon;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <Rv className={span}>
      <article className="mk-card flex h-full flex-col gap-6 p-6">
        <div>
          <I size={28} className="text-[var(--mk-acc)]" />
          <h3 className="mt-4 text-xl font-semibold">{title}</h3>
          <p className="mt-2 text-base text-[var(--mk-mute)]">{body}</p>
        </div>
        <div className="mt-auto">{children}</div>
      </article>
    </Rv>
  );
}

const Stage = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto" style={{ maxWidth: 1280 }}>
    {children}
  </div>
);

/** Static preview of the signed-in dashboard: account context, risk profile, equity and review workflow. */
function Dashboard() {
  const radar: PerformanceMetric[] = [
    { metric: "Win rate", value: 55 },
    { metric: "Profit factor", value: 38 },
    { metric: "Payoff", value: 42 },
    { metric: "Recovery", value: 46 },
    { metric: "Drawdown", value: 73 },
    { metric: "Consistency", value: 62 },
  ];
  const kpis = [
    ["Net P&L", "+$488.45", true],
    ["Trade expectancy", "$15.76", false],
    ["Profit factor", "1.14", false],
    ["Trade win %", "54.84%", false],
    ["Avg win/loss", "0.94", false],
  ] as const;
  const dailyBars = [44, 17, 67, 38, 14];
  const recent = [
    ["Feb 05", "MES", "Short", "−$456.75"],
    ["Feb 05", "MES", "Long", "+$604.00"],
    ["Feb 04", "6E", "Long", "+$52.90"],
    ["Feb 04", "MNQ", "Short", "+$473.00"],
  ] as const;
  return (
    <div
      role="img"
      aria-label="EdgeWhiz dashboard concept with a purple navigation rail, account filters, performance radar, profit charts and trade calendar"
      className="overflow-hidden rounded-xl border border-[var(--mk-line)] bg-[var(--mk-bg)] text-left shadow-2xl"
    >
      <div className="grid min-w-0 md:grid-cols-[148px_minmax(0,1fr)]">
        <aside className="hidden flex-col gap-1 border-r border-[var(--mk-line)] bg-[var(--mk-nav)] p-3 md:flex">
          <span className="mb-2 rounded-md bg-[var(--mk-acc)] px-2 py-2 text-center text-[11px] font-semibold text-white">
            + Add Trade
          </span>
          {NAV.map(({ label, icon: Icon }, index) => (
            <span
              key={label}
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-[10px] font-medium ${index === 0 ? "bg-[var(--mk-acc)]/20 text-[var(--mk-fg)]" : "text-[var(--mk-mute)]"}`}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {label}
            </span>
          ))}
        </aside>
        <div className="min-w-0">
          <div className="flex flex-col justify-between gap-3 border-b border-[var(--mk-line)] px-4 py-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[var(--mk-mute)]">
                Trading workspace
              </p>
              <h3 className="mt-1 text-lg font-semibold">Dashboard</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
              {["R-multiple", "Filters", "Jan 14–Feb 05, 2026", "All accounts"].map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-[var(--mk-line)] bg-[var(--mk-s1)] px-2 py-1.5 text-[var(--mk-mute)]"
                >
                  {label}
                </span>
              ))}
              <span className="rounded-md bg-[var(--mk-acc)] px-2 py-1.5 font-semibold text-white">
                Start my day
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-5">
            {kpis.map(([label, value, positive]) => (
              <div
                key={label}
                className="min-w-0 rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-2.5"
              >
                <p className="truncate text-[9px] text-[var(--mk-mute)]">{label}</p>
                <p
                  className={`mt-1 truncate font-mono text-sm font-semibold ${positive ? "text-[var(--profit)]" : "text-[var(--mk-fg)]"}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 px-3 pb-3 lg:grid-cols-[1.05fr_1.1fr_0.9fr]">
            <PerformanceRadar data={radar} score={38.63} color="var(--mk-acc)" />
            <div className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3">
              <p className="text-[10px] font-medium">Daily cumulative P&amp;L</p>
              <svg viewBox="0 0 360 150" className="mt-2 h-auto w-full" aria-hidden>
                {[30, 65, 100, 135].map((y) => (
                  <line key={y} x1="0" x2="360" y1={y} y2={y} stroke="var(--mk-line)" />
                ))}
                <path
                  d="M0 130 L45 112 L90 103 L135 75 L180 66 L225 39 L270 22 L315 34 L360 70 L360 150 L0 150 Z"
                  fill="var(--mk-acc)"
                  opacity="0.22"
                />
                <path
                  d="M0 130 L45 112 L90 103 L135 75 L180 66 L225 39 L270 22 L315 34 L360 70"
                  fill="none"
                  stroke="var(--mk-acc)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3">
              <p className="text-[10px] font-medium">Net daily P&amp;L</p>
              <div className="mt-3 flex h-[150px] items-end justify-around gap-2 border-b border-[var(--mk-line)] pb-0">
                {dailyBars.map((height, index) => (
                  <span
                    key={index}
                    className="w-5 rounded-t-sm"
                    style={{
                      height: `${height}%`,
                      background:
                        index === dailyBars.length - 1 ? "var(--color-loss)" : "var(--profit)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 px-3 pb-3 lg:grid-cols-[0.9fr_1.6fr]">
            <div className="overflow-hidden rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)]">
              <div className="flex items-center justify-between border-b border-[var(--mk-line)] px-3 py-2">
                <p className="text-[10px] font-medium">Recent trades</p>
                <span className="text-[9px] text-[var(--mk-acc)]">View all</span>
              </div>
              <div className="grid grid-cols-[0.7fr_0.8fr_0.7fr_0.8fr] gap-2 border-b border-[var(--mk-line)] bg-[var(--mk-s2)] px-3 py-2 text-[8px] uppercase tracking-wide text-[var(--mk-mute)]">
                <span>Date</span>
                <span>Market</span>
                <span>Side</span>
                <span className="text-right">Net P&amp;L</span>
              </div>
              {recent.map(([date, market, side, pnl]) => (
                <div
                  key={`${date}-${market}-${pnl}`}
                  className="grid grid-cols-[0.7fr_0.8fr_0.7fr_0.8fr] gap-2 border-b border-[var(--mk-line)]/70 px-3 py-2 text-[9px] last:border-0"
                >
                  <span className="text-[var(--mk-mute)]">{date}</span>
                  <span>{market}</span>
                  <span>{side}</span>
                  <span
                    className={`text-right font-mono ${pnl.startsWith("+") ? "text-[var(--profit)]" : "text-[var(--color-loss)]"}`}
                  >
                    {pnl}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-[var(--mk-line)] bg-[var(--mk-s1)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-medium">Profit calendar</p>
                <span className="text-[9px] text-[var(--mk-mute)]">February 2026</span>
              </div>
              <Cal />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
