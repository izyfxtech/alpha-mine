import { Brain, CalendarDots, ChartLineUp, Flask, MagnifyingGlass, NotePencil, type Icon } from "@phosphor-icons/react";

export type Feature = { slug: string; name: string; icon: Icon; visual: "journal" | "calendar" | "tilt" | "bars" | "edge" | "monte"; short: string; headline: string; lead: string; points: { t: string; d: string }[] };

export const FEATURES: Feature[] = [
  { slug: "journal", name: "Journal", icon: NotePencil, visual: "journal", short: "Log every trade with setups, comments and screenshots.",
    headline: "A journal you will actually keep up", lead: "Log each trade with its setup, instrument, comments and screenshots, then work from a table that fits the way you review.",
    points: [
      { t: "A trade table that fits you", d: "Choose which columns you see, reorder them and keep your layout between sessions." },
      { t: "Your own vocabulary", d: "Define your setups, instruments and comment tags, plus custom statistics for anything else you want to measure." },
      { t: "Screenshots on every trade", d: "Attach screenshots to a trade so the chart behind the decision stays with the result." },
    ] },
  { slug: "profit-calendar", name: "Profit calendar", icon: CalendarDots, visual: "calendar", short: "Daily results, trade counts and discipline on one calendar.",
    headline: "See every trading day at a glance", lead: "A calendar of your results, so a good week or a bad one is obvious before you open a single trade.",
    points: [
      { t: "Daily results in colour", d: "Green and red days show where the month was won or lost." },
      { t: "Monthly and annual views", d: "Step through months with the arrows, or zoom out to an annual overview with a mini calendar for each month." },
      { t: "Discipline beside profit", d: "Each day carries its tilt score, so how you traded sits next to what you made." },
    ] },
  { slug: "tilt-meter", name: "Tilt meter", icon: Brain, visual: "tilt", short: "Turn discipline tags into a daily score.",
    headline: "Measure discipline, not just profit", lead: "Profit can hide bad process and punish good process. The tilt meter keeps score of the decisions you control.",
    points: [
      { t: "Tag decisions as you log", d: "Mark entries, management and exits as disciplined or not." },
      { t: "A score for each day", d: "Tags roll up into a tilt score per day, so you can see exactly when your process slipped." },
      { t: "Plans you can follow", d: "Write a trading plan, then track how often you followed it." },
    ] },
  { slug: "chart-lab", name: "Chart Lab", icon: ChartLineUp, visual: "bars", short: "Sixteen reports, from drawdown to SQN by setup.",
    headline: "Sixteen reports that show how you really trade", lead: "From drawdown to exit analysis, Chart Lab turns your journal into charts you can act on.",
    points: [
      { t: "Reports that matter", d: "Drawdown, efficiency, exit analysis, holding time, trade management and SQN by setup are among them." },
      { t: "Click through to the trades", d: "Select part of a chart to open the trades behind it, so every pattern can be checked." },
      { t: "Slice by what you track", d: "Use the custom statistics picker to break results down by the things you chose to measure." },
    ] },
  { slug: "edge-finder", name: "Edge Finder", icon: MagnifyingGlass, visual: "edge", short: "Finds the strong and weak parts of your trading.",
    headline: "Let your data point at your edge", lead: "Edge Finder scans your journal and rates the strong and weak parts of your trading, so you start from evidence.",
    points: [
      { t: "Clear ratings", d: "Each area is marked Strong, Average or Needs attention." },
      { t: "Trends, not snapshots", d: "A trend marker shows whether an area is moving up or down." },
      { t: "Detail behind every card", d: "Open a card to see the numbers behind its rating." },
    ] },
  { slug: "strategy-lab", name: "Strategy Lab", icon: Flask, visual: "monte", short: "Simulate outcomes and test alternative exits.",
    headline: "Test ideas on your own history", lead: "Strategy Lab lets you ask what if without risking a trade: simulate your edge, or replay trades with different exits.",
    points: [
      { t: "Monte Carlo simulator", d: "Enter your average win, average loss and win rate, run many simulations, and see the range of outcomes and streaks." },
      { t: "Alternative strategies", d: "Replay your trades under different exit rules and compare the results." },
      { t: "A home for backtests", d: "Record backtest sessions so you can set them beside live trading." },
    ] },
];

export const MORE = [
  ["Trading plans", "Write the rules, then track whether you followed them."], ["Missed trades", "Log setups you skipped and analyse what they would have done."],
  ["Diary and notebook", "Session notes and a notebook with folders, next to your numbers."], ["Milestones", "Targets and achievements that follow your progress."],
  ["Portfolio and equity", "Balance, deposits, withdrawals and the equity curve across journals."], ["Monthly and annual reports", "Review a month or a whole year on one page."],
] as const;
