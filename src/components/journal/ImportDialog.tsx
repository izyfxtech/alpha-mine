import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal/journal-context";
import { seedDemoTrades } from "@/lib/journal/demo";
import { fillsToTrades, type RawFill } from "@/lib/import/fills-import";
import { FIELDS, detectHeaderRow, looksLikeFills, parseCsv, suggestMapping } from "@/lib/import/csv-mapping";
import { buildCsvTrades, detectDateOrder, detectDecimal, type CsvZone, type DateOrder, type Decimal } from "@/lib/import/csv-rows";
import { auditJournalPnl } from "@/lib/pnl/pnl-audit";
import { parseMtReport, type MtReport } from "@/lib/import/mt/parse-report";
import { checkCompatibility, summarize, toImportPayload } from "@/lib/import/mt/to-trades";
import type { Json } from "@/integrations/supabase/types";
import type { ServerTz } from "@engine/time.ts";

const TZ_OPTIONS: { value: string; label: string; tz: ServerTz }[] = [
  { value: "ny-close", label: "GMT+2 / GMT+3 (New York close, most brokers)", tz: { kind: "ny-close" } },
  { value: "utc", label: "UTC", tz: { kind: "fixed", offsetMinutes: 0 } },
  { value: "eu", label: "Europe/Athens (EET/EEST)", tz: { kind: "iana", zone: "Europe/Athens" } },
  { value: "p2", label: "Fixed GMT+2 (no DST)", tz: { kind: "fixed", offsetMinutes: 120 } },
  { value: "p3", label: "Fixed GMT+3 (no DST)", tz: { kind: "fixed", offsetMinutes: 180 } },
];
const CHUNK = 500;

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { journal } = useJournal();
  const qc = useQueryClient();
  const [csv, setCsv] = useState<{ header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mt, setMt] = useState<MtReport | null>(null);
  const [tzKey, setTzKey] = useState("ny-close");
  const [withCash, setWithCash] = useState(false);
  const [asFills, setAsFills] = useState(false);
  const [dateOrder, setDateOrder] = useState<"auto" | DateOrder>("auto");
  const [csvZone, setCsvZone] = useState<CsvZone>("utc");
  const [decimalChoice, setDecimalChoice] = useState<"auto" | Decimal>("auto");

  async function onFile(file: File) {
    if (/\.(html?|xlsx)$/i.test(file.name)) {
      setCsv(null);
      try {
        setMt(parseMtReport(new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        setMt(null);
        toast.error((e as Error).message);
      }
      return;
    }
    setMt(null);
    const raw = parseCsv(await file.text());
    if (!raw.length) return void toast.error("That file has no rows.");
    const h = detectHeaderRow(raw);
    const p = { header: raw[h] ?? [], rows: raw.slice(h + 1) };
    setCsv(p);
    const auto = suggestMapping(p.header);
    setMap(auto as Record<string, string>);
    setAsFills(looksLikeFills(auto));
  }

  /** Date order and decimal separator, from the user's choice or from the whole file. null = the file cannot say. */
  function formats() {
    if (!csv) return { order: null, decimal: null };
    const col = (r: string[], f: string) => (map[f] ? r[csv.header.indexOf(map[f])] : undefined);
    const detected = detectDateOrder(csv.rows.flatMap((r) => [col(r, "entry_at"), col(r, "exit_at")]).filter((v): v is string => !!v));
    const order = dateOrder !== "auto" ? dateOrder : detected === "ambiguous" ? null : (detected ?? "dmy");
    const numeric = ["entry_price", "exit_price", "quantity", "gross_pnl", "net_pnl", "fees", "stop_loss", "take_profit"];
    const found = detectDecimal(csv.rows.flatMap((r) => numeric.map((f) => col(r, f))));
    const decimal = decimalChoice !== "auto" ? decimalChoice : found === "ambiguous" ? null : found;
    return { order, decimal };
  }
  // The first rows as they will be saved, so a wrong date order, time zone or decimal separator is visible BEFORE import.
  const preview = useMemo(() => {
    if (!csv || asFills || mt) return null;
    const { order, decimal } = formats();
    if (!order || !decimal) return null;
    return buildCsvTrades(csv.rows.slice(0, 3), csv.header, map, { journalId: journal?.id ?? "", order, zone: csvZone, decimal, instrumentId: () => null, setupId: () => null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv, map, dateOrder, csvZone, decimalChoice, asFills, mt, journal?.id]);

  async function run() {
    if (!csv || !journal) return;
    const col = (r: string[], f: string) => (map[f] ? r[csv.header.indexOf(map[f])] : undefined);
    const { order, decimal } = formats();
    if (!order) return toast.error("These dates could be day/month or month/day. Choose the date format below.");
    if (!decimal) return toast.error("Numbers like 1,234 could be one thousand or 1.234. Choose the number format below.");
    setBusy(true);
    try {
      const ensure = async (table: "instruments" | "setups", column: "symbol" | "name", names: (string | undefined)[]) => {
        const { data: have, error } = await supabase.from(table).select(`id,${column}`).eq("journal_id", journal.id);
        if (error) throw error;
        const named = (x: unknown) => x as Record<string, string>;
        const ids = new Map<string, string>((have ?? []).map((x) => [named(x)[column]!, named(x).id!]));
        const fresh = [...new Set(names.filter((n): n is string => !!n && !ids.has(n)))];
        if (fresh.length) {
          const { data, error: e2 } = await supabase.from(table).insert(fresh.map((n) => ({ [column]: n, journal_id: journal.id })) as never).select(`id,${column}`);
          if (e2) throw e2;
          data?.forEach((x) => ids.set(named(x)[column]!, named(x).id!));
        }
        return ids;
      };
      const im = await ensure("instruments", "symbol", csv.rows.map((r) => col(r, "instrument")));
      const sm = map.setup ? await ensure("setups", "name", csv.rows.map((r) => col(r, "setup"))) : new Map<string, string>();
      const { trades, skipped, warnings } = buildCsvTrades(csv.rows, csv.header, map, { journalId: journal.id, order, zone: csvZone, decimal, instrumentId: (s) => im.get(s) ?? null, setupId: (s) => sm.get(s) ?? null });
      if (!trades.length) throw new Error(skipped.length ? `Nothing could be imported. Row ${skipped[0]!.row}: ${skipped[0]!.reason}` : "The file has no rows to import.");
      // Re-importing the same file skips what is already there (external_id is derived from the row's content).
      let inserted = 0;
      for (let i = 0; i < trades.length; i += 500) {
        const { data, error } = await supabase.from("trades").upsert(trades.slice(i, i + 500), { onConflict: "journal_id,external_id", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }
      const dupes = trades.length - inserted;
      toast.success(`Imported ${inserted} trades${dupes ? `, ${dupes} already imported` : ""}`);
      if (warnings.length) toast.warning(`${warnings.length} rows need a look`, { description: warnings.slice(0, 3).map((w) => `Row ${w.row}: ${w.reason}`).join("\n") });
      if (skipped.length) toast.warning(`${skipped.length} rows skipped`, { description: skipped.slice(0, 5).map((s) => `Row ${s.row}: ${s.reason}`).join("\n") + (skipped.length > 5 ? `\n…and ${skipped.length - 5} more` : "") });
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

  async function runMt() {
    if (!mt || !journal) return;
    const compat = checkCompatibility(mt, journal);
    if (!compat.ok) return void toast.error(compat.error);
    const tz = TZ_OPTIONS.find((o) => o.value === tzKey)!.tz;
    setBusy(true);
    try {
      // One database call = one transaction: instruments, account link, trades and deposits land together or not at all.
      // Re-importing is safe: unchanged trades are left alone, late commission/swap is updated, your notes never are.
      const payload = toImportPayload(mt, tz, { withCashflows: withCash });
      const { data, error } = await supabase.rpc("import_mt_report", { _journal_id: journal.id, _payload: payload as unknown as Json });
      if (error) throw error;
      const r = data as { inserted: number; updated: number; unchanged: number; cashflows: number };
      const parts = [`${r.inserted} new`, r.updated ? `${r.updated} updated` : null, r.unchanged ? `${r.unchanged} already up to date` : null, withCash ? `${r.cashflows} deposits/withdrawals` : null].filter(Boolean);
      toast.success(`Imported: ${parts.join(", ")}`);

      // Audit new and changed trades and fill in R-multiples. Failure here never undoes the import.
      if (r.inserted + r.updated > 0) {
        auditJournalPnl(journal.id, { apply: true })
          .then((a) => { qc.invalidateQueries(); if (a.reconciliation.MISMATCH) toast.warning(`${a.reconciliation.MISMATCH} trades differ from an independent P&L check`); })
          .catch(() => toast.warning("Trades imported, but the P&L check could not run. R-multiples will be missing until it does."));
      }
      qc.invalidateQueries();
      setMt(null);
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
          <DialogDescription>Upload a MetaTrader 4 statement or MetaTrader 5 report (HTML or Excel), or a CSV export and match its columns.</DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,.html,.htm,.xlsx" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
        {mt && <MtPreview report={mt} journalCurrency={journal?.currency} tzKey={tzKey} onTz={setTzKey} withCash={withCash} onCash={setWithCash} />}
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
        {csv && !asFills && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">number format</span>
              <select className="h-8 rounded-md border bg-background px-2" value={decimalChoice} onChange={(e) => setDecimalChoice(e.target.value as "auto" | Decimal)}>
                <option value="auto">Detect from the file</option>
                <option value=".">1,234.50 (dot is the decimal)</option>
                <option value=",">1.234,50 (comma is the decimal)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">date format</span>
              <select className="h-8 rounded-md border bg-background px-2" value={dateOrder} onChange={(e) => setDateOrder(e.target.value as "auto" | DateOrder)}>
                <option value="auto">Detect from the file</option>
                <option value="dmy">Day / month / year</option>
                <option value="mdy">Month / day / year</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">times without a time zone are in</span>
              <select className="h-8 rounded-md border bg-background px-2" value={csvZone} onChange={(e) => setCsvZone(e.target.value as CsvZone)}>
                <option value="utc">UTC</option>
                <option value="local">This browser's time zone</option>
              </select>
            </label>
          </div>
        )}
        {csv && !asFills && !mt && (
          <div className="rounded-md border p-2 text-xs">
            {preview ? (
              <>
                <p className="mb-1 text-muted-foreground">First rows as they will be saved (check the dates and prices):</p>
                {preview.trades.map((t, i) => <p key={i} className="tabular">{t.entry_at.replace("T", " ").slice(0, 16)} UTC · {t.direction} · {t.entry_price}{t.exit_price != null ? ` to ${t.exit_price}` : ""} · qty {t.quantity} · P/L {t.gross_pnl} · fees {t.fees}</p>)}
                {preview.skipped.slice(0, 2).map((x) => <p key={x.row} className="text-loss">Row {x.row}: {x.reason}</p>)}
              </>
            ) : <p className="text-muted-foreground">Choose the date and number format above to see how the first rows will be read.</p>}
          </div>
        )}
        <div className="flex justify-between gap-2">
          {import.meta.env.DEV ? <Button variant="ghost" onClick={demo} disabled={busy}>Add sample trades (dev only)</Button> : <span />}
          {mt ? (
            <Button onClick={runMt} disabled={busy || mt.positions.length === 0}>Import {mt.positions.length} trades</Button>
          ) : (
            <Button onClick={asFills ? runFills : run} disabled={!csv || busy}>Import {csv ? `${csv.rows.length} rows` : ""}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MtPreview({ report, journalCurrency, tzKey, onTz, withCash, onCash }: { report: MtReport; journalCurrency?: string | undefined; tzKey: string; onTz: (k: string) => void; withCash: boolean; onCash: (v: boolean) => void }) {
  const sum = summarize(report);
  const a = report.account;
  const money = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a?.currency || journalCurrency || ""}`;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="font-medium">MetaTrader {report.platform === "mt4" ? "4" : "5"} · {sum.trades} closed positions · {sum.symbols} symbols</div>
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
        <span className="text-xs text-muted-foreground">Broker server time zone (MetaTrader reports use server time, not UTC)</span>
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
