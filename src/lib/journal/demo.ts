import { supabase } from "@/integrations/supabase/client";

const SYMBOLS: [string, number, number][] = [
  ["EURUSD", 1.08, 10000],
  ["USDJPY", 150, 1000],
  ["AAPL", 190, 50],
  ["TSLA", 230, 20],
  ["BTCUSD", 60000, 0.05],
  ["US500", 5000, 1],
  ["GC", 2300, 1],
];

/** Fills a journal with ~120 realistic sample trades over the past 4 months. */
export async function seedDemoTrades(journalId: string) {
  if (!import.meta.env.DEV) throw new Error("Reference fixtures are development-only");
  const { data: existing } = await supabase.from("instruments").select("id,symbol").eq("journal_id", journalId);
  const have = new Map((existing ?? []).map((i) => [i.symbol, i.id]));
  const missing = SYMBOLS.filter(([s]) => !have.has(s)).map(([symbol]) => ({ symbol, journal_id: journalId }));
  if (missing.length) {
    const { data } = await supabase.from("instruments").insert(missing).select("id,symbol");
    data?.forEach((i) => have.set(i.symbol, i.id));
  }
  const { data: setups } = await supabase.from("setups").select("id").eq("journal_id", journalId);
  const { data: comments } = await supabase.from("comment_definitions").select("id,phase,sentiment").eq("journal_id", journalId);

  const rows = [];
  const now = Date.now();
  for (let k = 0; k < 120; k++) {
    const [sym, px, baseQty] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
    let entry = new Date(now - Math.random() * 120 * 864e5);
    if (entry.getDay() === 0) entry = new Date(entry.getTime() + 864e5);
    if (entry.getDay() === 6) entry = new Date(entry.getTime() - 864e5);
    const hold = (20 + Math.random() * 600) * 60000;
    const dir = Math.random() > 0.5 ? "long" : "short";
    const riskPct = 0.004 + Math.random() * 0.004;
    const stopDist = px * riskPct;
    // Size every position to a realistic, roughly constant dollar risk so the equity curve looks like a real account.
    const riskUsd = 70 + Math.random() * 90;
    const qty = +(riskUsd / stopDist).toPrecision(3) || baseQty;
    const u = Math.random();
    const rMult = u < 0.03 ? 0 : u < 0.6 ? 0.4 + Math.random() * 1.8 : -(0.5 + Math.random() * 0.55);
    const move = stopDist * rMult * (dir === "long" ? 1 : -1);
    const exit = px + move;
    const gross = +((exit - px) * qty * (dir === "long" ? 1 : -1)).toFixed(2);
    const fees = +(1 + Math.random() * 4).toFixed(2);
    rows.push({
      journal_id: journalId,
      instrument_id: have.get(sym)!,
      setup_id: setups?.length && Math.random() > 0.15 ? setups[Math.floor(Math.random() * setups.length)]!.id : null,
      direction: dir,
      entry_at: entry.toISOString(),
      exit_at: new Date(entry.getTime() + hold).toISOString(),
      entry_price: +px.toFixed(4),
      exit_price: +exit.toFixed(4),
      quantity: qty,
      stop_loss: +(dir === "long" ? px - stopDist : px + stopDist).toFixed(4),
      take_profit: +(dir === "long" ? px + stopDist * 2 : px - stopDist * 2).toFixed(4),
      high_price: +(Math.max(px, exit) + stopDist * Math.random()).toFixed(4),
      low_price: +(Math.min(px, exit) - stopDist * Math.random()).toFixed(4),
      otp_hit: rMult > 1.8,
      gross_pnl: gross,
      fees,
      net_pnl: +(gross - fees).toFixed(2),
      risk_amount: +(stopDist * qty).toFixed(2),
      is_favorite: Math.random() < 0.05,
    });
  }
  const { data: inserted, error } = await supabase.from("trades").insert(rows).select("id,net_pnl");
  if (error) throw error;
  if (comments?.length && inserted) {
    const tc: { trade_id: string; comment_definition_id: string; journal_id: string }[] = [];
    inserted.forEach((t) => {
      for (const phase of ["entry", "management", "exit"]) {
        const good = Number(t.net_pnl) > 0 ? Math.random() < 0.75 : Math.random() < 0.35;
        const pool = comments.filter((c) => c.phase === phase && c.sentiment === (good ? "positive" : "negative"));
        if (pool.length) tc.push({ trade_id: t.id, comment_definition_id: pool[Math.floor(Math.random() * pool.length)].id, journal_id: journalId });
      }
    });
    await supabase.from("trade_comments").insert(tc);
  }
}
