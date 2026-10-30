import { type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "@phosphor-icons/react";
import { BrandLink, ThemeToggle } from "@/components/marketing/marketing-shell";
import { Meter } from "@/components/analytics/visuals";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Split layout shared by sign in and password reset. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-[var(--mk-line)] bg-[var(--mk-s1)] p-12 lg:flex">
        <BrandLink />
        <div>
          <h2 className="mk-grad text-5xl font-semibold" style={{ maxWidth: 480 }}>Mine your trades for the edge you already have.</h2>
          <p className="mt-6 text-lg text-[var(--mk-mute)]" style={{ maxWidth: 480 }}>Journal every trade, measure discipline with the tilt meter, and let sixteen Chart Lab reports show what actually works.</p>
          <div className="mt-10 rounded-2xl border border-[var(--mk-line)] bg-[var(--mk-bg)] p-5" style={{ maxWidth: 400 }} aria-hidden>
            <p className="text-sm font-semibold">Tilt meter</p>
            <div className="mt-4 space-y-3">{[["Entries", 84], ["Management", 71], ["Exits", 90]].map(([k, v]) => <Meter key={k} label={String(k)} value={Number(v)} />)}</div>
            <p className="mt-4 text-xs text-[var(--mk-mute)]">Sample data</p>
          </div>
        </div>
        <p className="text-sm text-[var(--mk-mute)]">Your journals stay private to your account.</p>
      </aside>
      <div className="flex flex-col p-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]"><ArrowLeft size={16} />Back to home</Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-12"><div className="w-full" style={{ maxWidth: 384 }}>{children}</div></div>
      </div>
    </main>
  );
}

export function Field({ label, error, right, ...props }: { label: string; error?: string; right?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <div className="flex items-center justify-between"><label htmlFor={id} className="text-sm font-semibold">{label}</label>{right}</div>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...props}
        className={`mt-2 block w-full rounded-lg border bg-[var(--mk-bg)] px-3 py-2 text-base text-[var(--mk-fg)] placeholder:text-[var(--mk-mute)] transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--mk-acc)] ${error ? "border-red-500" : "border-[var(--mk-line)]"}`} />
      {error && <p id={`${id}-err`} role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
