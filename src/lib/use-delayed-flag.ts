import { useEffect, useState } from "react";

/**
 * True only once `active` has stayed true for `delayMs`. Used for loading skeletons: if the data arrives within the delay, the
 * skeleton never appears, so a fast or cached load shows no flash. It turns false the moment `active` does.
 */
export function useDelayedFlag(active: boolean, delayMs: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}
