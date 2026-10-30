import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "@phosphor-icons/react";
import { CtaBand, PageHero, SiteLayout } from "@/components/marketing/site";

const DESC = "Answers about getting started, importing trades, sharing, and the tools inside AlphaMine.";
const groups = [
  { id: "start", title: "Getting started", items: [
    ["How do I create an account?", "Open the sign in page and choose Create account. Sign up with your email and a password of at least 6 characters, or continue with Google. We email you a link to confirm your address."],
    ["What is a journal?", "A journal is a separate set of trades with its own broker, currency and starting balance. You can keep more than one, and every report follows the journal you have selected."],
    ["How do I add my first trade?", "Open Journal and add a trade with its instrument, setup and result, or import a report to bring in your history at once."],
  ] },
  { id: "import", title: "Importing", items: [
    ["Which files can I import?", "MetaTrader 5 reports exported as HTML or Excel, plus CSV and Excel spreadsheets. You can also log trades by hand."],
    ["Can I attach screenshots to a trade?", "Yes. Add screenshots to any trade so the chart behind the decision stays with the result."],
  ] },
  { id: "tools", title: "Tools", items: [
    ["What is the tilt meter?", "You tag entries, management and exits as disciplined or not. Those tags roll up into a tilt score for each day."],
    ["What is Chart Lab?", "Sixteen reports built from your journal, including drawdown, exit analysis, holding time and SQN by setup. Select part of a chart to open the trades behind it."],
    ["How does Edge Finder rate my trading?", "It looks across your journal and marks each area as Strong, Average or Needs attention, with a trend marker and the detail behind each card."],
    ["What does the simulator need?", "Your win rate, average gain, average loss, starting balance, number of simulations and trades per simulation. It then shows the range of final balances and the longest winning and losing streaks."],
  ] },
  { id: "privacy", title: "Privacy and sharing", items: [
    ["Who can see my journal?", "Only you, unless you create a share link. Database rules keep each journal tied to the account that owns it."],
    ["How do share links work?", "Use the Share Journal button to create a read only link to your journal's performance. Create a new link to replace the old one, or choose Stop sharing to switch it off."],
    ["Where are my screenshots stored?", "In a private storage bucket. They open through short lived signed links."],
  ] },
  { id: "account", title: "Account", items: [
    ["I forgot my password.", "On the sign in page, choose Forgot password and enter your email. We send you a link to set a new one."],
  ] },
];
export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help centre | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Help centre | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => (
    <SiteLayout>
      <PageHero eyebrow="Help centre" title="Answers, grouped by what you are doing" lead="Getting started, importing, the tools, and keeping your data private." />
      <section className="mk-wrap pb-16">
        <div className="grid gap-12 pt-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Help topics" className="hidden lg:block"><ul className="sticky top-24 space-y-1">{groups.map((g) => <li key={g.id}><a href={`#${g.id}`} className="block rounded-lg px-3 py-2 text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:bg-[var(--mk-s1)] hover:text-[var(--mk-fg)]">{g.title}</a></li>)}</ul></nav>
          <div className="space-y-16">
            {groups.map((g) => (
              <div key={g.id} id={g.id} className="scroll-mt-24">
                <h2 className="text-2xl font-semibold">{g.title}</h2>
                <div className="mt-6 divide-y divide-[var(--mk-line)] border-y border-[var(--mk-line)]">
                  {g.items.map(([q, a]) => <details key={q} className="py-5"><summary className="flex items-center justify-between gap-4 text-lg font-semibold">{q}<Plus size={20} className="mk-plus shrink-0 text-[var(--mk-mute)]" /></summary><p className="mt-3 text-base text-[var(--mk-mute)]">{a}</p></details>)}
                </div>
              </div>
            ))}
            <p className="text-base text-[var(--mk-mute)]">Looking for something else? Browse the <Link to="/features" className="font-semibold text-[var(--mk-acc)] underline">features</Link> or the <Link to="/import" className="font-semibold text-[var(--mk-acc)] underline">import guide</Link>.</p>
          </div>
        </div>
      </section>
      <CtaBand title="Ready to open your journal?" />
    </SiteLayout>
  ),
});
