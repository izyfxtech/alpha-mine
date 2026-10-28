import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal-context";
import { seedDemoTrades } from "@/lib/demo";
import { fillsToTrades, type RawFill } from "@/lib/fills-import";
import { auditJournalPnl } from "@/lib/pnl-audit";
import { parseMt5Report, type Mt5Report } from "@/lib/mt5/parse-report";
import { balanceOpsToCashflows, checkCompatibility, reportToTrades, summarize } from "@/lib/mt5/to-trades";
import type { ServerTz } from "../../supabase/functions/_shared/pnl-engine/time.ts";

const FIELDS = ["entry_at", "exit_at", "instrument", "setup", "direction", "entry_price", "exit_price", "quantity", "stop_loss", "take_profit", "gross_pnl", "fees", "net_pnl"] as const;

const TZ_OPTIONS: { value: string; label: string; tz: ServerTz }[] = [
  { value: "ny-close", label: "GMT+2 / GMT+3 (New York close, most brokers)", tz: { kind: "ny-close" } },
  { value: "utc", label: "UTC", tz: { kind: "fixed", offsetMinutes: 0 } },
  { value: "eu", label: "Europe/Athens (EET/EEST)", tz: { kind: "iana", zone: "Europe/Athens" } },
  { value: "p2", label: "Fixed GMT+2 (no DST)", tz: { kind: "fixed", offsetMinutes: 120 } },
  { value: "p3", label: "Fixed GMT+3 (no DST)", tz: { kind: "fixed", offsetMinutes: 180 } },
];
const CHUNK = 500;

