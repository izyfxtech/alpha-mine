import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Pencil, Reply, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/ui/confirm";
import { useCanEdit } from "@/lib/journal/journal-context";
import { invalidateData } from "@/lib/journal/query-cache";
import { useProfile } from "@/lib/profile-settings";
import { localDateTime } from "@/lib/time/local-time";
import {
  deleteFeedback,
  editFeedback,
  postFeedback,
  resolveFeedback,
  type TargetType,
} from "@/lib/mentor/api";
import { useFeedback, type FeedbackRow } from "@/lib/mentor/hooks";
import { cn } from "@/lib/utils";

const MAX = 4000;
/** The database lets an author change or remove their own words for this long; after that only the journal owner can delete. */
export const EDIT_WINDOW_MS = 15 * 60_000;

const box =
  "min-h-[72px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Composer({
  placeholder,
  submitLabel,
  initial = "",
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ok = text.trim().length > 0 && text.length <= MAX && !busy;
  async function send() {
    if (!ok) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <textarea
        className={box}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!ok} onClick={send}>
          {busy ? "Sending…" : submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular">
          {text.length}/{MAX}
        </span>
      </div>
    </div>
  );
}

function Message({
  row,
  isOwner,
  myId,
  canResolve,
  onChanged,
  onReply,
}: {
  row: FeedbackRow;
  isOwner: boolean;
  myId: string | undefined;
  canResolve: boolean;
  onChanged: () => void;
  onReply?: () => void;
}) {
  const { confirm } = useDialogs();
  const [editing, setEditing] = useState(false);
  const mine = !!myId && row.author_id === myId;
  // Read once when the message appears: the window is 15 minutes, and the database decides when you click.
  const [now] = useState(Date.now);
  const fresh = now - new Date(row.created_at).getTime() < EDIT_WINDOW_MS;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className={cn("rounded-md border p-3", row.resolved_at && "opacity-70")}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{mine ? "You" : row.author_name || "Mentor"}</span>
        <span className="text-muted-foreground">{localDateTime(row.created_at)}</span>
      </div>
      {editing ? (
        <div className="mt-2">
          <Composer
            placeholder="Edit your feedback"
            submitLabel="Save"
            initial={row.body}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (b) => {
              await editFeedback(row.id, b);
              setEditing(false);
              onChanged();
            }}
          />
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{row.body}</p>
      )}
      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          {onReply && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onReply}>
              <Reply className="h-3.5 w-3.5" /> Reply
            </Button>
          )}
          {canResolve && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2"
              onClick={() => run(() => resolveFeedback(row.id, !row.resolved_at))}
            >
              {row.resolved_at ? (
                <Undo2 className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {row.resolved_at ? "Reopen" : "Mark resolved"}
            </Button>
          )}
          {mine && fresh && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {((mine && fresh) || isOwner) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2"
              aria-label="Delete this feedback"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Delete this feedback?",
                    message: row.parent_id
                      ? "Only this reply is deleted."
                      : "The whole thread is deleted with it.",
                    destructive: true,
                  })
                )
                  await run(() => deleteFeedback(row.id));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          {row.resolved_at && <span className="ml-auto text-muted-foreground">Resolved</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The feedback on one trade (or diary session or journal): threads of one level, a reply box per thread and a box for a new thread.
 * Both the student (in the trade drawer) and the mentor (in the review panel) use it. What each person may do is decided by the
 * database; the buttons only mirror it. Inside a shared journal the signed-in person is the mentor; in their own journal they are the owner.
 */
export function FeedbackThread({
  journalId,
  targetType,
  targetId,
  className,
}: {
  journalId: string;
  targetType: TargetType;
  targetId: string | null;
  className?: string;
}) {
  const qc = useQueryClient();
  const isOwner = useCanEdit(); // false inside a shared journal
  const myId = useProfile().profile?.id;
  const { data: rows = [], isLoading, error } = useFeedback(journalId, targetType, targetId);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const changed = () => invalidateData(qc, "feedback");
  const roots = rows.filter((r) => !r.parent_id);

  if (error)
    return <p className="text-sm text-loss">Could not load feedback: {(error as Error).message}</p>;
  return (
    <div className={cn("space-y-3", className)}>
      {isLoading && <p className="text-sm text-muted-foreground">Loading feedback…</p>}
      {!isLoading && !roots.length && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          {isOwner ? "No feedback on this yet." : "No feedback yet. Start the conversation below."}
        </p>
      )}
      {roots.map((root) => {
        const replies = rows.filter((r) => r.parent_id === root.id);
        return (
          <div key={root.id} className="space-y-2">
            <Message
              row={root}
              isOwner={isOwner}
              myId={myId}
              canResolve={isOwner || root.author_id === myId}
              onChanged={changed}
              onReply={() => setReplyTo(replyTo === root.id ? null : root.id)}
            />
            {(replies.length > 0 || replyTo === root.id) && (
              <div className="ml-4 space-y-2 border-l pl-3">
                {replies.map((r) => (
                  <Message
                    key={r.id}
                    row={r}
                    isOwner={isOwner}
                    myId={myId}
                    canResolve={false}
                    onChanged={changed}
                  />
                ))}
                {replyTo === root.id && (
                  <Composer
                    placeholder="Write a reply"
                    submitLabel="Reply"
                    autoFocus
                    onCancel={() => setReplyTo(null)}
                    onSubmit={async (body) => {
                      await postFeedback({
                        journalId,
                        targetType,
                        targetId,
                        body,
                        parentId: root.id,
                      });
                      setReplyTo(null);
                      changed();
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      <Composer
        placeholder={isOwner ? "Ask your mentor something" : "Write feedback on this trade"}
        submitLabel={isOwner ? "Post a note" : "Post feedback"}
        onSubmit={async (body) => {
          await postFeedback({ journalId, targetType, targetId, body });
          changed();
        }}
      />
    </div>
  );
}
