import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { supabase } from "@/integrations/supabase/client";
import { useJournalTable } from "@/lib/crud";
import { Button } from "@/components/ui/button";
import { deleteShot, useScreenshots } from "@/components/Screenshots";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { useTrades } from "@/lib/journal-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/chart-book")({
  head: () => ({ meta: [{ title: "Chart Book — AlphaMine" }, { name: "description", content: "Browse screenshots by trade." }, { property: "og:title", content: "Chart Book — AlphaMine" }, { property: "og:description", content: "Browse screenshots by trade." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChartBook,
});

type Kind = "trades" | "missed" | "plans";
const KIND_FIELD = { trades: "trade_id", missed: "missed_trade_id", plans: "planned_trade_id" } as const;

function ChartBook() {
  const { trades, journal } = useTrades();
  const qc = useQueryClient();
  const { data: shots = [] } = useScreenshots(journal?.id);
  const missed = useJournalTable("missed_trades", journal?.id, "occurred_at", false);
  const plans = useJournalTable("planned_trades", journal?.id, "entry_at", false);
  const drawer = useTradeDrawer();
  const [selected, setSelected] = useState<{ kind: Kind; id: string } | null>(null);
  const [openSec, setOpenSec] = useState<Record<Kind, boolean>>({ trades: true, missed: true, plans: true });
  const [editing, setEditing] = useState<string | null>(null);

  const has = (kind: Kind, id: string) => shots.some((x) => x[KIND_FIELD[kind]] === id);
  const withShots = useMemo(() => trades.filter((t) => has("trades", t.id)), [trades, shots]);
  const missedShots = missed.rows.filter((m) => has("missed", m.id));
  const planShots = plans.rows.filter((p) => has("plans", p.id));
  const sections: { kind: Kind; title: string; rows: (typeof withShots[number] | typeof missedShots[number] | typeof planShots[number])[] }[] = [
    { kind: "trades", title: "Journal Trades", rows: withShots },
    { kind: "missed", title: "Missed Trades", rows: missedShots },
    { kind: "plans", title: "Trading Plans", rows: planShots },
  ];
  const first = sections.find((x) => x.rows.length);
  const active = selected ?? (first ? { kind: first.kind, id: first.rows[0]!.id } : null);
  const activeRow = active ? sections.find((x) => x.kind === active.kind)?.rows.find((r) => r.id === active.id) : undefined;
  const images = active ? shots.filter((x) => x[KIND_FIELD[active.kind]] === active.id) : [];
  const realTrade = active?.kind === "trades" ? withShots.find((t) => t.id === active.id) : undefined;

  async function saveCaption(id: string, caption: string) {
    const { error } = await supabase.from("trade_screenshots").update({ caption: caption.trim() || null }).eq("id", id);
    if (error) toast.error(error.message);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["screenshots"] });
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !active || !journal) return;
    const available = 6 - images.length;
    if (files.length > available) toast.error("A record can have at most 6 screenshots");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    for (const file of Array.from(files).slice(0, available)) {
      const path = `${u.user.id}/${active.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("screenshots").upload(path, await compressImage(file));
      if (up.error) { toast.error(up.error.message); continue; }
      const link = active.kind === "trades" ? { trade_id: active.id } : active.kind === "missed" ? { missed_trade_id: active.id } : { planned_trade_id: active.id };
      const { error } = await supabase.from("trade_screenshots").insert({ journal_id: journal.id, ...link, path });
      if (error) toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["screenshots"] });
    qc.invalidateQueries({ queryKey: ["screenshot-ids"] });
  }

  const label = (r: Record<string, unknown>) => ("trade_no" in r ? String(r["trade_no"]) : String(r["id"]).slice(0, 7));
  const when = (r: Record<string, unknown>) => String(("entry_at" in r ? r["entry_at"] : r["occurred_at"]) ?? "").slice(0, 16).replace("T", " ");

  return <div className="grid min-h-[calc(100vh-7rem)] grid-cols-[250px_minmax(0,1fr)] gap-[22px]">
    <aside className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg bg-card p-4 shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      {sections.map((sec) => (
        <div key={sec.kind} className="mb-3">
          <button type="button" aria-expanded={openSec[sec.kind]} onClick={() => setOpenSec((o) => ({ ...o, [sec.kind]: !o[sec.kind] }))} className="flex w-full items-center justify-between px-1 py-2 text-[13px] font-semibold">
            {sec.title} ({sec.rows.length}){openSec[sec.kind] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {openSec[sec.kind] && sec.rows.map((r) => {
            const rec = r as unknown as Record<string, unknown>;
            const ret = typeof rec["retPct"] === "number" ? (rec["retPct"] as number) : null;
            const isActive = active?.kind === sec.kind && active.id === r.id;
            return <button type="button" key={r.id} onClick={() => setSelected({ kind: sec.kind, id: r.id })}
              className={cn("mb-3 grid w-full gap-2.5 rounded-lg border bg-card p-3.5 text-left text-[11px] shadow-[0_1px_4px_rgba(60,40,90,0.08)] transition-colors hover:bg-muted/40", isActive && "border-ink")}>
              <span className="flex justify-between"><span className="text-t4">{sec.kind === "trades" ? "Trade ID" : "Record"}: <strong className="text-foreground">{label(rec)}</strong></span>{ret != null && <strong className={ret < 0 ? "text-loss" : "text-profit"}>{ret.toFixed(2)}%</strong>}</span>
              <span className="flex justify-between"><span className="text-t4">Setup:</span><strong>{String(rec["setup"] || "—")}</strong></span>
              <span className="flex items-center justify-between"><span className="text-t4">Direction:</span><span className={cn("rounded-full px-2.5 py-0.5 text-[10px] capitalize", r.direction === "long" ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss")}>{r.direction}</span></span>
              <span className="flex justify-between"><span className="text-t4">{sec.kind === "missed" ? "Occurred" : "Entry"}:</span><strong>{when(rec)}</strong></span>
              <span className="flex justify-between"><span className="text-t4">Instrument:</span><strong>{String(rec["instrument"] ?? "—")}</strong></span>
            </button>;
          })}
          {openSec[sec.kind] && !sec.rows.length && <p className="px-1 text-[11px] text-muted-foreground">No screenshots yet.</p>}
        </div>
      ))}
    </aside>
    <section className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg bg-card p-5 shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      {activeRow && active ? <>
        <div className="mb-5 flex items-center justify-between border-b pb-3">
          <div className="text-[13px] font-semibold">{String((activeRow as unknown as Record<string, unknown>)["instrument"] ?? "")} · {when(activeRow as unknown as Record<string, unknown>).slice(0, 10)}</div>
          <div className="flex items-center gap-2">
            {images.length < 6 && <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[11px] font-medium hover:bg-muted"><ImagePlus className="h-3.5 w-3.5" />Add screenshot<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>}
            {realTrade && <Button variant="outline" size="sm" onClick={() => drawer.open(realTrade)}>Open trade</Button>}
          </div>
        </div>
        {images.map((x) => <div key={x.id} className="group relative mb-8 border-b pb-6">
          <a href={x.url} target="_blank" rel="noreferrer"><img src={x.url} alt={`${(activeRow as unknown as Record<string, unknown>)["instrument"] ?? ""} trade chart`} className="w-full object-contain" /></a>
          <Button size="icon" variant="destructive" aria-label="Delete screenshot" className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100" onClick={async () => { await deleteShot(x); qc.invalidateQueries({ queryKey: ["screenshots"] }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          {editing === x.id
            ? <input autoFocus defaultValue={x.caption ?? ""} placeholder="Screenshot description" className="mt-4 w-full rounded-md border bg-background px-3 py-2 text-center text-[12px] outline-none focus:ring-1 focus:ring-ring" onBlur={(e) => void saveCaption(x.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }} />
            : <button type="button" onClick={() => setEditing(x.id)} className="mt-4 block min-h-10 w-full text-center text-[12px] text-t4 hover:text-foreground">{x.caption || "No screenshot description. Click here to add one."}</button>}
        </div>)}
        {!images.length && <p className="py-16 text-center text-[12px] text-muted-foreground">No screenshots yet.</p>}
      </> : <div className="py-24 text-center text-[12px] text-muted-foreground">Add screenshots to a trade to see them here.</div>}
    </section>
  </div>;
}
