import type { ReactNode } from "react";
import { rBlankReason } from "@/lib/pnl/calc";
import { fmtPrice } from "@/lib/pnl/format-price";
import { localDateTime } from "@/lib/time/local-time";
import { fmtNum, isOpen, type Trade } from "@/lib/pnl/metrics";
import { COMPLIANCE_LABEL, complianceOf } from "@/lib/pnl/compliance";
import { TiltMeter } from "@/components/kit";
import { cn } from "@/lib/utils";
import type { JournalTableLayout } from "@/lib/journal/journal-table-layout";

export type Col = {
  k: string;
  l: string;
  get: (t: Trade) => string | number;
  render?: (t: Trade) => ReactNode;
  width?: number;
};
const num = (v: number, d: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const dt = (s: string | null) => localDateTime(s);
const pill = (t: Trade, txt: string) => (
  <span
    className={cn(
      "inline-block min-w-[38px] rounded-full px-2.5 py-[3px] text-center text-xs font-medium capitalize leading-none",
      t.net_pnl > 0
        ? "bg-pill-win text-profit"
        : t.net_pnl < 0
          ? "bg-pill-loss text-loss"
          : "bg-muted text-foreground",
    )}
  >
    {txt}
  </span>
);
const LEFT_COLS = [
  "rules",
  "instrument",
  "setup",
  "trade_type",
  "option_type",
  "direction",
  "entry_at",
  "exit_at",
  "tilt",
  "id",
  "notes",
];
export const alignRight = (k: string) => !LEFT_COLS.includes(k);
export const pnlText = (t: Trade) =>
  t.net_pnl > 0 ? "text-profit" : t.net_pnl < 0 ? "text-loss" : "text-foreground";
export const COLS: Col[] = [
  { k: "id", l: "Trade ID", get: (t) => t.id.slice(0, 8), width: 105 },
  {
    k: "entry_at",
    l: "Entry Date",
    get: (t) => t.entry_at,
    render: (t) => <span className={pnlText(t)}>{dt(t.entry_at)}</span>,
    width: 132,
  },
  {
    k: "exit_at",
    l: "Exit Date",
    get: (t) => t.exit_at ?? "",
    render: (t) =>
      isOpen(t) ? (
        <span className="rounded-full bg-muted px-2 py-[3px] text-xs font-medium">Open</span>
      ) : (
        <span className={pnlText(t)}>{dt(t.exit_at)}</span>
      ),
    width: 132,
  },
  { k: "instrument", l: "Instrument", get: (t) => t.instrument, width: 105 },
  {
    k: "trade_type",
    l: "Trade Type",
    get: (t) => t.trade_type,
    render: (t) => pill(t, t.trade_type),
  },
  {
    k: "option_type",
    l: "Option Type",
    get: (t) => (t.trade_type === "options" ? "Option" : ""),
    width: 100,
  },
  { k: "setup", l: "Setup", get: (t) => t.setup },
  { k: "tilt", l: "Tiltmeter", get: (t) => t.tilt, render: (t) => <TiltMeter value={t.tilt} /> },
  {
    k: "rules",
    l: "Rules",
    get: (t) => COMPLIANCE_LABEL[complianceOf(t.ruleChecks)],
    render: (t) => {
      const c = complianceOf(t.ruleChecks);
      return c === "unrated" ? (
        <span className="text-t4">—</span>
      ) : (
        <span
          className={cn(
            "text-xs font-medium",
            c === "followed" ? "text-profit" : c === "violated" ? "text-loss" : "text-amber-600",
          )}
        >
          {COMPLIANCE_LABEL[c]}
        </span>
      );
    },
  },
  { k: "direction", l: "Direction", get: (t) => t.direction, render: (t) => pill(t, t.direction) },
  { k: "quantity", l: "Quantity", get: (t) => t.quantity, render: (t) => num(t.quantity, 2) },
  {
    k: "entry_price",
    l: "Entry Price",
    get: (t) => t.entry_price,
    render: (t) => fmtPrice(t.entry_price),
  },
  {
    k: "exit_price",
    l: "Exit Price",
    get: (t) => t.exit_price ?? "",
    render: (t) => fmtPrice(t.exit_price),
  },
  {
    k: "take_profit",
    l: "TP Price",
    get: (t) => t.take_profit ?? "",
    render: (t) => fmtPrice(t.take_profit),
  },
  {
    k: "stop_loss",
    l: "SL Price",
    get: (t) => t.stop_loss ?? "",
    render: (t) => fmtPrice(t.stop_loss),
  },
  { k: "fees", l: "Fees ($)", get: (t) => t.fees, render: (t) => num(t.fees, 2) },
  { k: "gross_pnl", l: "Gross P&L", get: (t) => t.gross_pnl, render: (t) => num(t.gross_pnl, 2) },
  {
    k: "net_pnl",
    l: "Return ($)",
    get: (t) => t.net_pnl,
    render: (t) => <span className={pnlText(t)}>{num(t.net_pnl, 2)}</span>,
  },
  {
    k: "ret_pct",
    l: "Return (%)",
    get: (t) => t.retPct,
    render: (t) => <span className={pnlText(t)}>{num(t.retPct, 2)}</span>,
  },
  {
    k: "r",
    l: "R-Multiple",
    get: (t) => t.r ?? 0,
    render: (t) =>
      t.r != null ? (
        `${fmtNum(t.r)}R`
      ) : isOpen(t) ? (
        ""
      ) : t.rEst != null ? (
        <span
          className="italic text-muted-foreground"
          title={`Estimated from your typical risk. ${rBlankReason(t) ?? ""}`}
        >
          ~{fmtNum(t.rEst)}R est.
        </span>
      ) : (
        <span className="text-muted-foreground" title={rBlankReason(t) ?? ""}>
          —
        </span>
      ),
  },
  {
    k: "risk_amount",
    l: "Risk Amount",
    get: (t) => t.risk_amount ?? "",
    render: (t) => (t.risk_amount == null ? "" : num(Number(t.risk_amount), 2)),
  },
  {
    k: "notes",
    l: "Notes",
    get: (t) => t.notes ?? "",
    render: (t) => (
      <span className="inline-block max-w-48 truncate align-middle">{t.notes ?? ""}</span>
    ),
  },
];

/** The columns to show, in the user's order, without the ones they hid. */
export function visibleColumns(layout: JournalTableLayout): Col[] {
  const hidden = new Set(layout.hidden);
  return layout.order
    .map((key) => COLS.find((c) => c.k === key))
    .filter((c): c is Col => c !== undefined)
    .filter((c) => !hidden.has(c.k));
}

/** A column's width: what the user dragged it to, else its own default. */
export const columnWidth = (layout: JournalTableLayout, c: Col) =>
  layout.widths[c.k] ?? c.width ?? 110;

/** The table is as wide as its columns plus the checkbox, star and image columns. */
export const tableWidth = (layout: JournalTableLayout, cols: Col[]) =>
  cols.reduce((sum, c) => sum + columnWidth(layout, c), 96);
