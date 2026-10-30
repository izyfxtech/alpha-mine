import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/marketing/site";
import { Rv } from "@/components/marketing/marketing-shell";

const DESC = "AlphaMine is built by traders for traders, under IZ Technologies Limited.";
const beliefs = [
  { t: "Decisions over outcomes", d: "A winning trade can be a bad decision, and a losing one can be a good decision. We built tools that tell the two apart." },
  { t: "Evidence over memory", d: "Memory keeps the big winner and forgets the rest. A journal keeps everything, so your next trade starts from facts." },
  { t: "Your data stays yours", d: "Every journal belongs to your account and stays private unless you choose to share it." },
];
export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "About | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => (
    <SiteLayout>
      <PageHero eyebrow="About" title="Built by traders, for traders" lead="AlphaMine is made by committed traders for committed traders, and published by IZ Technologies Limited.">
        <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
      </PageHero>
      <Section n="01" label="Why we exist" title="A journal made by people who trade" split>
        <div className="space-y-6 text-lg text-[var(--mk-mute)]">
          <p>Most trading tools are built to look at the market. AlphaMine looks at you: your setups, your exits and the moments your discipline slipped.</p>
          <p>That focus comes from the people building it. We are traders, and we wanted a journal serious enough for traders who take the work seriously. So that is what we are making.</p>
          <p>IZ Technologies Limited is the company behind AlphaMine. The people behind it are committed traders, and that shapes every feature we ship.</p>
        </div>
      </Section>
      <Section n="02" label="What we believe" title="Three ideas behind every feature">
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {beliefs.map((b, i) => <Rv key={b.t} delay={i * 100}><div className="border-t border-[var(--mk-acc)] pt-5"><h3 className="text-xl font-semibold">{b.t}</h3><p className="mt-2 text-base text-[var(--mk-mute)]">{b.d}</p></div></Rv>)}
        </div>
      </Section>
      <CtaBand title="Join the traders building their edge" />
    </SiteLayout>
  ),
});
