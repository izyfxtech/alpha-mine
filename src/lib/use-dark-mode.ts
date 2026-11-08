import { useCallback, useSyncExternalStore } from "react";
import { storageSet } from "@/lib/safe-storage";

/** The page's theme lives on the <html> element (set before first paint by a script in the root route). */
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const isDark = () => document.documentElement.classList.contains("dark");

/** Whether the dark theme is on, and a function that flips it and remembers the choice. */
export function useDarkMode() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = useCallback(() => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    storageSet("am.theme", next ? "dark" : "light");
  }, []);
  return [dark, toggle] as const;
}
