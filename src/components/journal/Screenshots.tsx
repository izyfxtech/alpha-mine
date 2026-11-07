import { compressImage, makeThumbnail, thumbPath } from "@/lib/media/compress-image";
import { signPaths } from "@/lib/media/signed-urls";
import { MAX_SHOTS } from "@/lib/media/limits";
import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";
import { sweepStorage } from "@/lib/media/sweep-storage";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbox } from "@/components/journal/Lightbox";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

export interface Shot {
  id: string;
  trade_id: string | null;
  missed_trade_id: string | null;
  planned_trade_id: string | null;
  path: string;
  caption: string | null;
  url: string;
  /** small preview for lists; falls back to the full image for screenshots saved before previews existed */ thumb: string;
}

/** Loads screenshots (with short-lived signed URLs) for the given journal, optionally one trade. */
export function useScreenshots(journalId?: string, tradeId?: string) {
  return useQuery({
    queryKey: ["screenshots", journalId, tradeId ?? "all"],
    enabled: !!journalId && tradeId !== "__none__",
    queryFn: async (): Promise<Shot[]> => {
      const data = await fetchAllRows<Database["public"]["Tables"]["trade_screenshots"]["Row"]>(
        (from, to, first) => {
          let q = supabase
            .from("trade_screenshots")
            .select("*", countOption(first))
            .eq("journal_id", journalId!)
            .order("created_at", { ascending: false })
            .order("id");
          if (tradeId) q = q.eq("trade_id", tradeId);
          return q.range(from, to) as never;
        },
      );
      if (!data.length) return [];
      const stored = data.filter((d) => !isExternal(d.path));
      // Full-size and preview urls are signed together and reused while valid (see signed-urls.ts), so the browser keeps its cached copy.
      const signed = await signPaths(stored.flatMap((d) => [d.path, thumbPath(d.path)]));
      return data.map((d) => {
        if (isExternal(d.path)) return { ...d, url: d.path, thumb: d.path };
        const url = signed.get(d.path) ?? "";
        return { ...d, url, thumb: signed.get(thumbPath(d.path)) ?? url };
      });
    },
    staleTime: 5 * 60_000, // a screenshot list rarely changes underneath you; writes invalidate it explicitly
    refetchOnWindowFocus: false, // switching tabs must not re-list and re-sign every screenshot
  });
}

/** If a preview fails to load (never made, or removed), show the full image instead; if that fails too, leave the broken-image box. */
export const fallbackToFull =
  (s: Pick<Shot, "url" | "thumb">) => (e: { currentTarget: HTMLImageElement }) => {
    const img = e.currentTarget;
    if (s.url && img.src !== s.url) img.src = s.url;
  };

const isExternal = (p: string) => /^https?:\/\//i.test(p);

/**
 * Compresses an image, uploads it and a small preview next to it, and returns the stored path. Files are named with a random id,
 * so a stored file never changes: the browser may keep it for a year.
 */
