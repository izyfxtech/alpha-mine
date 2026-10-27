import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/site";
import { Rv } from "@/components/marketing-shell";
import { fmtDate, POSTS, readingMinutes } from "@/lib/posts";

const DESC = "Practical writing on journaling, trading psychology and the numbers behind your results.";

export const Route = createFileRoute("/blog/")({
  head: () => ({ meta: [{ title: "Blog | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Blog | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => {
    const [first, ...rest] = POSTS;
    return (
      <SiteLayout>
        <PageHero eyebrow="Blog" title="Notes for traders who keep a journal" lead="Practical writing on process, psychology and the numbers behind your results." />
        <section className="mk-wrap">
          <Rv>
            <Link to="/blog/$slug" params={{ slug: first.slug }} className="mk-card group block rounded-2xl p-8 md:p-12">
              <p className="text-sm font-semibold text-[var(--mk-acc)]">{first.tag} · {readingMinutes(first)} min read</p>
              <h2 className="mt-4 text-3xl font-semibold md:text-4xl" style={{ maxWidth: 680 }}>{first.title}</h2>
              <p className="mt-4 text-lg text-[var(--mk-mute)]" style={{ maxWidth: 680 }}>{first.description}</p>
              <span className="mt-8 inline-flex items-center gap-1 text-base font-semibold text-[var(--mk-acc)]">Read article <ArrowRight size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" /></span>
            </Link>
          </Rv>
        </section>
        <Section n="01" label="More to read" title="Fresh from the journal">
          <div className="grid gap-4 md:grid-cols-3">
            {rest.map((p, i) => (
              <Rv key={p.slug} delay={i * 80}>
                <Link to="/blog/$slug" params={{ slug: p.slug }} className="mk-card flex h-full flex-col p-6">
                  <p className="text-xs font-semibold text-[var(--mk-acc)]">{p.tag} · {readingMinutes(p)} min read</p>
                  <h3 className="mt-3 text-xl font-semibold">{p.title}</h3>
                  <p className="mt-2 text-base text-[var(--mk-mute)]">{p.description}</p>
                  <p className="mt-auto pt-6 text-sm text-[var(--mk-mute)]">{fmtDate(p.date)}</p>
                </Link>
              </Rv>
            ))}
          </div>
        </Section>
        <CtaBand title="Turn what you read into data" />
      </SiteLayout>
    );
  },
});
