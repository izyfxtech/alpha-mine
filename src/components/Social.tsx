import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDistanceToNowStrict, format, parseISO } from "date-fns";
import { NEWSFEED } from "@/lib/newsfeed";
import { Panel } from "@/components/kit";
import { cn } from "@/lib/utils";

/** Home newsfeed: latest blog posts and videos, switchable between Blog and YouTube. */
export function Social() {
  const [tab, setTab] = useState<"blog" | "youtube">("blog");
  const items = NEWSFEED[tab];
  return (
    <Panel title="Social" action={
      <div className="inline-flex overflow-hidden rounded-md border text-[11px] font-semibold">
        {([["blog", "Blog"], ["youtube", "YouTube"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("px-2.5 py-1", tab === k ? "bg-ink text-ink-foreground" : "bg-card")}>{l}</button>
        ))}
      </div>
    } className="flex flex-col">
      <div className="max-h-[286px] space-y-1 overflow-y-auto pr-1">
        {items.map((it) => {
          const d = parseISO(it.date);
          return (
            <a key={it.title} href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-md px-1 py-2.5 hover:bg-muted">
              <span className="flex h-[38px] w-[30px] shrink-0 flex-col items-center justify-center rounded-md bg-profit-soft text-profit">
                <span className="text-[13px] font-bold leading-none">{format(d, "dd")}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase leading-none">{format(d, "MMM")}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">{it.title}</span>
                <span className="block text-[10px] text-t4">{formatDistanceToNowStrict(d, { addSuffix: true })}, by {it.by}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </a>
          );
        })}
      </div>
    </Panel>
  );
}
