/** Spotlight tour: what to point at, in order, and where to put the explanation next to it. */
export const START_TOUR_EVENT = "am:start-tour";

/** Stable hook for an element the tour can point at: `data-tour="nav-trade-analytics"`. */
export const navSlug = (label: string) =>
  `nav-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

export interface TourStep {
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "A quick look around",
    body: "This takes about a minute. Use the arrow keys or the buttons, and press Esc to stop at any time.",
  },
  {
    target: "nav-home",
    title: "Home",
    body: "Your account dashboard brings the score radar, P&L, recent trades and profit calendar together.",
  },
  {
    target: "add-trade",
    title: "Add trades",
    body: "Log a trade by hand, or use the upload button next to it to import a MetaTrader report or a broker file.",
  },
  {
    target: "nav-portfolio",
    title: "Portfolio",
    body: "Compare performance and balances across your trading journals.",
  },
  {
    target: "nav-journal",
    title: "Journal",
    body: "Open trades, plans, missed setups, sessions and notes from this section. The trade list can be a table, cards or a screenshot gallery.",
  },
  {
    target: "nav-reports",
    title: "Reports",
    body: "Trade analytics, rules, Chart Lab, calendars, strategy tests and progress reports live together here.",
  },
  {
    target: "nav-settings",
    title: "Settings",
    body: "Configure account details, journals, instruments, setups, rules and sharing.",
  },
  {
    target: "journal-picker",
    title: "Your journals",
    body: "A journal is one trading account. Switch between them here, add a new one, or copy and share one.",
  },
  {
    target: "filters",
    title: "Filters",
    body: "Narrow every page to a period, instrument, setup or anything else. Dashboard and report numbers follow them.",
  },
  {
    target: "search",
    title: "Search or jump",
    body: "Press Ctrl+K (Cmd+K on a Mac) to go to any page or trade without the menu.",
  },
  {
    target: "account",
    title: "Your account menu",
    body: "Reopen this tour or the Setup guide here, share your journal, and manage your account and data.",
  },
];

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Where to put a popover of `size` next to `target` inside `view`: right of the target if it fits, else left, else below, else above;
 * always kept inside the viewport. A null target centres it.
 */
export function placePopover(
  target: Box | null,
  size: { width: number; height: number },
  view: { width: number; height: number },
  gap = 14,
  margin = 12,
) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const maxLeft = view.width - size.width - margin,
    maxTop = view.height - size.height - margin;
  if (!target)
    return {
      top: clamp((view.height - size.height) / 2, margin, maxTop),
      left: clamp((view.width - size.width) / 2, margin, maxLeft),
    };
  const midTop = target.top + target.height / 2 - size.height / 2,
    midLeft = target.left + target.width / 2 - size.width / 2;
  if (target.left + target.width + gap + size.width <= view.width - margin)
    return { top: clamp(midTop, margin, maxTop), left: target.left + target.width + gap };
  if (target.left - gap - size.width >= margin)
    return { top: clamp(midTop, margin, maxTop), left: target.left - gap - size.width };
  if (target.top + target.height + gap + size.height <= view.height - margin)
    return { top: target.top + target.height + gap, left: clamp(midLeft, margin, maxLeft) };
  return {
    top: clamp(target.top - gap - size.height, margin, maxTop),
    left: clamp(midLeft, margin, maxLeft),
  };
}
