import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PauseCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AccessForm, type AccessChoice } from "@/components/mentor/AccessForm";
import { LinkBox } from "@/components/mentor/LinkBox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogs } from "@/components/ui/confirm";
import { card } from "@/components/settings/settings-kit";
import { useIsMentor, useMyMentors, useOpenInvites, type MentorshipView } from "@/lib/mentor/hooks";
import {
  createInvite,
  endMentorship,
  pauseAllMentors,
  revokeInvite,
  saveAccess,
} from "@/lib/mentor/api";
import { DEFAULT_SCOPES, inviteUrl, isLive, scopeLabel, type ScopeKey } from "@/lib/mentor/scopes";
import { useJournal } from "@/lib/journal/journal-context";
import { invalidateData } from "@/lib/journal/query-cache";
import { localDay } from "@/lib/time/local-time";

const MONTH_MS = 30 * 24 * 3600_000;

function daysChoice(expires: string | null): number | null {
  if (!expires) return null;
  const left = new Date(expires).getTime() - Date.now();
  return [30, 90, 180].find((d) => left <= d * (MONTH_MS / 30) + 1000) ?? 180;
}

function whenText(g: { expires_at: string | null }) {
  return g.expires_at ? `until ${localDay(g.expires_at)}` : "until you stop it";
}

/** Settings → Mentors & Sharing: who can read your journals, and the one place to change or stop it. */
export function Mentors() {
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const { journals, journal } = useJournal();
  const { mentors } = useMyMentors();
  const { data: invites = [] } = useOpenInvites();
  const isMentor = useIsMentor();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MentorshipView | null>(null);
  const names = useMemo(() => new Map(journals.map((j) => [j.id, j.name])), [journals]);
  const changed = () => invalidateData(qc, "mentors", "feedback");
  const liveCount = mentors.reduce((n, m) => n + m.grants.filter((g) => isLive(g)).length, 0);

  async function stop(m: MentorshipView) {
    if (
      !(await confirm({
        title: `Stop sharing with ${m.otherName}?`,
        message:
          "They lose access to every journal at once. Feedback they already wrote stays in your journal.",
        destructive: true,
      }))
    )
      return;
    try {
      await endMentorship(m.id);
      toast.success(`${m.otherName} can no longer see your journals`);
      await changed();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function pauseAll() {
    if (
      !(await confirm({
        title: "Pause all mentors?",
        message:
          "Every mentor loses access right now. Their relationship stays, and you can share again whenever you like.",
        destructive: true,
      }))
    )
      return;
    try {
      const n = await pauseAllMentors();
      toast.success(n ? "All mentor access paused" : "No mentor had access");
      await changed();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Mentors & Sharing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Share journals with a mentor so they can review your trades and leave feedback. They can
            read what you choose and write feedback on your trades; they can never change your data.
          </p>
        </div>
        <div className="flex gap-2">
          {liveCount > 0 && (
            <Button variant="outline" onClick={pauseAll}>
              <PauseCircle className="h-4 w-4" /> Pause all mentors
            </Button>
          )}
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" /> Invite a mentor
          </Button>
        </div>
      </div>

      <section className={`${card} divide-y`} aria-label="Your mentors">
        {mentors.map((m) => {
          const live = m.grants.filter((g) => isLive(g));
          return (
            <div key={m.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{m.otherName}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                    Change access
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => stop(m)}>
                    Stop sharing
                  </Button>
                </div>
              </div>
              {live.length ? (
                live.map((g) => (
                  <p key={g.journal_id} className="text-sm">
                    <span className="font-medium">{names.get(g.journal_id) ?? "A journal"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {g.scopes.map(scopeLabel).join(", ")} · {whenText(g)}
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing is shared right now.</p>
              )}
            </div>
          );
        })}
        {!mentors.length && (
          <p className="p-4 text-sm text-muted-foreground">
            You are not sharing with anyone. Invite a mentor to get started.
          </p>
        )}
      </section>

      {invites.length > 0 && (
        <section className="space-y-2" aria-label="Open invites">
          <h2 className="text-sm font-semibold">Invites waiting to be accepted</h2>
          <div className={`${card} divide-y`}>
            {invites.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  {i.inviter_role === "student" ? "Invite to a mentor" : "Invite to a student"}
                  <span className="text-muted-foreground">
                    {" "}
                    · sent {localDay(i.created_at)} · expires {localDay(i.expires_at)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await revokeInvite(i.id);
                      await changed();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Cancel invite
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {isMentor && (
        <p className="text-sm text-muted-foreground">
          You also mentor other traders.{" "}
          <Link to="/mentor" className="underline">
            Open the Mentor page
          </Link>
          .
        </p>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onDone={changed}
        defaultJournal={journal?.id}
      />
      <EditDialog mentorship={editing} onClose={() => setEditing(null)} onDone={changed} />
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  onDone,
  defaultJournal,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  defaultJournal?: string;
}) {
  const { journals } = useJournal();
  const [choice, setChoice] = useState<AccessChoice>({
    journalIds: defaultJournal ? [defaultJournal] : [],
    scopes: DEFAULT_SCOPES,
    days: 90,
  });
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setUrl(null);
    onClose();
  };
  async function create() {
    setBusy(true);
    try {
      const token = await createInvite({
        role: "student",
        journalIds: choice.journalIds,
        scopes: choice.scopes,
        accessDays: choice.days,
      });
      setUrl(inviteUrl(token));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a mentor</DialogTitle>
        </DialogHeader>
        {url ? (
          <div className="space-y-3">
            <LinkBox url={url} />
            <Button className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AccessForm journals={journals} value={choice} onChange={setChoice} />
            <Button
              className="w-full"
              disabled={busy || !choice.journalIds.length}
              onClick={create}
            >
              {busy ? "Creating…" : "Create invite link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  mentorship,
  onClose,
  onDone,
}: {
  mentorship: MentorshipView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { journals } = useJournal();
  const live = mentorship?.grants.filter((g) => isLive(g)) ?? [];
  const [choice, setChoice] = useState<AccessChoice | null>(null);
  const [busy, setBusy] = useState(false);
  // Start from what the mentor can see now each time the dialog opens for someone.
  const current: AccessChoice | null = mentorship
    ? {
        journalIds: live.map((g) => g.journal_id),
        scopes: (live[0]?.scopes ?? DEFAULT_SCOPES) as ScopeKey[],
        days: live.length ? daysChoice(live[0]!.expires_at) : 90,
      }
    : null;
  const value = choice ?? current;
  const close = () => {
    setChoice(null);
    onClose();
  };
  return (
    <Dialog open={!!mentorship} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Access for {mentorship?.otherName}</DialogTitle>
        </DialogHeader>
        {value && (
          <div className="space-y-4">
            <AccessForm journals={journals} value={value} onChange={setChoice} />
            <p className="text-xs text-muted-foreground">
              Unticking a journal stops that journal at once. Saving restarts the time limit.
            </p>
            <Button
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveAccess({
                    mentorshipId: mentorship!.id,
                    journalIds: value.journalIds,
                    scopes: value.scopes,
                    accessDays: value.days,
                  });
                  toast.success("Access updated");
                  onDone();
                  close();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
