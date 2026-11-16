import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { Empty } from "@/components/kit";
import { InviteStudentDialog } from "@/components/mentor/InviteStudentDialog";
import { Button } from "@/components/ui/button";
import { useMyStudents, type StudentRow } from "@/lib/mentor/hooks";
import { fmtMoney, fmtPct } from "@/lib/pnl/metrics";
import { localDay } from "@/lib/time/local-time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mentor/")({
  head: () => ({ meta: [{ title: "Mentor — AlphaMine" }, { name: "robots", content: "noindex" }] }),
  component: StudentList,
});

function StudentList() {
  const { data: rows = [], isLoading, error } = useMyStudents();
  const [inviting, setInviting] = useState(false);
  const byStudent = useMemo(() => {
    const m = new Map<string, StudentRow[]>();
    for (const r of rows) m.set(r.student_id, [...(m.get(r.student_id) ?? []), r]);
    return [...m.values()];
  }, [rows]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Your students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Journals that traders have shared with you. You can read them and leave feedback; you
            cannot change anything in them.
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" /> Invite a student
        </Button>
      </div>
      {error && (
        <p className="text-sm text-loss">
          Could not load your students: {(error as Error).message}
        </p>
      )}
      {!isLoading && !error && !byStudent.length && (
        <Empty>
          <p className="text-base font-semibold text-foreground">
            No student has shared a journal with you
          </p>
          <p className="mt-1">
            Invite a student with a link, or ask them to invite you from Settings → Mentors &
            Sharing.
          </p>
        </Empty>
      )}
      {byStudent.map((journals) => (
        <section
          key={journals[0]!.student_id}
          className="space-y-2"
          aria-label={journals[0]!.student_name}
        >
          <h2 className="text-sm font-semibold">{journals[0]!.student_name}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {journals.map((j) => (
              <Link
                key={j.journal_id}
                to="/mentor/$journalId"
                params={{ journalId: j.journal_id }}
                className="block rounded-lg bg-card p-4 shadow-[0_1px_5px_rgba(60,40,90,0.07)] hover:bg-muted/40"
              >
                <p className="font-semibold">{j.journal_name}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Trades</dt>
                    <dd className="tabular">{j.trades}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Win rate</dt>
                    <dd className="tabular">
                      {j.wins != null && j.trades ? fmtPct((j.wins / j.trades) * 100) : "–"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Net P&L</dt>
                    <dd
                      className={cn(
                        "tabular",
                        (j.net_pnl ?? 0) > 0 && "text-profit",
                        (j.net_pnl ?? 0) < 0 && "text-loss",
                      )}
                    >
                      {j.net_pnl == null ? "–" : fmtMoney(j.net_pnl, j.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase text-muted-foreground">Last trade</dt>
                    <dd className="tabular">{j.last_trade_at ? localDay(j.last_trade_at) : "–"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {j.open_threads
                    ? `${j.open_threads} open thread${j.open_threads === 1 ? "" : "s"} · `
                    : ""}
                  Access{" "}
                  {j.expires_at ? `until ${localDay(j.expires_at)}` : "until the student stops it"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <InviteStudentDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
