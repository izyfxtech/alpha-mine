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

export type NavItem = {
  label: string;
  icon: LucideIcon;
  to: string;
  params?: Record<string, string>;
  matches?: string[];
};

export const NAV: NavItem[] = [
  { label: "Home", icon: Home, to: "/home" },
  { label: "Portfolio", icon: Briefcase, to: "/portfolio" },
  {
    label: "Journal",
    icon: BookOpen,
    to: "/journal",
    matches: ["/journal", "/open-trades", "/plans", "/missed-trades", "/diary", "/mentor"],
  },
  {
    label: "Reports",
    icon: FileBarChart,
    to: "/reports",
    matches: [
      "/reports",
      "/analytics",
      "/equity",
      "/chart-lab",
      "/edge-finder",
      "/rules",
      "/prop-challenge",
      "/milestones",
      "/strategy-lab",
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    to: "/settings/$section",
    params: { section: "account" },
    matches: ["/settings"],
  },
];
