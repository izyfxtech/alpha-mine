/**
 * compute-pnl: runs the P&L engine over a journal's closed trades and records the result in
 * `trade_pnl_audit` next to the values currently stored. By default this is AUDIT MODE: it never writes to `trades`.
 *
 * Opt-in `apply: true` additionally copies the engine's planned risk into `trades.risk_amount`, but ONLY where
 * that column is still empty (imported trades are exempt from the DB risk trigger, so R-multiples were missing).
 * Gross, net and fees are never changed. Each applied audit row is flagged `applied`, and `prev_risk_amount`
 * (null) allows an exact rollback. Writes use the caller's JWT, so row level security still decides.
 *
 * POST { journal_id: uuid, trade_ids?: uuid[], apply?: boolean }  with the caller's JWT.
 * Processes up to BATCH not yet audited trades per call and returns `remaining`; the client calls again until 0.
 *
 * Secrets: MASSIVE_API_KEY (optional, enables minute rates). SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */
import { createClient } from '@supabase/supabase-js';
import {
  FrankfurterProvider, ImpliedRateProvider, MassiveMinuteProvider, PnlEngine, RateResolver,
  type ClosedTrade, type PnlResult, type RateObservation, type RateProvider,
} from '../_shared/pnl-engine/index.ts';
import { guessDigits, mapTrade, pickRiskApplications, type InstrumentRow, type JournalRow, type TradeRow } from '../_shared/pnl-map.ts';

const ENGINE_VERSION = '0.1.1';
const BATCH = 200;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TRADE_COLS = 'id,direction,entry_at,exit_at,entry_price,exit_price,quantity,stop_loss,take_profit,gross_pnl,net_pnl,fees,commission,swap,risk_amount,source,raw_symbol,is_break_even,pnl_manual,instrument_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fx = (d: { toFixed(n: number): string } | null | undefined, n = 8) => (d ? d.toFixed(n) : null);