function parseCSV(text: string) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  return { header: rows[0] ?? [], rows: rows.slice(1) };
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { journal } = useJournal();
  const qc = useQueryClient();
  const [csv, setCsv] = useState<{ header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mt5, setMt5] = useState<Mt5Report | null>(null);
  const [tzKey, setTzKey] = useState("ny-close");
  const [withCash, setWithCash] = useState(false);
  const [asFills, setAsFills] = useState(false);

  async function onFile(file: File) {
    if (/\.(html?|xlsx)$/i.test(file.name)) {
      setCsv(null);
      try {
        setMt5(parseMt5Report(new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        setMt5(null);
        toast.error((e as Error).message);
      }
      return;
    }
    setMt5(null);
    const p = parseCSV(await file.text());
    setCsv(p);
    const auto: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const hit = p.header.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.replace(/_/g, ""));
      if (hit) auto[f] = hit;
    });
    setMap(auto);
  }

  async function run() {
    if (!csv || !journal) return;
    setBusy(true);
    try {
      const col = (r: string[], f: string) => (map[f] ? r[csv.header.indexOf(map[f])] : undefined);
      const { data: ins } = await supabase.from("instruments").select("id,symbol").eq("journal_id", journal.id);
      const im = new Map((ins ?? []).map((i) => [i.symbol, i.id]));
      const newSyms = [...new Set(csv.rows.map((r) => col(r, "instrument")).filter((s): s is string => !!s && !im.has(s)))];
      if (newSyms.length) {
        const { data } = await supabase.from("instruments").insert(newSyms.map((symbol) => ({ symbol, journal_id: journal.id }))).select("id,symbol");
        data?.forEach((i) => im.set(i.symbol, i.id));
      }
      const n = (v?: string) => (v == null || v === "" ? null : Number(v));
      const rows = csv.rows.filter((r) => col(r, "entry_at") && col(r, "entry_price")).map((r) => {
        const gross = n(col(r, "gross_pnl")) ?? n(col(r, "net_pnl")) ?? 0;
        const fees = n(col(r, "fees")) ?? 0;
        const d = (col(r, "direction") ?? "long").toLowerCase();
        return {
          journal_id: journal.id,
          instrument_id: im.get(col(r, "instrument") ?? "") ?? null,
          direction: d.startsWith("s") || d === "sell" ? "short" : "long",
          entry_at: new Date(col(r, "entry_at")!).toISOString(),
          exit_at: col(r, "exit_at") ? new Date(col(r, "exit_at")!).toISOString() : null,
          entry_price: Number(col(r, "entry_price")),
          exit_price: n(col(r, "exit_price")),
          quantity: n(col(r, "quantity")) ?? 1,
          stop_loss: n(col(r, "stop_loss")),
          take_profit: n(col(r, "take_profit")),
          gross_pnl: gross,
          fees,
          net_pnl: n(col(r, "net_pnl")) ?? gross - fees,
        };
      });
      const { error } = await supabase.from("trades").insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} trades`);
      qc.invalidateQueries();
      setCsv(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** CSV rows that are individual fills: group into trades (scale-in, partial exits) and keep the legs. */
  async function runFills() {
    if (!csv || !journal) return;
    const need = ["entry_at", "direction", "quantity", "entry_price", "instrument"] as const;
    const missing = need.filter((f) => !map[f]);
    if (missing.length) return void toast.error(`Map these columns first: ${missing.map((m) => m.replace(/_/g, " ")).join(", ")}.`);
    setBusy(true);
    try {
      const col = (r: string[], f: string) => (map[f] ? r[csv.header.indexOf(map[f])] : undefined);
      const num = (v?: string) => (v == null || v === "" ? 0 : Math.abs(Number(v.replace(/,/g, ""))));
      const fills: RawFill[] = csv.rows.map((r) => ({
        symbol: (col(r, "instrument") ?? "").trim(),
        side: ((col(r, "direction") ?? "").trim().toLowerCase().startsWith("s") ? "sell" : "buy") as RawFill["side"],
        quantity: num(col(r, "quantity")),
        price: num(col(r, "entry_price")),
        timeMs: Date.parse(col(r, "entry_at") ?? ""),
        cost: num(col(r, "fees")),
      })).filter((f) => f.symbol);
      const res = fillsToTrades(fills);
      if (!res.trades.length) return void toast.error(res.open.length ? "No position was fully closed in this file, so nothing was imported." : "No trades could be built from this file.");

      const { data: ins } = await supabase.from("instruments").select("id,symbol").eq("journal_id", journal.id);
      const im = new Map((ins ?? []).map((i) => [i.symbol, i.id]));
      const newSyms = [...new Set(res.trades.map((t) => t.symbol))].filter((x) => !im.has(x));
      if (newSyms.length) {
        const { data, error } = await supabase.from("instruments").insert(newSyms.map((symbol) => ({ symbol, journal_id: journal.id }))).select("id,symbol");
        if (error) throw error;
        data?.forEach((i) => im.set(i.symbol, i.id));
      }
      const rows = res.trades.map(({ legs: _legs, symbol, ...t }) => ({ ...t, journal_id: journal.id, instrument_id: im.get(symbol) ?? null }));
      const idByExternal = new Map<string, string>();
      for (let k = 0; k < rows.length; k += CHUNK) {
        const { data, error } = await supabase.from("trades").upsert(rows.slice(k, k + CHUNK), { onConflict: "journal_id,external_id", ignoreDuplicates: true }).select("id,external_id");
        if (error) throw error;
        data?.forEach((d) => d.external_id && idByExternal.set(d.external_id, d.id));
      }
      // Legs only for trades that were actually inserted now; existing ones keep their legs.
      const legs = res.trades.flatMap((t) => (idByExternal.has(t.external_id) ? t.legs.map((l) => ({ ...l, trade_id: idByExternal.get(t.external_id)!, journal_id: journal.id })) : []));
      for (let k = 0; k < legs.length; k += CHUNK) {
        const { error } = await supabase.from("trade_executions").insert(legs.slice(k, k + CHUNK));
        if (error) throw error;
      }
      const added = idByExternal.size;
      const extra = [res.open.length ? `${res.open.length} position${res.open.length === 1 ? "" : "s"} still open (not imported)` : "", res.errors.length ? `${res.errors.length} unreadable row${res.errors.length === 1 ? "" : "s"} skipped` : "", rows.length - added ? `${rows.length - added} already imported` : ""].filter(Boolean).join(", ");
      toast.success(`Imported ${added} trade${added === 1 ? "" : "s"} from ${fills.length} fills${extra ? ` · ${extra}` : ""}`);
      qc.invalidateQueries();
      setCsv(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runMt5() {
    if (!mt5 || !journal) return;
    const compat = checkCompatibility(mt5, journal);
    if (!compat.ok) return void toast.error(compat.error);
    const tz = TZ_OPTIONS.find((o) => o.value === tzKey)!.tz;
    setBusy(true);
    try {
      // 1. Instruments: create the missing ones with the price digits MT5 printed (the P&L engine needs them for pips).
      const { data: ins } = await supabase.from("instruments").select("id,symbol,digits").eq("journal_id", journal.id);
      const im = new Map((ins ?? []).map((i) => [i.symbol, i.id]));
      const newSyms = Object.keys(mt5.digitsBySymbol).filter((sym) => !im.has(sym));
      if (newSyms.length) {
        const { data, error } = await supabase.from("instruments").insert(newSyms.map((symbol) => ({ symbol, journal_id: journal.id, digits: mt5.digitsBySymbol[symbol] ?? null }))).select("id,symbol");
        if (error) throw error;
        data?.forEach((i) => im.set(i.symbol, i.id));
      }
      for (const i of (ins ?? []).filter((x) => x.digits == null && mt5.digitsBySymbol[x.symbol] != null)) {
        await supabase.from("instruments").update({ digits: mt5.digitsBySymbol[i.symbol]! }).eq("id", i.id);
      }

      // 2. Link the journal to the account and record that quantities are lots (the engine skips trades otherwise).
      const a = mt5.account;
      const link: { quantity_unit: string; mt_platform?: string; mt_server?: string | null; mt_login?: string } = { quantity_unit: "lots" };
      if (a && !journal.mt_login) Object.assign(link, { mt_platform: "mt5", mt_server: a.server, mt_login: a.login });
      const { error: linkErr } = await supabase.from("journals").update(link).eq("id", journal.id);
      if (linkErr) throw linkErr;

      // 3. Trades, idempotent on (journal_id, external_id): importing the same report twice adds nothing.
      const rows = reportToTrades(mt5, journal.id, im, tz);
      let added = 0;
      for (let k = 0; k < rows.length; k += CHUNK) {
        const { data, error } = await supabase.from("trades").upsert(rows.slice(k, k + CHUNK), { onConflict: "journal_id,external_id", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        added += data?.length ?? 0;
      }
      const dupes = rows.length - added;

      // 4. Optional deposits/withdrawals, idempotent on the MT5 deal ticket.
      let cash = 0;
      if (withCash) {
        const flows = balanceOpsToCashflows(mt5, journal.id, tz);
        if (flows.length) {
          const { data, error } = await supabase.from("journal_cashflows").upsert(flows, { onConflict: "journal_id,external_id", ignoreDuplicates: true }).select("id");
          if (error) throw error;
          cash = data?.length ?? 0;
        }
      }
      toast.success(`Imported ${added} trade${added === 1 ? "" : "s"}${dupes ? `, ${dupes} already in this journal` : ""}${withCash ? `, ${cash} deposits/withdrawals` : ""}`);

      // 5. Audit the new trades and fill in R-multiples. Failure here never undoes the import.
      if (added > 0) {
        auditJournalPnl(journal.id, { apply: true })
          .then((r) => { qc.invalidateQueries(); if (r.reconciliation.MISMATCH) toast.warning(`${r.reconciliation.MISMATCH} trades differ from an independent P&L check`); })
          .catch(() => toast.warning("Trades imported, but the P&L check could not run. R-multiples will be missing until it does."));
      }
      qc.invalidateQueries();
      setMt5(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    if (!journal) return;
    setBusy(true);
    try {
      await seedDemoTrades(journal.id);
      toast.success("Sample trades added");
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import trades</DialogTitle>
          <DialogDescription>Upload a MetaTrader 5 report (HTML or Excel), or a CSV export and match its columns.</DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,.html,.htm,.xlsx" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
        {mt5 && <Mt5Preview report={mt5} journalCurrency={journal?.currency} tzKey={tzKey} onTz={setTzKey} withCash={withCash} onCash={setWithCash} />}
        {csv && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={asFills} onChange={(e) => setAsFills(e.target.checked)} />
            <span>
              Each row is a single fill (execution)
              <span className="block text-xs text-muted-foreground">Fills are grouped into trades per instrument, including scaling in and partial exits. Map time → entry at, buy/sell → direction, price → entry price, commission → fees. Positions still open are not imported.</span>
            </span>
          </label>
        )}
        {csv && (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto text-sm">
            {FIELDS.map((f) => (
              <label key={f} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{f.replace(/_/g, " ")}</span>
                <select className="h-8 rounded-md border bg-background px-2" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">—</option>
                  {csv.header.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-between gap-2">
          {import.meta.env.DEV ? <Button variant="ghost" onClick={demo} disabled={busy}>Add sample trades (dev only)</Button> : <span />}
          {mt5 ? (
            <Button onClick={runMt5} disabled={busy || mt5.positions.length === 0}>Import {mt5.positions.length} trades</Button>
          ) : (
            <Button onClick={asFills ? runFills : run} disabled={!csv || busy}>Import {csv ? `${csv.rows.length} rows` : ""}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Mt5Preview({ report, journalCurrency, tzKey, onTz, withCash, onCash }: { report: Mt5Report; journalCurrency?: string | undefined; tzKey: string; onTz: (k: string) => void; withCash: boolean; onCash: (v: boolean) => void }) {
  const sum = summarize(report);
  const a = report.account;
  const money = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a?.currency || journalCurrency || ""}`;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="font-medium">{sum.trades} closed positions · {sum.symbols} symbols</div>
        <div className="text-muted-foreground">
          {a ? `Account ${a.login}${a.server ? ` · ${a.server}` : ""}${a.type ? ` · ${a.type}` : ""} · ` : ""}Net {money(sum.net)} after commission and swap
        </div>
      </div>
      {report.balanceOps.length > 0 && (
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={withCash} onChange={(e) => onCash(e.target.checked)} />
          <span>
            Also import {report.balanceOps.length} deposits/withdrawals
            <span className="block text-xs text-muted-foreground">Leave off if your journal's starting balance already includes the first deposit, or it will be counted twice.</span>
          </span>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Broker server time zone (MT5 reports use server time, not UTC)</span>
        <select className="h-8 rounded-md border bg-background px-2" value={tzKey} onChange={(e) => onTz(e.target.value)}>
          {TZ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {report.warnings.map((w) => <p key={w} className="text-xs text-amber-600">{w}</p>)}
      {report.skipped.length > 0 && (
        <p className="text-xs text-amber-600">
          {report.skipped.length} row{report.skipped.length === 1 ? "" : "s"} skipped: {[...new Set(report.skipped.map((x) => x.reason))].slice(0, 3).join("; ")}
        </p>
      )}
    </div>
  );
}
