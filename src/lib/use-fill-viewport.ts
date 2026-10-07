import { useEffect, useRef } from "react";

/**
 * Sizes an element so its bottom edge lands exactly one page-padding above the bottom of the window.
 * It re-measures when the window resizes and whenever the scrolling <main> area changes size (for
 * example when the filter panel opens above it), so tables can scroll inside their own card instead of
 * leaving dead space under them.
 */
export function useFillViewport<T extends HTMLElement>(bottomGap = 21) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const top = el.getBoundingClientRect().top;
      el.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - bottomGap))}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    const main = el.closest("main");
    const ro = new ResizeObserver(apply);
    if (main) ro.observe(main);
    if (main?.parentElement) ro.observe(main.parentElement);
    return () => { window.removeEventListener("resize", apply); ro.disconnect(); };
  }, [bottomGap]);
  return ref;
}
