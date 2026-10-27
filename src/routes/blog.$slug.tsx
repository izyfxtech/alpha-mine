import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "@phosphor-icons/react";
import { CtaBand, SiteLayout } from "@/components/site";
import { fmtDate, POSTS, readingMinutes } from "@/lib/posts";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => { if (!POSTS.some((p) => p.slug === params.slug)) throw notFound(); return { slug: params.slug }; },
  head: ({ loaderData }) => {
    const p = POSTS.find((x) => x.slug === loaderData?.slug);
    return { meta: p ? [{ title: `${p.title} | AlphaMine` }, { name: "description", content: p.description }, { property: "og:title", content: p.title }, { property: "og:description", content: p.description }, { property: "og:type", content: "article" }] : [], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] };
  },
  component: Article,
});

function Article() {
  const { slug } = Route.useLoaderData();
  const p = POSTS.find((x) => x.slug === slug)!;
  const more = POSTS.filter((x) => x.slug !== slug).slice(0, 3);
  return (
    <SiteLayout>
      <article className="mk-wrap pb-24 pt-40 md:pt-48">
        <div className="mx-auto" style={{ maxWidth: 680 }}>
          <Link to="/blog" className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]"><ArrowLeft size={16} />All articles</Link>
          <p className="mt-8 text-sm font-semibold text-[var(--mk-acc)]">{p.tag}</p>
          <h1 className="mk-grad mt-3 text-4xl font-semibold md:text-5xl">{p.title}</h1>
          <p className="mt-4 text-sm text-[var(--mk-mute)]">{fmtDate(p.date)} · {readingMinutes(p)} min read · IZ Technologies Limited</p>
          <div className="mt-12 space-y-6">
            {p.body.map((b, i) => b.t === "h2" ? <h2 key={i} className="pt-6 text-2xl font-semibold">{b.text}</h2>
              : b.t === "ul" ? <ul key={i} className="list-disc space-y-2 pl-6 text-lg marker:text-[var(--mk-acc)]">{b.items.map((it) => <li key={it}>{it}</li>)}</ul>
              : b.t === "callout" ? <p key={i} className="rounded-xl border border-[var(--mk-line)] border-l-[var(--mk-acc)] bg-[var(--mk-s1)] p-6 text-lg font-semibold" style={{ borderLeftWidth: 3 }}>{b.text}</p>
              : <p key={i} className="text-lg">{b.text}</p>)}
          </div>
          <p className="mt-12 border-t border-[var(--mk-line)] pt-6 text-sm text-[var(--mk-mute)]">This article is for education. It is not financial advice, and trading carries a risk of loss.</p>
        </div>
      </article>
      <section className="mk-wrap pb-24">
        <div className="border-t border-[var(--mk-line)] pt-16">
          <h2 className="text-2xl font-semibold">Keep reading</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{more.map((m) => <Link key={m.slug} to="/blog/$slug" params={{ slug: m.slug }} className="mk-card p-6"><p className="text-xs font-semibold text-[var(--mk-acc)]">{m.tag}</p><h3 className="mt-2 text-lg font-semibold">{m.title}</h3></Link>)}</div>
        </div>
      </section>
      <CtaBand title="Put it into practice in your own journal" />
    </SiteLayout>
  );
}
