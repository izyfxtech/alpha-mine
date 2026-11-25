import { Home, Briefcase, BookOpen, FileBarChart, Settings, type LucideIcon } from "lucide-react";

export const CHARTS = [
  ["compare", "Compare Charts"],
  ["consecutive", "Consecutive Winners/Losers"],
  ["custom-statistics", "Custom Statistics"],
  ["drawdown", "Drawdown"],
  ["efficiency", "Efficiency"],
  ["exit-analysis", "Exit Analysis"],
  ["holding-time", "Holding Time"],
  ["instrument", "Performance by Instrument"],
  ["setup", "Performance by Setup"],
  ["time", "Performance by Time"],
  ["day", "Performance by Day"],
  ["ratios", "Performance Ratio"],
  ["risk-distribution", "Risk Distribution"],
  ["sqn", "SQN"],
  ["trade-comments", "Trade Comments"],
  ["trade-management", "Trade Management"],
  ["win-rate", "Winrate Over Time"],
] as const;
export type ChartSlug = (typeof CHARTS)[number][0];

export const SETTINGS = [
  ["account", "Account"],
  ["sharing", "Mentors & Sharing"],
  ["journal", "Journal"],
  ["cashflows", "Deposits & Withdrawals"],
  ["instruments", "Instruments"],
  ["setups", "Setups"],
  ["comments", "Trade Comments"],
  ["rules", "Trading Rules"],
  ["sessions", "Sessions"],
  ["custom-statistics", "Custom Statistics"],
] as const;

export type NavChild = { label: string; to: string; params?: Record<string, string> };
export type NavItem = { label: string; icon: LucideIcon; to?: string; children?: NavChild[] };

export const NAV: NavItem[] = [
  { label: "Home", icon: Home, to: "/home" },
  { label: "Portfolio", icon: Briefcase, to: "/portfolio" },
  {
    label: "Journal",
    icon: BookOpen,
    children: [
      { label: "All trades", to: "/journal" },
      { label: "Open trades", to: "/open-trades" },
      { label: "Trading plans", to: "/plans" },
      { label: "Missed trades", to: "/missed-trades" },
      { label: "Missed trade analysis", to: "/missed-trades-analysis" },
      { label: "Notebook", to: "/diary/notebook" },
      { label: "Sessions", to: "/diary/sessions" },
    ],
  },
  {
    label: "Reports",
    icon: FileBarChart,
    children: [
      { label: "Trade analytics", to: "/analytics" },
      { label: "Equity graph", to: "/equity" },
      { label: "Edge Finder", to: "/edge-finder" },
      { label: "Rule compliance", to: "/rules" },
      { label: "Prop challenge", to: "/prop-challenge" },
      { label: "Milestones", to: "/milestones" },
      { label: "Calendar", to: "/reports/calendar" },
      { label: "Monthly reports", to: "/reports/monthly" },
      { label: "Annual report", to: "/reports/annual" },
      { label: "Chartbook", to: "/reports/chart-book" },
      ...CHARTS.map(([chart, label]) => ({
        label: `Chart Lab · ${label}`,
        to: "/chart-lab/$chart",
        params: { chart },
      })),
      { label: "Strategy Lab · Alternatives", to: "/strategy-lab/alternatives" },
      { label: "Strategy Lab · Backtester", to: "/strategy-lab/backtester" },
      { label: "Strategy Lab · Simulator", to: "/strategy-lab/simulator" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    children: SETTINGS.map(([section, label]) => ({
      label,
      to: "/settings/$section",
      params: { section },
    })),
  },
];

export function childPath(c: NavChild) {
  let p = c.to;
  Object.entries(c.params ?? {}).forEach(([k, v]) => (p = p.replace(`$${k}`, v)));
  return p;
}
