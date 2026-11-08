import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useJournal, useTrades } from "@/lib/journal/journal-context";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/** Pages that never read trades, so they open at once instead of waiting for them. */
const NO_TRADES = ["/settings", "/plans", "/diary/notebook"];

export const needsTrades = (path: string) =>
  !NO_TRADES.some((p) => path === p || path.startsWith(`${p}/`));

/** Shows a skeleton until the journal and its trades have loaded the first time, then the page. Later refreshes keep the page. */
export function RouteGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { journal } = useJournal();
  // Same query as every page's own useTrades call, so this adds no request.
  const { isLoading } = useTrades({ unfiltered: true, includeOpen: true });
  if (needsTrades(pathname) && (!journal || isLoading)) return <PageSkeleton />;
  return <>{children}</>;
}
