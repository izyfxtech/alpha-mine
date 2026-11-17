import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { MenteeJournalProvider } from "@/lib/journal/journal-context";
import { MenteeOverview, MenteeTrades, TradeReview } from "@/components/mentor/MenteeJournal";
import { useMentorships } from "@/lib/mentor/hooks";
import { isLive } from "@/lib/mentor/scopes";
import { localDay } from "@/lib/time/local-time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mentor/$journalId")({
  validateSearch: (s: Record<string, unknown>): { trade?: string } =>
    typeof s.trade === "string" && s.trade ? { trade: s.trade } : {},
  head: () => ({
    meta: [{ title: "Student journal — EdgeWhiz" }, { name: "robots", content: "noindex" }],
  }),
  component: StudentJournal,
});

type Tab = "overview" | "trades";

function StudentJournal() {
  const { journalId } = Route.useParams();
  return (
    <MenteeJournalProvider journalId={journalId}>
      <Body journalId={journalId} />
    </MenteeJournalProvider>
  );
}

function Body({ journalId }: { journalId: string }) {
  const { trade } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [tab, setTab] = useState<Tab>(trade ? "trades" : "overview");
  const { all } = useMentorships();
  const m = all.find(
    (x) => x.role === "mentor" && x.grants.some((g) => g.journal_id === journalId && isLive(g)),
  );
  const grant = m?.grants.find((g) => g.journal_id === journalId);
  return (
    <div className="mx-auto max-w-[1374px] space-y-5">
      <div>
        <Link
          to="/mentor"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Your students
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{m?.otherName ?? "Student"}</h1>
      </div>
      <p className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Eye className="h-4 w-4 shrink-0" />
        You are viewing a journal shared with you. It is read only
        {grant?.expires_at ? `, and access ends on ${localDay(grant.expires_at)}` : ""}.
      </p>
      <div className="tf-tabs" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["trades", "Trades"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={cn("tf-tab")}
            data-active={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <MenteeOverview />
      ) : (
        <MenteeTrades onOpen={(id) => navigate({ search: { trade: id }, replace: true })} />
      )}
      <TradeReview tradeId={trade} onClose={() => navigate({ search: {}, replace: true })} />
    </div>
  );
}
