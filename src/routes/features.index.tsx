import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/site";
import { Rv } from "@/components/marketing-shell";
import { FEATURES, MORE } from "@/lib/site-content";

const DESC = "Journal, profit calendar, tilt meter, Chart Lab, Edge Finder and Strategy Lab: the tools inside AlphaMine.";
export const Route = createFileRoute("/features/")({
  head: () => ({ meta: [{ title: "Features | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Features | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => (
    <SiteLayout>
      <PageHero eyebrow="Features" title="One journal, every angle on your trading" lead="Log trades, score your discipline, read sixteen reports and test ideas on your own history, all in one place.">
        <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
      </PageHero>
      <Section n="01" label="The core tools" title="Six tools that work from the same trade data">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Rv key={f.slug} delay={(i % 3) * 80}>
              <Link to="/features/$slug" params={{ slug: f.slug }} className="mk-card group flex h-full flex-col p-6">
                <f.icon size={28} className="text-[var(--mk-acc)]" />
                <h3 className="mt-4 text-xl font-semibold">{f.name}</h3>
                <p className="mt-2 text-base text-[var(--mk-mute)]">{f.short}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-semibold text-[var(--mk-acc)]">Learn more <ArrowRight size={14} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" /></span>
              </Link>
            </Rv>
          ))}
        </div>
      </Section>
      <Section n="02" label="And more" title="Everything around the trade, too" split>
        <dl className="divide-y divide-[var(--mk-line)] border-y border-[var(--mk-line)]">
          {MORE.map(([t, d]) => <div key={t} className="grid gap-1 py-5 sm:grid-cols-[200px_1fr] sm:gap-6"><dt className="text-lg font-semibold">{t}</dt><dd className="text-base text-[var(--mk-mute)]">{d}</dd></div>)}
        </dl>
      </Section>
      <CtaBand title="See which parts of your trading actually pay" />
    </SiteLayout>
  ),
});
