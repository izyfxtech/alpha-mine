import { useStoredString } from "@/lib/use-stored-value";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "@phosphor-icons/react";
import { Logo } from "@/components/layout/Logo";

type Theme = "dark" | "light";
const KEY = "am.mk-theme";

/** Marketing + auth wrapper with a persisted theme toggle and immediate content rendering. */
export function MkShell({ children }: { children: ReactNode }) {
  const [storedTheme, storeTheme] = useStoredString(KEY);
  const theme: Theme = storedTheme === "light" ? "light" : "dark";
  const toggle = () => storeTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className={`mk ${theme === "dark" ? "mk-dark" : "mk-light"}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--mk-acc)] focus:px-3 focus:py-2 focus:text-[var(--mk-acc-fg)]"
      >
        Skip to content
      </a>
      <MkContext.Provider value={{ theme, toggle }}>{children}</MkContext.Provider>
    </div>
  );
}

import { createContext, useContext } from "react";
const MkContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeToggle() {
  const { theme, toggle } = useContext(MkContext);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--mk-line)] text-[var(--mk-mute)] transition-colors duration-300 hover:bg-[var(--mk-s2)] hover:text-[var(--mk-fg)]"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export const Rv = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) => <div className={className}>{children}</div>;

export const Words = ({ text }: { text: string }) => <>{text}</>;

export const BrandLink = () => (
  <Link to="/" aria-label="EdgeWhiz home">
    <Logo />
  </Link>
);
