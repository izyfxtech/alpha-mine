import { useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import type { Shot } from "@/components/Screenshots";

/** A screenshot waiting to be saved: either a file or an external URL. */
export type PendingShot = { key: string; file?: File; url?: string; preview: string };

const MIN_SLOTS = 4;

export function ScreenshotSlots({ existing, pending, onAdd, onRemoveExisting, onRemovePending }: {
  existing: Shot[]; pending: PendingShot[];
  onAdd: (p: PendingShot[]) => void; onRemoveExisting: (s: Shot) => void; onRemovePending: (key: string) => void;
}) {
  const filled = [
    ...existing.map((s) => ({ key: s.id, preview: s.url, remove: () => onRemoveExisting(s) })),
    ...pending.map((p) => ({ key: p.key, preview: p.preview, remove: () => onRemovePending(p.key) })),
  ];
  const empty = Math.min(6 - filled.length, Math.max(MIN_SLOTS - filled.length, 1));
  const addLimited = (items: PendingShot[]) => {
    const available = 6 - filled.length;
    if (items.length > available) toast.error("A trade can have at most 6 screenshots");
    onAdd(items.slice(0, available));
  };
  return (
    <div className="space-y-6">
      {filled.map((f) => (
        <div key={f.key} className="tf-drop relative p-2">
          <img src={f.preview} alt="Trade screenshot" className="max-h-64 w-full rounded-[3px] object-contain" />
          <button type="button" onClick={f.remove} aria-label="Remove screenshot"
            className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-ink text-ink-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {Array.from({ length: empty }).map((_, i) => <EmptySlot key={i} onAdd={addLimited} />)}
    </div>
  );
}

function fromFiles(files: FileList | File[]): PendingShot[] {
  return Array.from(files).filter((f) => f.type.startsWith("image/")).map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
}

function EmptySlot({ onAdd }: { onAdd: (p: PendingShot[]) => void }) {
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const addUrl = () => {
    const v = url.trim();
    if (!v) return;
    if (!/^https?:\/\/\S+$/i.test(v)) { toast.error("Paste a valid image link (https://…)"); return; }
    onAdd([{ key: crypto.randomUUID(), url: v, preview: v }]);
    setUrl("");
  };
  return (
    <div className="tf-drop" data-over={over}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onAdd(fromFiles(e.dataTransfer.files)); }}>
      <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-dashed border-muted-foreground text-muted-foreground"><ArrowUp className="h-4 w-4" /></div>
      <p className="mt-3 text-[13px]">Drop image to upload or</p>
      <label className="mt-2 inline-flex h-[30px] cursor-pointer items-center rounded-[4px] border border-input px-3 text-[12px] hover:bg-muted">
        Select file
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) onAdd(fromFiles(e.target.files)); e.target.value = ""; }} />
      </label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste URL or Image from Clipboard"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} onBlur={addUrl}
        onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); onAdd(fromFiles(files)); } }}
        className="mt-4 h-[34px] w-full rounded-[4px] border border-input bg-card px-3 text-[12.5px] outline-none placeholder:text-foreground focus:border-foreground" />
    </div>
  );
}
