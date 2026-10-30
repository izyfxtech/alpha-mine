/**
 * Rule compliance. Pure and deterministic: trades and their rule checks in, discipline numbers out.
 *
 * Each trade can carry one check per rule: followed, partial or violated (no check = not rated). The trade-level
 * status is DERIVED so it can never disagree with the checks:
 *   - any rule violated            -> "violated"
 *   - else any rule partial        -> "partial"
 *   - else at least one followed   -> "followed"
 *   - no checks                    -> "unrated"
 *
 * The "cost of rule-breaking" is reported three ways, because each answers a different question:
 *   1. violatedNet        what the trades that broke a rule made or lost in total (the plain fact),
 *   2. lossOnViolations   only the losing ones among them (what rule-breaking visibly cost),
 *   3. gap                an ESTIMATE of profit given up: violating trades x (your followed average - your violating
 *                         average). It needs enough trades on both sides and is withheld otherwise, because a handful
 *                         of trades is noise, not evidence. It is a comparison, not proof of cause.
 */
import { isWin, type Trade } from "@/lib/pnl/metrics";

export type RuleStatus = "followed" | "partial" | "violated";
export type Compliance = RuleStatus | "unrated";
export interface RuleCheck { rule_id: string; status: RuleStatus }
export interface RuleDef { id: string; name: string }

export const COMPLIANCE_LABEL: Record<Compliance, string> = { followed: "Followed", partial: "Partial", violated: "Violated", unrated: "Not rated" };
export const MIN_FOLLOWED = 5;
export const MIN_VIOLATED = 3;

export function complianceOf(checks: readonly RuleCheck[]): Compliance {
  if (!checks.length) return "unrated";
  if (checks.some((c) => c.status === "violated")) return "violated";
  if (checks.some((c) => c.status === "partial")) return "partial";
  return "followed";
}

export interface Bucket { n: number; net: number; avgNet: number; winRate: number; avgR: number | null }

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export function bucket(ts: Trade[]): Bucket {
  const rs = ts.map((t) => t.r).filter((r): r is number => r != null);
  const net = sum(ts.map((t) => t.net_pnl));
  return { n: ts.length, net, avgNet: ts.length ? net / ts.length : 0, winRate: ts.length ? (ts.filter(isWin).length / ts.length) * 100 : 0, avgR: rs.length ? sum(rs) / rs.length : null };
}

export interface RuleRow {
  id: string;
  name: string;
  rated: number;
  followed: number;
  partial: number;
  violated: number;
  /** violated / rated, in percent. */
  violationRate: number;
  /** Net P&L of the trades that violated this rule. */
  violatedNet: number;
  /** Average net of trades that violated it / of trades where it was followed (null when there are none). */
  avgViolated: number | null;
  avgFollowed: number | null;
}

export interface ComplianceReport {
  total: number;
  rated: number;
  unrated: number;
  byStatus: Record<Compliance, Bucket>;
  /** Share of RATED trades that followed every rule they were checked against, in percent. */
  adherencePct: number;
  cost: {
    violatedNet: number;
    lossOnViolations: number;
    /** Estimated profit given up (negative = money left on the table), or null when the sample is too small. */
    gap: number | null;
    enough: boolean;
  };
  rules: RuleRow[];
  /** Trades per violated rule, so the UI can drill down. */
  tradesByRule: Map<string, Trade[]>;
}

export function complianceReport(trades: Trade[], rules: readonly RuleDef[]): ComplianceReport {
  const status = (t: Trade) => complianceOf(t.ruleChecks);
  const groups: Record<Compliance, Trade[]> = { followed: [], partial: [], violated: [], unrated: [] };
  for (const t of trades) groups[status(t)].push(t);
  const byStatus = Object.fromEntries((Object.keys(groups) as Compliance[]).map((k) => [k, bucket(groups[k])])) as Record<Compliance, Bucket>;
  const rated = trades.length - groups.unrated.length;

  const enough = groups.followed.length >= MIN_FOLLOWED && groups.violated.length >= MIN_VIOLATED;
  const nets = groups.violated.map((t) => t.net_pnl);
  const gap = enough ? groups.violated.length * (byStatus.followed.avgNet - byStatus.violated.avgNet) : null;

  const tradesByRule = new Map<string, Trade[]>();
  const rows: RuleRow[] = rules.map((r) => {
    const mine = trades.map((t) => ({ t, c: t.ruleChecks.find((x) => x.rule_id === r.id) })).filter((x): x is { t: Trade; c: RuleCheck } => !!x.c);
    const v = mine.filter((x) => x.c.status === "violated").map((x) => x.t);
    const f = mine.filter((x) => x.c.status === "followed").map((x) => x.t);
    tradesByRule.set(r.id, v);
    return {
      id: r.id, name: r.name, rated: mine.length, followed: f.length, partial: mine.filter((x) => x.c.status === "partial").length, violated: v.length,
      violationRate: mine.length ? (v.length / mine.length) * 100 : 0,
      violatedNet: sum(v.map((t) => t.net_pnl)),
      avgViolated: v.length ? sum(v.map((t) => t.net_pnl)) / v.length : null,
      avgFollowed: f.length ? sum(f.map((t) => t.net_pnl)) / f.length : null,
    };
  });
  // Most expensive rule first: that is the one to work on.
  rows.sort((a, b) => a.violatedNet - b.violatedNet || b.violated - a.violated);

  return {
    total: trades.length, rated, unrated: groups.unrated.length, byStatus,
    adherencePct: rated ? (groups.followed.length / rated) * 100 : 0,
    cost: { violatedNet: sum(nets), lossOnViolations: sum(nets.filter((n) => n < 0)), gap, enough },
    rules: rows, tradesByRule,
  };
}

/** Suggested starter rules (offered, never added silently). */
export const STARTER_RULES: { name: string; description: string }[] = [
  { name: "Stop loss set before entry", description: "A protective stop was placed when the trade was opened." },
  { name: "Risk within plan", description: "Position size did not exceed the planned risk per trade." },
  { name: "Only planned setups", description: "The trade matches a setup from my trading plan." },
  { name: "Waited for confirmation", description: "Entered on the trigger, not before it." },
  { name: "No revenge trade", description: "Not taken to win back a recent loss." },
];
