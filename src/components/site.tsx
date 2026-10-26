import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { BrandLink, MkShell, Rv, ThemeToggle } from "@/components/marketing-shell";
import { FEATURES } from "@/lib/site-content";

const linkCls = "rounded-lg px-3 py-2 text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]";
const ease = "ease-[cubic-bezier(0.22,1,0.36,1)]";

function Nav() {
  const [open, setOpen] = useState(false);
  const mobile = [{ to: "/features", label: "Features" }, { to: "/import", label: "Import" }, { to: "/pricing", label: "Pricing" }, { to: "/about", label: "About" }, { to: "/help", label: "Help" }, { to: "/auth", label: "Sign in" }] as const;
  return (
    <>
      <header className="fixed inset-x-0 top-3 z-40 mx-auto w-fit max-w-[calc(100%-24px)]">
        <nav aria-label="Primary" className="flex items-center gap-4 rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-nav)] px-3 py-2 backdrop-blur-xl">
          <BrandLink />
          <div className="hidden items-center gap-1 md:flex">
            <div className="group relative">
              <Link to="/features" className={`${linkCls} inline-flex items-center gap-1`}>Features<CaretDown size={12} weight="bold" className={`transition-transform duration-300 group-hover:rotate-180 group-focus-within:rotate-180`} /></Link>
              <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition-opacity duration-300 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="w-72 rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] p-2">
                  {FEATURES.map((f) => (
                    <Link key={f.slug} to="/features/$slug" params={{ slug: f.slug }} className="flex items-start gap-3 rounded-lg p-3 transition-colors duration-300 hover:bg-[var(--mk-s2)]">
                      <f.icon size={20} className="mt-0.5 shrink-0 text-[var(--mk-acc)]" />
                      <span><span className="block text-sm font-semibold">{f.name}</span><span className="block text-xs text-[var(--mk-mute)]">{f.short}</span></span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link to="/import" className={linkCls}>Import</Link>
            <Link to="/pricing" className={linkCls}>Pricing</Link>
            <Link to="/about" className={linkCls}>About</Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth" className="mk-btn mk-btn-sec hidden text-sm md:inline-flex">Sign in</Link>
            <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative z-50 h-9 w-9 rounded-lg border border-[var(--mk-line)] md:hidden">
              <span className={`absolute left-2.5 top-3.5 h-0.5 w-4 rounded-full bg-[var(--mk-fg)] transition-transform duration-500 ${ease}`} style={{ transform: open ? "translateY(3px) rotate(45deg)" : "none" }} />
              <span className={`absolute left-2.5 top-[21px] h-0.5 w-4 rounded-full bg-[var(--mk-fg)] transition-transform duration-500 ${ease}`} style={{ transform: open ? "translateY(-4px) rotate(-45deg)" : "none" }} />
            </button>
          </div>
        </nav>
      </header>
      <div className={`fixed inset-0 z-30 bg-[var(--mk-panel)] backdrop-blur-2xl transition-opacity duration-500 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!open}>
        <div className="flex h-full flex-col justify-center gap-6 px-6">
          {mobile.map((l, i) => (
            <Link key={l.to} to={l.to} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className={`text-4xl font-semibold transition-all duration-500 ${ease}`}
              style={{ transitionDelay: open ? `${Math.min(i * 60, 400)}ms` : "0ms", opacity: open ? 1 : 0, transform: open ? "none" : "translateY(24px)" }}>{l.label}</Link>
          ))}
        </div>
      </div>
    </>
  );
}

const fl = "transition-colors duration-300 hover:text-[var(--mk-fg)]";
function Footer() {
  return (
    <footer className="border-t border-[var(--mk-line)] py-16">
      <div className="mk-wrap grid gap-10 text-sm text-[var(--mk-mute)] sm:grid-cols-2 lg:grid-cols-5">
        <div><BrandLink /><p className="mt-4" style={{ maxWidth: 240 }}>The trading journal that finds your edge.</p></div>
        <div><p className="font-semibold text-[var(--mk-fg)]">Product</p><ul className="mt-4 space-y-3">{FEATURES.map((f) => <li key={f.slug}><Link to="/features/$slug" params={{ slug: f.slug }} className={fl}>{f.name}</Link></li>)}<li><Link to="/import" className={fl}>Import</Link></li></ul></div>
        <div><p className="font-semibold text-[var(--mk-fg)]">Company</p><ul className="mt-4 space-y-3"><li><Link to="/about" className={fl}>About</Link></li><li><Link to="/pricing" className={fl}>Pricing</Link></li><li><Link to="/help" className={fl}>Help centre</Link></li></ul></div>
        <div><p className="font-semibold text-[var(--mk-fg)]">Account</p><ul className="mt-4 space-y-3"><li><Link to="/auth" className={fl}>Sign in</Link></li><li><Link to="/auth" search={{ mode: "signup" }} className={fl}>Create account</Link></li></ul></div>
        <div><p className="font-semibold text-[var(--mk-fg)]">Legal</p><ul className="mt-4 space-y-3"><li><Link to="/privacy" className={fl}>Privacy policy</Link></li><li><Link to="/terms" className={fl}>Terms of service</Link></li></ul></div>
      </div>
      <div className="mk-wrap mt-12 border-t border-[var(--mk-line)] pt-6 text-sm text-[var(--mk-mute)]">© {new Date().getFullYear()} IZ Technologies Limited. AlphaMine is built by traders, for traders.</div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return <MkShell><Nav /><div id="main">{children}</div><Footer /></MkShell>;
}

/** One section template: ruled top edge, optional numbered eyebrow and left aligned title. `split` puts the title beside the content. */
export function Section({ id, n, label, title, split, children }: { id?: string; n?: string; label?: string; title?: string; split?: boolean; children: ReactNode }) {
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

export function CtaBand({ title }: { title: string }) {
  return (
    <section className="mk-wrap pb-24 pt-8">
      <Rv>
        <div className="mk-stage rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-s1)] px-6 py-20 text-center">
          <h2 className="mx-auto text-4xl font-semibold md:text-5xl" style={{ maxWidth: 680 }}>{title}</h2>
          <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri mt-8">Start journaling free</Link>
        </div>
      </Rv>
    </section>
  );
}

export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <section className="mk-wrap pb-16 pt-40 md:pt-48">
      <p className="font-mono text-sm text-[var(--mk-acc)]">{eyebrow}</p>
      <h1 className="mk-grad mt-4 text-5xl font-semibold md:text-7xl" style={{ maxWidth: 820 }}>{title}</h1>
      <p className="mt-6 text-lg text-[var(--mk-mute)]" style={{ maxWidth: 680 }}>{lead}</p>
      {children && <div className="mt-8 flex flex-wrap items-center gap-3">{children}</div>}
    </section>
  );
}
