import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "@phosphor-icons/react";
import { BrandLink, MkShell, ThemeToggle } from "@/components/marketing/marketing-shell";

/** Set this to your support address. While empty, the contact sentence is left out. */
export const CONTACT_EMAIL = "";

export type LegalSection = { h: string; p: string[] };

export function LegalPage({ title, updated, intro, sections, other }: { title: string; updated: string; intro: string; sections: LegalSection[]; other: { to: "/privacy" | "/terms"; label: string } }) {
  return (
    <MkShell>
      <header className="mk-wrap flex items-center justify-between py-4">
        <BrandLink />
        <div className="flex items-center gap-2">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]"><ArrowLeft size={16} />Back to home</Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mk-wrap pb-24 pt-16">
        <article style={{ maxWidth: 720 }} className="mx-auto">
          <p className="text-sm text-[var(--mk-mute)]">Last updated {updated}</p>
          <h1 className="mk-grad mt-3 text-5xl font-semibold">{title}</h1>
          <p className="mt-6 text-lg text-[var(--mk-mute)]">{intro}</p>
          {sections.map((s, i) => (
            <section key={s.h} className="mt-12">
              <h2 className="text-2xl font-semibold"><span className="mr-3 font-mono text-base text-[var(--mk-acc)]">{String(i + 1).padStart(2, "0")}</span>{s.h}</h2>
              {s.p.map((t, j) => <p key={j} className="mt-4 text-base text-[var(--mk-mute)]">{t}</p>)}
            </section>
          ))}
          {CONTACT_EMAIL && <p className="mt-12 text-base text-[var(--mk-mute)]">Questions? Email <a className="font-semibold text-[var(--mk-acc)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>}
          <div className="mt-12 border-t border-[var(--mk-line)] pt-6"><Link to={other.to} className="mk-btn mk-btn-sec">{other.label}</Link></div>
        </article>
      </main>
    </MkShell>
  );
}
