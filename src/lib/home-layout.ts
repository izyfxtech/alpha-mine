/** Sizes and labels the Home page and its loading skeleton share, so the placeholder is always the size of the page. */

/** Height of each chart panel on Home. */
export const HOME_CHART_HEIGHT = 230;

/** The Evaluation panel's rows, in display order. */
export const EVALUATION_LABELS = [
  "Total Number of Trades",
  "Avg. Profit per Trading Day",
  "Biggest Winner",
  "Biggest Loser",
  "Followed Trade Plan",
  "Winrate w/o BE",
  "Max Drawdown",
  "Return/Drawdown",
  "Winning / Losing Days",
  "Trades per Day / Week",
  "Avg. Hold Time",
  "Total Fees",
  "ROI",
  "Current Streak",
] as const;
export type EvaluationLabel = (typeof EVALUATION_LABELS)[number];

/** Panel titles of the two chart rows. */
export const HOME_CHART_ROWS = [
  ["Performance by Instrument", "Performance by Weekday", "Equity Graph"],
  ["Performance by Hour", "Performance by Setup"],
] as const;
