"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * In-app replacements for window.confirm and window.prompt, so every confirmation looks like the rest of the app
 * instead of the browser's own pop-up. Usage:
 *
 *   const { confirm, prompt } = useDialogs();
 *   if (!(await confirm({ title: "Delete trade?", message: "This cannot be undone.", destructive: true }))) return;
 *   const name = await prompt({ title: "Rename folder", defaultValue: old });   // string, or null when cancelled
 */
export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletes and anything that cannot be undone. */
  destructive?: boolean;
}
export interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (o: ConfirmOptions | string) => Promise<boolean>;
  prompt: (o: PromptOptions | string) => Promise<string | null>;
}
const Ctx = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialogs needs <DialogProvider> above it");
  return c;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const current = useRef<Pending | null>(null);
  current.current = pending;

  // Asking while another question is open cancels the first one, so no promise is ever left hanging.
  const cancelOpen = useCallback(() => {
    const p = current.current;
    if (!p) return;
    if (p.kind === "confirm") p.resolve(false); else p.resolve(null);
  }, []);

  const api = useMemo<DialogApi>(() => ({
    confirm: (o) => new Promise<boolean>((resolve) => {
      cancelOpen();
      setPending({ kind: "confirm", opts: typeof o === "string" ? { message: o } : o, resolve });
    }),
    prompt: (o) => new Promise<string | null>((resolve) => {
      cancelOpen();
      const opts = typeof o === "string" ? { title: o } : o;
      setText(opts.defaultValue ?? "");
      setPending({ kind: "prompt", opts, resolve });
    }),
  }), [cancelOpen]);

  const close = (result: boolean | string | null) => {
    const p = current.current;
    if (!p) return;
    setPending(null);
    if (p.kind === "confirm") p.resolve(result === true); else p.resolve(typeof result === "string" ? result : null);
  };

  // Leaving the page while a question is open counts as "no".
  useEffect(() => () => cancelOpen(), [cancelOpen]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) close(pending?.kind === "prompt" ? null : false); }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => { if (pending?.kind === "confirm") e.preventDefault(); }}>
          {pending?.kind === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>{pending.opts.title ?? "Are you sure?"}</DialogTitle>
                <DialogDescription>{pending.opts.message}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => close(false)}>{pending.opts.cancelLabel ?? "Cancel"}</Button>
                <Button autoFocus variant={pending.opts.destructive ? "destructive" : "ink"} onClick={() => close(true)}>{pending.opts.confirmLabel ?? (pending.opts.destructive ? "Delete" : "Confirm")}</Button>
              </DialogFooter>
            </>
          )}
          {pending?.kind === "prompt" && (
            <form onSubmit={(e) => { e.preventDefault(); close(text); }} className="grid gap-4">
              <DialogHeader><DialogTitle>{pending.opts.title}</DialogTitle></DialogHeader>
              <label className="grid gap-1.5 text-sm">
                {pending.opts.label && <span className="text-xs text-muted-foreground">{pending.opts.label}</span>}
                <Input autoFocus value={text} placeholder={pending.opts.placeholder} onChange={(e) => setText(e.target.value)} />
              </label>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => close(null)}>Cancel</Button>
                <Button type="submit" variant="ink">{pending.opts.confirmLabel ?? "OK"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
