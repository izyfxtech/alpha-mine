import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal-context";
import { useProfile } from "@/lib/profile-settings";

/** Create, copy, or switch off a read-only public link to the current journal's performance. */
export function ShareJournal() {
  const [open, setOpen] = useState(false);
  const { journal } = useJournal();
  const allowSharing = useProfile().settings.allowSharing;
  if (!allowSharing) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="hidden h-8 lg:inline-flex" onClick={() => setOpen(true)} disabled={!journal}><Share2 className="h-4 w-4" />Share Journal</Button>
      <ShareJournalDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The share dialog on its own, so it can also be opened from the account menu. */
export function ShareJournalDialog({ open, onOpenChange: setOpen }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { journal } = useJournal();
  const allowSharing = useProfile().settings.allowSharing;
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !journal) return;
    supabase.from("journals").select("share_token").eq("id", journal.id).single().then(({ data }) => setToken(data?.share_token ?? null));
  }, [open, journal]);

  const setShare = async (v: string | null) => {
    if (!journal) return;
    setBusy(true);
    const { error } = await supabase.from("journals").update({ share_token: v }).eq("id", journal.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setToken(v);
    toast.success(v ? "Share link created" : "Share link switched off");
  };
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  if (!allowSharing) return null;
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share “{journal?.name}”</DialogTitle>
            <DialogDescription>Anyone with the link can see this journal's results, equity graph and recent closed trades. Notes, screenshots and prices stay private.</DialogDescription>
          </DialogHeader>
          {token ? (
            <div className="space-y-3">
              <div className="flex gap-2"><Input readOnly value={url} onFocus={(e) => e.target.select()} /><Button variant="ink" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied"); }}>Copy</Button></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setShare(crypto.randomUUID())}>Create new link</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setShare(null)}>Stop sharing</Button>
              </div>
            </div>
          ) : (
            <Button variant="ink" disabled={busy} onClick={() => setShare(crypto.randomUUID())}>Create share link</Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
