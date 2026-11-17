/** Sizes, headings and cell styles the Portfolio page and its loading skeleton share. */

export const PORTFOLIO_CHART_HEIGHT = { equity: 420, weekday: 520, bars: 280 } as const;

export const PORTFOLIO_NOTE =
  "Uses every closed trade: top-bar filters apply to Home and the analysis pages, not here.";

export const JOURNAL_COLUMNS = [
  "Name",
  "Balance",
  "Return (%)",
  "Return (R)",
  "Avg. P&L",
  "Avg. %",
  "Avg. R",
  "Profit Factor",
  "Winrate",
  "Trades #",
  "Edge Score",
  "",
] as const;

/** Cell styles of the journals table. */
export const JOURNAL_CELL = {
  head: (i: number) =>
    [
      "whitespace-nowrap px-2 py-2.5 font-semibold",
      i === 0 && "text-left",
      i > 0 && i < 11 && "border-l",
    ]
      .filter(Boolean)
      .join(" "),
  value: "whitespace-nowrap px-2 py-2",
  name: "max-w-[130px] truncate px-2 py-2 text-left",
  bar: "w-40 px-4",
} as const;

export const BEST_WORST_COLUMNS = [
  "Journal Name",
  "Entry Date",
  "Exit Date",
  "Instrument",
  "Setup",
  "Direction",
  "Return (%)",
  "Return (R)",
] as const;

export const PORTFOLIO_EVALUATION_LABELS = [
  "Total Number of Trades",
  "Biggest win",
  "Biggest loss",
  "Avg. Profit / day",
  "Trades per day / week",
  "Followed trade plan %",
] as const;

/** The 2x2 grid of bar charts at the foot of the page. */
export const PORTFOLIO_BAR_TITLES = [
  "Performance by Instrument",
  "Performance by Setup",
  "Performance by Month",
  "Performance by Hour",
] as const;

export const PORTFOLIO_UNITS = [
  ["pct", "Return (%)"],
  ["r", "R Multiple"],
] as const;
