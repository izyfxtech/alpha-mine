import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LightboxItem {
  url: string;
  title: string;
  subtitle?: string;
  /** Optional action shown under the image, e.g. "Open trade". */
  action?: { label: string; run: () => void };
}

/** Full-screen image viewer: arrow keys / buttons to move, Esc or backdrop click to close. */
export function Lightbox({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index];
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  if (!item || typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.title} className="fixed inset-0 z-[100] flex flex-col bg-black/90 text-white" onClick={onClose}>
      <div className="flex items-center gap-3 px-5 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          {item.subtitle && <p className="truncate text-xs text-white/70">{item.subtitle}</p>}
        </div>
        <span className="text-xs text-white/70 tabular-nums">{index + 1} / {items.length}</span>
        <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white"><a href={item.url} target="_blank" rel="noreferrer" aria-label="Open image in a new tab" title="Open in a new tab"><ExternalLink className="h-5 w-5" /></a></Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-4">
        {items.length > 1 && <Button variant="ghost" size="icon" className="absolute left-3 h-11 w-11 text-white hover:bg-white/15 hover:text-white" aria-label="Previous" onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft className="h-7 w-7" /></Button>}
        <img src={item.url} alt={item.title} className="max-h-full max-w-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
        {items.length > 1 && <Button variant="ghost" size="icon" className="absolute right-3 h-11 w-11 text-white hover:bg-white/15 hover:text-white" aria-label="Next" onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight className="h-7 w-7" /></Button>}
      </div>
      {item.action && <div className="flex justify-center pb-5" onClick={(e) => e.stopPropagation()}><Button variant="secondary" onClick={item.action.run}>{item.action.label}</Button></div>}
    </div>,
    document.body,
  );
}
