import { useState } from "react";
import { toast } from "sonner";
import { LinkBox } from "@/components/mentor/LinkBox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInvite } from "@/lib/mentor/api";
import { DEFAULT_SCOPES, inviteUrl } from "@/lib/mentor/scopes";

/** A mentor invites a student. The student chooses which journals and what to share when they accept, so nothing is chosen here. */
export function InviteStudentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setUrl(null);
    onClose();
  };
  async function create() {
    setBusy(true);
    try {
      setUrl(
        inviteUrl(await createInvite({ role: "mentor", scopes: DEFAULT_SCOPES, accessDays: 90 })),
      );
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
          <DialogTitle>Invite a student</DialogTitle>
        </DialogHeader>
        {url ? (
          <div className="space-y-3">
            <LinkBox url={url} />
            <Button className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a link and send it to your student. They sign in (or sign up), choose which
              journals to share and for how long, and you see them on this page. You never see more
              than they choose.
            </p>
            <Button className="w-full" disabled={busy} onClick={create}>
              {busy ? "Creating…" : "Create invite link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
