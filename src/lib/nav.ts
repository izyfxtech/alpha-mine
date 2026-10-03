import {
  Home, Briefcase, BookOpen, BarChart3, LineChart, BookMarked, NotebookPen, FlaskRound,
  FileBarChart, FlaskConical, Settings, type LucideIcon,
} from "lucide-react";

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
  ["journal", "Journal"],
  ["instruments", "Instruments"],
  ["setups", "Setups"],
  ["comments", "Trade Comments"],
  ["custom-statistics", "Custom Statistics"],
  ["sessions", "Session Categories"],
  ["cashflows", "Deposits & Withdrawals"],
] as const;

export type NavChild = { label: string; to: string; params?: Record<string, string> };
export type NavItem = { label: string; icon: LucideIcon; to?: string; children?: NavChild[] };

export const NAV: NavItem[] = [
  { label: "Home", icon: Home, to: "/home" },
  { label: "Portfolio", icon: Briefcase, to: "/portfolio" },
  { label: "Journal", icon: BookOpen, to: "/journal" },
  { label: "Trade Analytics", icon: BarChart3, to: "/analytics" },
  { label: "Equity Graph", icon: LineChart, to: "/equity" },
  {
    label: "Advanced Journaling", icon: BookMarked, children: [
      { label: "Trading Plans", to: "/plans" },
      { label: "Missed Trades", to: "/missed-trades" },
      { label: "Missed Trades Analysis", to: "/missed-trades-analysis" },
    ],
  },
  {
    label: "Diary", icon: NotebookPen, children: [
      { label: "Notebook", to: "/diary/notebook" },
      { label: "Sessions", to: "/diary/sessions" },
    ],
  },
  {
    label: "Chart Lab", icon: FlaskRound,
    children: CHARTS.map(([chart, label]) => ({ label, to: "/chart-lab/$chart", params: { chart } })),
  },
  {
    label: "Reports", icon: FileBarChart, children: [
      { label: "Calendar", to: "/reports/calendar" },
      { label: "Monthly Report", to: "/reports/monthly" },
      { label: "Chart Book", to: "/reports/chart-book" },
    ],
  },
  {
    label: "Strategy Lab", icon: FlaskConical, children: [
      { label: "Alternative Strategies", to: "/strategy-lab/alternatives" },
      { label: "Backtester", to: "/strategy-lab/backtester" },
      { label: "Simulator", to: "/strategy-lab/simulator" },
    ],
  },
  {
    label: "Settings", icon: Settings,
    children: SETTINGS.map(([section, label]) => ({ label, to: "/settings/$section", params: { section } })),
  },
];

export function childPath(c: NavChild) {
  let p = c.to;
  Object.entries(c.params ?? {}).forEach(([k, v]) => (p = p.replace(`$${k}`, v)));
  return p;
}
