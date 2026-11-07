import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { START_TOUR_EVENT, TOUR_STEPS, placePopover, type Box, type TourStep } from "@/lib/tour";

const find = (target: string | null) =>
  target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
const usable = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0;
};

/**
 * Dims the page, cuts a hole around the element each step is about and puts the explanation beside it. Steps whose element is not on
 * screen (a hidden filter bar, a phone layout) are skipped. Start it with the START_TOUR_EVENT window event.
 */
export function SpotlightTour() {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const card = useRef<HTMLDivElement>(null);
  const step = steps?.[i];

  useEffect(() => {
    const start = () => {
      setSteps(TOUR_STEPS.filter((s) => s.target === null || usable(find(s.target))));
      setI(0);
    };
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, []);

  const close = useCallback(() => setSteps(null), []);
  const measure = useCallback(() => {
    if (!step) return;
    const el = find(step.target);
    const r = el && usable(el) ? el.getBoundingClientRect() : null;
    const b = r
      ? { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 }
      : null;
    setBox(b);
    const size = {
      width: card.current?.offsetWidth ?? 320,
      height: card.current?.offsetHeight ?? 180,
    };
    setPos(placePopover(b, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [step]);

  // Bring the element into view first (the menu can scroll), then measure; keep following it if the window changes.
  useLayoutEffect(() => {
    if (!step) return;
    find(step.target)?.scrollIntoView({ block: "nearest" });
    measure();
    const again = () => measure();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    const t = window.setTimeout(measure, 60); // the card's real height is known after its first paint
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      window.clearTimeout(t);
    };
  }, [step, measure]);

  useEffect(() => {
    if (step) card.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, close]);

  if (!steps || !step) return null;
  const last = i === steps.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="spotlight">
      {/* Blocks clicks on the page while the tour is open. */}
      <div className="absolute inset-0" onClick={close} aria-hidden />
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-md ring-2 ring-white/90 transition-all duration-200"
          style={{ ...box, boxShadow: "0 0 0 9999px rgba(15, 12, 25, 0.62)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[rgba(15,12,25,0.62)]"
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-lg border bg-card p-4 text-card-foreground shadow-xl outline-none"
        style={pos}
      >
        <p className="text-xs text-muted-foreground">
          {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-base font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
