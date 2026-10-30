import { useMemo, useState } from "react";
import { ImageIcon, Star } from "lucide-react";
import type { Trade } from "@/lib/pnl/metrics";
import { fmtNum } from "@/lib/pnl/metrics";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbox, type LightboxItem } from "@/components/journal/Lightbox";
import type { Shot } from "@/components/journal/Screenshots";

const money = (n: number) => `${n < 0 ? "-" : n > 0 ? "+" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: string | null) => (s ? s.replace("T", " ").slice(0, 16) : "");
const tone = (t: Trade) => (t.net_pnl > 0 ? "text-profit" : t.net_pnl < 0 ? "text-loss" : "text-foreground");

const subtitle = (t: Trade) => [t.direction, when(t.entry_at), t.setup].filter(Boolean).join(" · ");
const title = (t: Trade) => `${t.instrument || "Trade"}  ${money(t.net_pnl)}${t.r != null ? `  (${fmtNum(t.r)}R)` : ""}`;

/** Card view: one card per trade, with its first screenshot as the cover. */
export function TradeCards({ trades, shotsByTrade, onOpen, selected, onToggle }: { trades: Trade[]; shotsByTrade: Map<string, Shot[]>; onOpen: (t: Trade) => void; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const [box, setBox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  return (
    <>
      <div className="grid gap-4 p-5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {trades.map((t) => {
          const shots = shotsByTrade.get(t.id) ?? [];
          const cover = shots[0];
          return (
            <article key={t.id} className={cn("group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow-md", t.net_pnl > 0 ? "border-l-4 border-l-profit" : t.net_pnl < 0 ? "border-l-4 border-l-loss" : "border-l-4 border-l-border", selected?.has(t.id) && "ring-2 ring-ink")}>
              <div className="relative">
              <button type="button" className="relative block aspect-video w-full bg-muted" aria-label={cover ? `View screenshots for ${t.instrument}` : `No screenshot for ${t.instrument}`} onClick={() => cover ? setBox({ items: shots.map((s) => ({ url: s.url, title: title(t), subtitle: subtitle(t), action: { label: "Open trade", run: () => { setBox(null); onOpen(t); } } })), index: 0 }) : onOpen(t)}>
                {cover?.url ? <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground"><ImageIcon className="h-6 w-6" />No screenshot</span>}
                {shots.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">{shots.length} images</span>}
              </button>
              {onToggle && <span className="absolute left-2 top-2 rounded bg-card/90 p-1 shadow"><Checkbox aria-label={`Select ${t.instrument}`} checked={selected?.has(t.id) ?? false} onCheckedChange={() => onToggle(t.id)} /></span>}
              </div>
              <button type="button" className="flex flex-1 flex-col gap-2 p-3 text-left" onClick={() => onOpen(t)}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold"><span className="truncate">{t.instrument || "—"}</span>{t.is_favorite && <Star className="h-4 w-4 shrink-0 fill-foreground" />}</span>
                  <span className={cn("shrink-0 text-base font-semibold tabular-nums", tone(t))}>{money(t.net_pnl)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 capitalize text-foreground">{t.direction}</span>
                  {t.r != null && <span className={tone(t)}>{fmtNum(t.r)}R</span>}
                  {t.setup && <span>{t.setup}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{when(t.entry_at)}{t.exit_at ? ` → ${when(t.exit_at)}` : ""}</span>
                {t.notes && <span className="line-clamp-2 text-xs text-muted-foreground">{t.notes}</span>}
              </button>
            </article>
          );
        })}
      </div>
      {box && <Lightbox items={box.items} index={box.index} onIndex={(i) => setBox({ ...box, index: i })} onClose={() => setBox(null)} />}
    </>
  );
}

type Result = "all" | "win" | "loss";

/** Gallery view: every screenshot of the (filtered) trades as a tile, click to enlarge and step through. */
export function ScreenshotGallery({ trades, shotsByTrade, onOpen, loading }: { trades: Trade[]; shotsByTrade: Map<string, Shot[]>; onOpen: (t: Trade) => void; loading?: boolean }) {
  const [result, setResult] = useState<Result>("all");
  const [index, setIndex] = useState<number | null>(null);
  const tiles = useMemo(() => trades
    .filter((t) => result === "all" || (result === "win" ? t.net_pnl > 0 : t.net_pnl < 0))
    .flatMap((t) => (shotsByTrade.get(t.id) ?? []).filter((s) => s.url).map((s) => ({ shot: s, trade: t }))), [trades, shotsByTrade, result]);
  const items: LightboxItem[] = tiles.map(({ shot, trade }) => ({ url: shot.url, title: title(trade), subtitle: subtitle(trade), action: { label: "Open trade", run: () => { setIndex(null); onOpen(trade); } } }));

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center gap-2 text-sm">
        {(["all", "win", "loss"] as const).map((r) => (
          <button key={r} type="button" aria-pressed={result === r} onClick={() => setResult(r)} className={cn("h-9 rounded-md border px-3", result === r ? "bg-ink text-ink-foreground" : "hover:bg-muted")}>{r === "all" ? "All" : r === "win" ? "Winners" : "Losers"}</button>
        ))}
        <span className="ml-2 text-muted-foreground">{tiles.length} screenshot{tiles.length === 1 ? "" : "s"}</span>
      </div>
      {tiles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{loading ? "Loading screenshots…" : "No screenshots yet. Open a trade and add chart screenshots to see them here."}</p>
      ) : (
        <div className="gap-4 [column-width:260px]">
          {tiles.map(({ shot, trade }, i) => (
            <button key={shot.id} type="button" onClick={() => setIndex(i)} className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-lg border bg-muted text-left" aria-label={`Enlarge screenshot for ${trade.instrument}`}>
              <img src={shot.url} alt={`${trade.instrument} screenshot`} loading="lazy" className="w-full" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-xs text-white">
                <span className="truncate font-medium">{trade.instrument}</span>
                <span className={cn("shrink-0 font-semibold tabular-nums", trade.net_pnl > 0 ? "text-emerald-300" : trade.net_pnl < 0 ? "text-red-300" : "")}>{money(trade.net_pnl)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {index !== null && items.length > 0 && <Lightbox items={items} index={Math.min(index, items.length - 1)} onIndex={setIndex} onClose={() => setIndex(null)} />}
    </div>
  );
}
