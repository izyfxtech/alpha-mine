import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/marketing/site";
import { Rv } from "@/components/marketing/marketing-shell";
import { Bars, Cal, JournalRows, Meter, Monte } from "@/components/analytics/visuals";
import { FEATURES, type Feature } from "@/lib/content/site-content";

export const Route = createFileRoute("/features/$slug")({
  loader: ({ params }) => { if (!FEATURES.some((x) => x.slug === params.slug)) throw notFound(); return { slug: params.slug }; },
  head: ({ loaderData }) => { const f = FEATURES.find((x) => x.slug === loaderData?.slug); return {
    meta: f ? [{ title: `${f.name} | AlphaMine` }, { name: "description", content: f.lead }, { property: "og:title", content: `${f.name} | AlphaMine` }, { property: "og:description", content: f.lead }, { property: "og:type", content: "website" }] : [],
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }],
  }; },
  component: FeaturePage,
});

function Visual({ v }: { v: Feature["visual"] }) {
  const m = (items: [string, number][]) => <div className="space-y-4" style={{ maxWidth: 420 }}>{items.map(([k, n]) => <Meter key={k} label={k} value={n} />)}</div>;
  if (v === "calendar") return <div style={{ maxWidth: 420 }}><Cal /></div>;
  if (v === "tilt") return m([["Entries", 84], ["Management", 71], ["Exits", 90]]);
  if (v === "edge") return m([["Session", 78], ["Setup", 55], ["Instrument", 34]]);
  if (v === "bars") return <Bars />;
  if (v === "monte") return <Monte />;
  return <JournalRows />;
}

function FeaturePage() {
  const { slug } = Route.useLoaderData();
  const f = FEATURES.find((x) => x.slug === slug)!;
  const related = FEATURES.filter((x) => x.slug !== f.slug).slice(0, 3);
  return (
    <SiteLayout>
      <PageHero eyebrow={`Features / ${f.name}`} title={f.headline} lead={f.lead}>
        <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
        <Link to="/features" className="mk-btn mk-btn-sec">All features</Link>
      </PageHero>
      <section className="mk-wrap pb-8">
        <Rv>
          <div className="rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] p-6 md:p-10"><Visual v={f.visual} /><p className="mt-6 text-xs text-[var(--mk-mute)]">Sample data</p></div>
        </Rv>
      </section>
      <Section n="01" label="What you get" title={`How ${f.name} helps`}>
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {f.points.map((p, i) => (
            <Rv key={p.t} delay={i * 100}>
              <div className="border-t border-[var(--mk-acc)] pt-5"><h3 className="text-xl font-semibold">{p.t}</h3><p className="mt-2 text-base text-[var(--mk-mute)]">{p.d}</p></div>
            </Rv>
          ))}
        </div>
      </Section>
      <Section n="02" label="Keep exploring" title="Works best alongside">
        <div className="grid gap-4 md:grid-cols-3">
          {related.map((r) => (
            <Link key={r.slug} to="/features/$slug" params={{ slug: r.slug }} className="mk-card flex flex-col p-6"><r.icon size={24} className="text-[var(--mk-acc)]" /><h3 className="mt-3 text-lg font-semibold">{r.name}</h3><p className="mt-1 text-base text-[var(--mk-mute)]">{r.short}</p></Link>
          ))}
        </div>
      </Section>
      <CtaBand title={`Try ${f.name} on your own trades`} />
    </SiteLayout>
  );
}
