import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Plus } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/marketing/site";
import { Rv } from "@/components/marketing/marketing-shell";
import { FEATURES } from "@/lib/content/site-content";

const DESC = "AlphaMine is free while we build. Paid plans are coming, and pricing will be published here before they launch.";
const included = [...FEATURES.map((f) => f.name), "MetaTrader 5, CSV and Excel import", "Multiple journals", "Share links for any journal", "Trading plans, missed trades and diary"];
const faqs = [
  { q: "Is AlphaMine really free?", a: "Yes. Today every feature in the app is free to use." },
  { q: "Do I need to add a card?", a: "No. AlphaMine does not collect payment details at the moment." },
  { q: "When will paid plans arrive?", a: "There is no date yet. Paid plans are coming, and their pricing will be published on this page before they launch." },
  { q: "What happens to my journal when plans change?", a: "Your journals belong to your account. We will share the details of any plan changes here when pricing is announced." },
];
export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Pricing | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => (
    <SiteLayout>
      <PageHero eyebrow="Pricing" title="Free while we build. Paid plans are coming." lead="Everything in AlphaMine is free today. We will add paid plans later, and publish their pricing here before they launch.">
        <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
      </PageHero>
      <section className="mk-wrap pb-8">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Rv>
            <div className="h-full rounded-2xl border border-[var(--mk-acc)] bg-[var(--mk-s1)] p-8">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Free</h2><span className="rounded-full bg-[var(--mk-acc)] px-3 py-1 text-xs font-semibold text-[var(--mk-acc-fg)]">Available now</span></div>
              <p className="mt-4 font-mono text-5xl font-semibold">$0</p>
              <p className="mt-2 text-base text-[var(--mk-mute)]">Every feature, while AlphaMine is in its free period.</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">{included.map((i) => <li key={i} className="flex items-start gap-2 text-base"><Check size={18} weight="bold" className="mt-1 shrink-0 text-[var(--mk-acc)]" />{i}</li>)}</ul>
              <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri mt-8">Create free account</Link>
            </div>
          </Rv>
          <Rv delay={100}>
            <div className="h-full rounded-2xl border border-dashed border-[var(--mk-line)] p-8">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Paid plans</h2><span className="rounded-full border border-[var(--mk-line)] px-3 py-1 text-xs font-semibold text-[var(--mk-mute)]">Coming soon</span></div>
              <p className="mt-4 text-base text-[var(--mk-mute)]">We are working on paid plans for traders who want more. Pricing and what each plan includes will be published here before anything launches.</p>
            </div>
          </Rv>
        </div>
      </section>
      <Section n="01" label="Pricing FAQ" title="Questions about cost" split>
        <div className="divide-y divide-[var(--mk-line)] border-y border-[var(--mk-line)]">
          {faqs.map((f) => (
            <details key={f.q} className="py-5"><summary className="flex items-center justify-between gap-4 text-lg font-semibold">{f.q}<Plus size={20} className="mk-plus shrink-0 text-[var(--mk-mute)]" /></summary><p className="mt-3 text-base text-[var(--mk-mute)]">{f.a}</p></details>
          ))}
        </div>
      </Section>
      <CtaBand title="Start free and keep every trade you log" />
    </SiteLayout>
  ),
});