export async function storeImage(userId: string, ownerId: string, original: File): Promise<string> {
  const file = await compressImage(original);
  const path = `${userId}/${ownerId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await supabase.storage
    .from("screenshots")
    .upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
  if (up.error) throw up.error;
  const thumb = await makeThumbnail(file);
  if (thumb)
    await supabase.storage
      .from("screenshots")
      .upload(thumbPath(path), thumb, { cacheControl: "31536000", contentType: thumb.type }); // best effort: without it the list shows the full image
  return path;
}

/** Persists queued screenshots (files go to private storage, links are stored as-is). */
export async function saveShots(
  journalId: string,
  tradeId: string,
  items: { file?: File; url?: string }[],
) {
  if (!items.length) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  for (const it of items) {
    const path = it.file ? await storeImage(u.user.id, tradeId, it.file) : (it.url ?? "");
    const { error } = await supabase
      .from("trade_screenshots")
      .insert({ trade_id: tradeId, journal_id: journalId, path });
    if (error) throw error;
  }
}

/** Deletes the row; the database queues the file and the Storage API sweep removes it (see sweep-storage). */
export async function deleteShot(s: Pick<Shot, "id" | "path">) {
  const { error } = await supabase.from("trade_screenshots").delete().eq("id", s.id);
  if (error) throw error;
  if (!isExternal(s.path)) sweepStorage();
}

export function TradeScreenshots({ journalId, tradeId }: { journalId: string; tradeId?: string }) {
  const qc = useQueryClient();
  const { data: shots = [] } = useScreenshots(journalId, tradeId);
  const [open, setOpen] = useState<number | null>(null);
  if (!tradeId)
    return (
      <p className="text-sm text-muted-foreground">Save the trade first, then add screenshots.</p>
    );

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const available = MAX_SHOTS - shots.length;
    if (files.length > available) toast.error(`A trade can have at most ${MAX_SHOTS} screenshots`);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    for (const file of Array.from(files).slice(0, available)) {
      try {
        const path = await storeImage(u.user.id, tradeId!, file);
        const { error } = await supabase
          .from("trade_screenshots")
          .insert({ trade_id: tradeId!, journal_id: journalId, path });
        if (error) throw error;
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }
  async function remove(s: Shot) {
    try {
      await deleteShot(s);
    } catch (e) {
      return void toast.error((e as Error).message);
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }

  return (
    <div className="space-y-4">
      {shots.length < MAX_SHOTS && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/50">
          <ImagePlus className="h-6 w-6" /> Click to upload chart screenshots
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        {shots.map((s) => (
          <div key={s.id} className="group relative overflow-hidden rounded-lg border">
            <button
              type="button"
              className="block w-full"
              aria-label="Enlarge screenshot"
              onClick={() => setOpen(shots.indexOf(s))}
            >
              <img
                src={s.thumb}
                alt="Trade screenshot"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={fallbackToFull(s)}
                className="aspect-video w-full object-cover"
              />
            </button>
            <Button
              size="icon"
              variant="destructive"
              className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100"
              onClick={() => remove(s)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {open !== null && (
        <Lightbox
          items={shots.map((x, i) => ({
            url: x.url,
            title: `Screenshot ${i + 1} of ${shots.length}`,
          }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Upload and view screenshots attached to a missed or planned trade. */
export function RecordScreenshots({
  journalId,
  recordId,
  kind,
}: {
  journalId: string;
  recordId: string;
  kind: "missed_trade_id" | "planned_trade_id";
}) {
  const qc = useQueryClient();
  const { data = [] } = useScreenshots(journalId);
  const shots = data.filter((s) => s[kind] === recordId);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const available = MAX_SHOTS - shots.length;
    if (files.length > available) toast.error(`A record can have at most ${MAX_SHOTS} screenshots`);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    for (const file of Array.from(files).slice(0, available)) {
      let path: string;
      try {
        path = await storeImage(user.user.id, recordId, file);
      } catch (e) {
        toast.error((e as Error).message);
        continue;
      }
      const record =
        kind === "missed_trade_id" ? { missed_trade_id: recordId } : { planned_trade_id: recordId };
      const { error: saveError } = await supabase
        .from("trade_screenshots")
        .insert({ journal_id: journalId, ...record, path });
      if (saveError) toast.error(saveError.message);
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }
  return (
    <div className="col-span-2 space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">
        Screenshots ({shots.length}/{MAX_SHOTS})
      </p>
      {shots.length < MAX_SHOTS && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <ImagePlus className="h-4 w-4" /> Add screenshots{" "}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        {shots.map((s) => (
          <div key={s.id} className="relative">
            <a href={s.url} target="_blank" rel="noreferrer">
              <img
                src={s.thumb}
                alt="Record screenshot"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={fallbackToFull(s)}
                className="aspect-video w-full rounded-md border object-cover"
              />
            </a>
            <Button
              size="icon"
              variant="destructive"
              className="absolute right-1 top-1 h-6 w-6"
              aria-label="Delete screenshot"
              onClick={async () => {
                await deleteShot(s);
                qc.invalidateQueries({ queryKey: ["screenshots"] });
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
