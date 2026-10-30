import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, PageHeader, Panel, Stat, pnlText, pnlTone } from "@/components/kit";
import { useDrillDown } from "@/lib/journal/drilldown";
import { useLookups, useTrades } from "@/lib/journal/journal-context";
import { COMPLIANCE_LABEL, MIN_FOLLOWED, MIN_VIOLATED, complianceReport, type Compliance } from "@/lib/pnl/compliance";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/pnl/metrics";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({ meta: [{ title: "Rule Compliance — AlphaMine" }, { name: "description", content: "How often you follow your trading rules and what breaking them costs." }] }),
  component: RulesPage,
});

const ORDER: Compliance[] = ["followed", "partial", "violated", "unrated"];

function RulesPage() {
  const { trades, journal } = useTrades();
  const { data: lk } = useLookups(journal?.id);
  const drill = useDrillDown();
  const rules = lk?.all.rules ?? [];
  const rep = useMemo(() => complianceReport(trades, rules), [trades, rules]);
  if (!journal) return null;
  const cur = journal.currency;
  if (!rules.length) return <div><PageHeader title="Rule Compliance" /><Empty>No rules yet. <Link to="/settings/$section" params={{ section: "rules" }} className="underline">Add your trading rules</Link>, then rate each trade in the trade drawer.</Empty></div>;
  const c = rep.cost;
  return (
    <div>
      <PageHeader title="Rule Compliance" subtitle="Rate trades against your rules in the trade drawer. Open trades are excluded. Filters apply." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Adherence (rated trades)" value={rep.rated ? fmtPct(rep.adherencePct) : "—"} />
        <Stat label="Rated trades" value={`${rep.rated} of ${rep.total}`} />
        <Stat label="Net P&L of violated trades" value={fmtMoney(c.violatedNet, cur)} tone={pnlTone(c.violatedNet)} />
        <Stat label="Losses on violated trades" value={fmtMoney(c.lossOnViolations, cur)} tone={c.lossOnViolations < 0 ? "neg" : undefined} />
      </div>
      <Panel title="Cost of rule-breaking">
        {c.enough && c.gap != null ? (
          <p className="text-sm">Trades that broke a rule averaged <b className={pnlText(rep.byStatus.violated.avgNet)}>{fmtMoney(rep.byStatus.violated.avgNet, cur)}</b>, against <b className={pnlText(rep.byStatus.followed.avgNet)}>{fmtMoney(rep.byStatus.followed.avgNet, cur)}</b> when you followed every rule. Across your {rep.byStatus.violated.n} violations that is an estimated <b className={pnlText(c.gap)}>{fmtMoney(c.gap, cur)}</b> {c.gap >= 0 ? "given up" : "gained"} by not following your rules.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough data for an estimate yet. It needs at least {MIN_FOLLOWED} fully-followed and {MIN_VIOLATED} violated trades; you have {rep.byStatus.followed.n} and {rep.byStatus.violated.n}.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">An estimate from averages, not proof: rule-breaking trades may also differ in market conditions or size.</p>
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By trade status">
          <table className="w-full text-[13px]"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Status</th><th>Trades</th><th>Win rate</th><th>Avg R</th><th>Avg P&L</th><th>Net</th></tr></thead>
            <tbody>{ORDER.map((k) => { const b = rep.byStatus[k]; return (
              <tr key={k} className="border-t">
                <td className="py-1.5">{k === "unrated" ? COMPLIANCE_LABEL[k] : <button className="underline-offset-2 hover:underline" onClick={() => drill({ compliance: [k] })}>{COMPLIANCE_LABEL[k]}</button>}</td>
                <td>{b.n}</td><td>{b.n ? fmtPct(b.winRate) : "—"}</td><td>{b.avgR == null ? "—" : fmtNum(b.avgR)}</td>
                <td className={`tabular ${pnlText(b.avgNet)}`}>{b.n ? fmtMoney(b.avgNet, cur) : "—"}</td><td className={`tabular ${pnlText(b.net)}`}>{fmtMoney(b.net, cur)}</td>
              </tr>); })}</tbody></table>
        </Panel>
        <Panel title="By rule (most expensive first)">
          <table className="w-full text-[13px]"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Rule</th><th>Rated</th><th>Followed</th><th>Violated</th><th>Cost</th></tr></thead>
            <tbody>{rep.rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{r.name}</td><td>{r.rated}</td><td>{r.followed}</td>
                <td>{r.violated ? <button className="underline-offset-2 hover:underline" title="Show these trades in the journal" onClick={() => drill({ violated: [r.id] })}>{r.violated} ({fmtPct(r.violationRate)})</button> : 0}</td>
                <td className={`tabular ${pnlText(r.violatedNet)}`}>{r.violated ? fmtMoney(r.violatedNet, cur) : "—"}</td>
              </tr>))}</tbody></table>
          <p className="mt-2 text-xs text-muted-foreground">Click a status or a violation count to open those trades in the journal.</p>
        </Panel>
      </div>
    </div>
  );
}