// deno-lint-ignore no-explicit-any
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Missing Authorization header' }, 401);
  const body = await req.json().catch(() => null) as { journal_id?: string; trade_ids?: string[]; apply?: boolean } | null;
  if (!body?.journal_id || !UUID.test(body.journal_id)) return json({ error: 'journal_id (uuid) is required' }, 400);
  if (body.trade_ids && !(Array.isArray(body.trade_ids) && body.trade_ids.every((i) => UUID.test(i)))) return json({ error: 'trade_ids must be uuids' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Reads go through the caller's JWT, so row level security decides what they may see.
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const { data: journal } = await user.from('journals').select('id,currency,quantity_unit').eq('id', body.journal_id).maybeSingle();
    if (!journal) return json({ error: 'Journal not found' }, 404);
    const j = journal as JournalRow;

    const all = await pageAll<TradeRow>((a, b) => {
      let q = user.from('trades').select(TRADE_COLS).eq('journal_id', j.id).not('exit_at', 'is', null).order('exit_at', { ascending: true }).range(a, b);
      if (body.trade_ids) q = q.in('id', body.trade_ids);
      return q;
    });
    const done = new Set((await pageAll<{ trade_id: string }>((a, b) =>
      user.from('trade_pnl_audit').select('trade_id').eq('journal_id', j.id).eq('engine_version', ENGINE_VERSION).range(a, b))).map((r) => r.trade_id));
    // Apply phase: runs first so it also works when every trade was audited by an earlier call.
    let applied = 0;
    const applyRisk = async () => {
      if (body.apply !== true) return;
      const audited = await pageAll<{ trade_id: string; status: string; planned_risk: number | string | null; applied: boolean }>((a, b) =>
        user.from('trade_pnl_audit').select('trade_id,status,planned_risk,applied').eq('journal_id', j.id).eq('engine_version', ENGINE_VERSION).eq('status', 'computed').eq('applied', false).not('planned_risk', 'is', null).range(a, b));
      const wanted = new Set(all.map((t) => t.id));
      const picks = pickRiskApplications(audited).filter((p) => wanted.has(p.trade_id));
      for (let i = 0; i < picks.length; i += 25) {
        await Promise.all(picks.slice(i, i + 25).map(async (p) => {
          // `.is('risk_amount', null)` makes this a no-op for any trade that has a risk figure already.
          const { data, error } = await user.from('trades').update({ risk_amount: p.risk_amount }).eq('id', p.trade_id).is('risk_amount', null).select('id');
          if (error) throw new Error(`could not apply risk: ${error.message}`);
          if (!data?.length) return;
          await admin.from('trade_pnl_audit').update({ applied: true, applied_at: new Date().toISOString() }).eq('trade_id', p.trade_id).eq('engine_version', ENGINE_VERSION);
          applied++;
        }));
      }
    };

    const pending = all.filter((t) => !done.has(t.id));
    const todo = pending.slice(0, BATCH);
    const remaining = pending.length - todo.length;
    if (!todo.length) { await applyRisk(); return json({ ok: true, processed: 0, remaining: 0, applied }); }

    const instruments = new Map((await pageAll<InstrumentRow>((a, b) =>
      user.from('instruments').select('id,symbol,contract_size,digits,profit_currency,kind').eq('journal_id', j.id).range(a, b))).map((i) => [i.id, i]));
    const digits = guessDigits(all);

    // Map rows to engine inputs; anything that cannot be computed safely becomes a 'skipped' audit row.
    const trades: ClosedTrade[] = []; const notes = new Map<string, string[]>(); const skipped = new Map<string, string>();
    for (const row of todo) {
      const m = mapTrade(row, row.instrument_id ? instruments.get(row.instrument_id) : undefined, j, digits);
      if ('skip' in m) skipped.set(row.id, m.skip); else { trades.push(m.trade); notes.set(row.id, m.notes); }
    }
    trades.sort((a, b) => a.closeTimeMs - b.closeTimeMs); // implied rates learned from earlier trades feed later ones

    const providerErrors: string[] = [];
    const external: RateProvider[] = [];
    const massiveKey = Deno.env.get('MASSIVE_API_KEY');
    if (massiveKey) external.push(new MassiveMinuteProvider({ apiKey: massiveKey }));
    external.push(new FrankfurterProvider());
    const onProviderError = (e: unknown) => { if (providerErrors.length < 10) providerErrors.push(String((e as Error)?.message ?? e)); };
    const implied = new ImpliedRateProvider({ scope: j.id });
    const engine = new PnlEngine({
      rates: new RateResolver({ providers: [implied, ...external], onProviderError }),
      validationRates: new RateResolver({ providers: external, onProviderError }),
      implied,
    });
    const results = new Map<string, PnlResult | string>();
    for (const r of await engine.computeMany(trades)) results.set(r.tradeId, 'result' in r ? r.result : r.error);

    // Persist the rates the results point at (append only), leaf observations first.
    const rateIds = new Map<string, number>();
    const saveRate = async (o: RateObservation): Promise<number> => {
      const key = `${o.base}|${o.quote}|${o.source}|${o.kind}|${o.side}|${o.observedAtMs}`;
      const hit = rateIds.get(key); if (hit) return hit;
      const lineage = o.lineage ? await Promise.all(o.lineage.map(saveRate)) : null;
      const row = { base: o.base, quote: o.quote, rate: o.rate.toFixed(18), observed_at: new Date(o.observedAtMs).toISOString(), source: o.source, kind: o.kind, side: o.side, lineage };
      await admin.from('rate_observations').upsert(row, { onConflict: 'base,quote,source,kind,side,observed_at', ignoreDuplicates: true });
      const { data, error } = await admin.from('rate_observations').select('id').eq('base', o.base).eq('quote', o.quote).eq('source', o.source).eq('kind', o.kind).eq('side', o.side).eq('observed_at', row.observed_at).single();
      if (error || !data) throw new Error(`could not store rate: ${error?.message}`);
      rateIds.set(key, data.id as number); return data.id as number;
    };

    const recon: Record<string, number> = { OK: 0, WARN: 0, MISMATCH: 0 };
    let computed = 0, skippedCount = 0, errors = 0;
    const audit = [];
    for (const row of todo) {
      const base = { trade_id: row.id, journal_id: j.id, engine_version: ENGINE_VERSION, prev_gross_pnl: row.gross_pnl, prev_net_pnl: row.net_pnl, prev_fees: row.fees, prev_risk_amount: row.risk_amount };
      const r = results.get(row.id);
      if (skipped.has(row.id)) { skippedCount++; audit.push({ ...base, status: 'skipped', skip_reason: skipped.get(row.id) }); continue; }
      if (typeof r === 'string') { errors++; audit.push({ ...base, status: 'error', skip_reason: r }); continue; }
      if (!r || r.grossAccount === null) { skippedCount++; audit.push({ ...base, status: 'skipped', skip_reason: (r?.warnings ?? ['no result']).join('; ') || 'no conversion rate available' }); continue; }
      computed++;
      if (r.reconciliation) recon[r.reconciliation.status] = (recon[r.reconciliation.status] ?? 0) + 1;
      audit.push({
        ...base, status: 'computed',
        gross_account: fx(r.grossAccount), net_account: fx(r.netAccount), planned_risk: fx(r.plannedRisk), r_multiple: fx(r.rMultiple, 6),
        conversion_rate_id: r.conversion ? await saveRate(r.conversion) : null,
        open_conversion_rate_id: r.openConversion ? await saveRate(r.openConversion) : null,
        gross_source: r.grossSource, recon_status: r.reconciliation?.status ?? null, recon_diagnosis: r.reconciliation?.diagnosis ?? null,
        warnings: [...(notes.get(row.id) ?? []), ...r.warnings],
      });
    }
    const { error } = await admin.from('trade_pnl_audit').upsert(audit, { onConflict: 'trade_id,engine_version' });
    if (error) throw new Error(`could not store audit rows: ${error.message}`);

    await applyRisk();
    return json({ ok: true, processed: todo.length, applied, computed, skipped: skippedCount, errors, reconciliation: recon, remaining, provider_errors: providerErrors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
