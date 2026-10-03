import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export interface Shot { id: string; trade_id: string | null; missed_trade_id: string | null; planned_trade_id: string | null; path: string; caption: string | null; url: string }

/** Loads screenshots (with short-lived signed URLs) for the given journal, optionally one trade. */
export function useScreenshots(journalId?: string, tradeId?: string) {
  return useQuery({
    queryKey: ["screenshots", journalId, tradeId ?? "all"],
    enabled: !!journalId && tradeId !== "__none__",
    queryFn: async (): Promise<Shot[]> => {
      let q = supabase.from("trade_screenshots").select("*").eq("journal_id", journalId!).order("created_at", { ascending: false });
      if (tradeId) q = q.eq("trade_id", tradeId);
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) return [];
      const stored = data.filter((d) => !isExternal(d.path));
      const { data: signed } = stored.length ? await supabase.storage.from("screenshots").createSignedUrls(stored.map((d) => d.path), 3600) : { data: [] };
      const map = new Map(stored.map((d, i) => [d.id, signed?.[i]?.signedUrl ?? ""]));
      return data.map((d) => ({ ...d, url: isExternal(d.path) ? d.path : map.get(d.id) ?? "" }));
    },
  });
}

const isExternal = (p: string) => /^https?:\/\//i.test(p);

/** Persists queued screenshots (files go to private storage, links are stored as-is). */
export async function saveShots(journalId: string, tradeId: string, items: { file?: File; url?: string }[]) {
  if (!items.length) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  for (const it of items) {
    let path = it.url ?? "";
    if (it.file) {
      path = `${u.user.id}/${tradeId}/${crypto.randomUUID()}-${it.file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("screenshots").upload(path, it.file);
      if (up.error) throw up.error;
    }
    const { error } = await supabase.from("trade_screenshots").insert({ trade_id: tradeId, journal_id: journalId, path });
    if (error) throw error;
  }
}

export async function deleteShot(s: Pick<Shot, "id" | "path">) {
  if (!isExternal(s.path)) await supabase.storage.from("screenshots").remove([s.path]);
  await supabase.from("trade_screenshots").delete().eq("id", s.id);
}

export function TradeScreenshots({ journalId, tradeId }: { journalId: string; tradeId?: string }) {
  const qc = useQueryClient();
  const { data: shots = [] } = useScreenshots(journalId, tradeId);
  if (!tradeId) return <p className="text-sm text-muted-foreground">Save the trade first, then add screenshots.</p>;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const available = 6 - shots.length;
    if (files.length > available) toast.error("A trade can have at most 6 screenshots");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    for (const file of Array.from(files).slice(0, available)) {
      const path = `${u.user.id}/${tradeId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("screenshots").upload(path, file);
      if (up.error) { toast.error(up.error.message); continue; }
      await supabase.from("trade_screenshots").insert({ trade_id: tradeId!, journal_id: journalId, path });
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }
  async function remove(s: Shot) {
    await deleteShot(s);
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }

  return (
    <div className="space-y-4">
      {shots.length < 6 && <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/50">
        <ImagePlus className="h-6 w-6" /> Click to upload chart screenshots
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </label>}
      <div className="grid grid-cols-2 gap-3">
        {shots.map((s) => (
          <div key={s.id} className="group relative overflow-hidden rounded-lg border">
            <a href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt="Trade screenshot" className="aspect-video w-full object-cover" /></a>
            <Button size="icon" variant="destructive" className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Upload and view screenshots attached to a missed or planned trade. */
export function RecordScreenshots({ journalId, recordId, kind }: { journalId: string; recordId: string; kind: "missed_trade_id" | "planned_trade_id" }) {
  const qc = useQueryClient();
  const { data = [] } = useScreenshots(journalId);
  const shots = data.filter((s) => s[kind] === recordId);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const available = 6 - shots.length;
    if (files.length > available) toast.error("A record can have at most 6 screenshots");
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    for (const file of Array.from(files).slice(0, available)) {
      const path = `${user.user.id}/${recordId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("screenshots").upload(path, file);
      if (error) { toast.error(error.message); continue; }
      const record = kind === "missed_trade_id" ? { missed_trade_id: recordId } : { planned_trade_id: recordId };
      const { error: saveError } = await supabase.from("trade_screenshots").insert({ journal_id: journalId, ...record, path });
      if (saveError) toast.error(saveError.message);
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }
  return <div className="col-span-2 space-y-2 border-t pt-3">
    <p className="text-sm font-semibold">Screenshots ({shots.length}/6)</p>
    {shots.length < 6 && <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"><ImagePlus className="h-4 w-4" /> Add screenshots <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>}
    <div className="grid grid-cols-2 gap-2">{shots.map((s) => <div key={s.id} className="relative"><a href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt="Record screenshot" className="aspect-video w-full rounded-md border object-cover" /></a><Button size="icon" variant="destructive" className="absolute right-1 top-1 h-6 w-6" aria-label="Delete screenshot" onClick={async () => { await deleteShot(s); qc.invalidateQueries({ queryKey: ["screenshots"] }); }}><Trash2 className="h-3 w-3" /></Button></div>)}</div>
  </div>;
}
