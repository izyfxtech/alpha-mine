import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo";

type Theme = "dark" | "light";
const KEY = "am.mk-theme";

/** Marketing + auth wrapper: dark by default, persisted toggle, one observer for reveals and word fades. */
export function MkShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "light") setTheme("light"); } catch { /* storage unavailable */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const els = document.querySelectorAll<HTMLElement>(".mk-rv, .mk-w");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); } }),
      { rootMargin: "0px 0px -15% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ready]);

  const toggle = () => setTheme((t) => {
    const n = t === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, n); } catch { /* ignore */ }
    return n;
  });

  return (
    <div className={`mk ${theme === "dark" ? "mk-dark" : "mk-light"} ${ready ? "mk-js" : ""}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--mk-acc)] focus:px-3 focus:py-2 focus:text-[var(--mk-acc-fg)]">Skip to content</a>
      <MkContext.Provider value={{ theme, toggle }}>{children}</MkContext.Provider>
    </div>
  );
}

import { createContext, useContext } from "react";
const MkContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

export function ThemeToggle() {
  const { theme, toggle } = useContext(MkContext);
  return (
    <button type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--mk-line)] text-[var(--mk-mute)] transition-colors duration-300 hover:bg-[var(--mk-s2)] hover:text-[var(--mk-fg)]">
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export const Rv = ({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) => (
  <div className={`mk-rv ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>
);

/** Each word fades from muted to full colour as it crosses the trigger line. */
export const Words = ({ text }: { text: string }) => (
  <>{text.split(" ").map((w, i) => <span key={i} className="mk-w">{w}{" "}</span>)}</>
);

export const BrandLink = () => <Link to="/" aria-label="AlphaMine home"><Logo /></Link>;
