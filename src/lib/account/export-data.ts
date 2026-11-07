import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/journal/fetch-all";

/** Every table that holds a journal's data, with the columns that make its row order total (paging needs that). */
export const EXPORT_TABLES: { table: string; order: string[] }[] = [
  { table: "instruments", order: ["id"] },
  { table: "setups", order: ["id"] },
  { table: "trading_plans", order: ["id"] },
  { table: "trading_rules", order: ["id"] },
  { table: "comment_definitions", order: ["id"] },
  { table: "custom_stat_categories", order: ["id"] },
  { table: "custom_stat_options", order: ["id"] },
  { table: "trades", order: ["id"] },
  { table: "trade_comments", order: ["trade_id", "comment_definition_id"] },
  { table: "trade_custom_stats", order: ["trade_id", "option_id"] },
  { table: "trade_rule_checks", order: ["trade_id", "rule_id"] },
  { table: "trade_executions", order: ["id"] },
  { table: "trade_screenshots", order: ["id"] },
  { table: "missed_trades", order: ["id"] },
  { table: "missed_trade_custom_stats", order: ["missed_trade_id", "option_id"] },
  { table: "planned_trades", order: ["id"] },
  { table: "planned_trade_custom_stats", order: ["planned_trade_id", "option_id"] },
  { table: "notebook_folders", order: ["id"] },
  { table: "notebook_pages", order: ["id"] },
  { table: "diary_sessions", order: ["id"] },
  { table: "journal_cashflows", order: ["id"] },
  { table: "backtests", order: ["id"] },
  { table: "alt_strategies", order: ["id"] },
  { table: "alt_strategy_results", order: ["strategy_id", "trade_id"] },
  { table: "prop_challenges", order: ["id"] },
  { table: "saved_filters", order: ["id"] },
];

export interface ExportFile {
  exported_at: string;
  format: 1;
  note: string;
  profile: unknown;
  journals: (Record<string, unknown> & { data: Record<string, unknown[]> })[];
}

type Row = Record<string, unknown>;
const loose = supabase as unknown as {
  from: (t: string) => {
    select: (
      c: string,
      o?: unknown,
    ) => { eq: (c: string, v: string) => { order: (c: string) => unknown } };
  };
};

async function allRows(table: string, order: string[], journalId: string): Promise<Row[]> {
  return fetchAllRows<Row>((from, to, first) => {
    let q = loose
      .from(table)
      .select("*", first ? { count: "exact" } : undefined)
      .eq("journal_id", journalId) as unknown as {
      order: (c: string) => unknown;
      range: (a: number, b: number) => unknown;
    };
    for (const col of order) q = q.order(col) as typeof q;
    return q.range(from, to) as never;
  });
}

/** Everything the signed-in user owns, as one JSON-able object. Screenshot rows carry their storage path; the image files themselves are not included. */
export async function buildExport(onProgress?: (label: string) => void): Promise<ExportFile> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", u.user.id)
    .maybeSingle();
  const { data: journals, error } = await supabase
    .from("journals")
    .select("*")
    .eq("owner_id", u.user.id)
    .order("created_at");
  if (error) throw error;
  const out: ExportFile["journals"] = [];
  for (const j of journals ?? []) {
    const data: Record<string, unknown[]> = {};
    for (const { table, order } of EXPORT_TABLES) {
      onProgress?.(`${j.name}: ${table}`);
      data[table] = await allRows(table, order, j.id);
    }
    out.push({ ...(j as unknown as Row), data });
  }
  return {
    exported_at: new Date().toISOString(),
    format: 1,
    note: "All of your journals and what they hold. Screenshot rows list their storage path; the image files are not included. Times are UTC.",
    profile: profile ?? null,
    journals: out,
  };
}

const csvCell = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One CSV of every trade (all columns), journal name first. Opens in Excel or Sheets. */
export function tradesCsv(file: ExportFile): string {
  const rows: Row[] = file.journals.flatMap((j) =>
    (j.data["trades"] as Row[]).map((t) => ({ journal: j["name"], ...t })),
  );
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join(
    "\r\n",
  );
}

/** Hands a text file to the browser as a download. */
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Removes the signed-in user's stored screenshot files (and previews) now, while their session is still valid. Then the account can be deleted. */
async function removeMyFiles(): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { data: journals } = await supabase.from("journals").select("id").eq("owner_id", u.user.id);
  for (const j of journals ?? []) {
    const rows = await fetchAllRows<{ id: string; path: string }>(
      (from, to, first) =>
        supabase
          .from("trade_screenshots")
          .select("id,path", first ? { count: "exact" } : undefined)
          .eq("journal_id", j.id)
          .order("id")
          .range(from, to) as never,
    );
    const files = rows
      .map((r) => r.path)
      .filter((p) => !/^https?:\/\//i.test(p))
      .flatMap((p) => [p, `${p}.thumb.webp`]);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await supabase.storage.from("screenshots").remove(files.slice(i, i + 100));
      if (error) throw error;
    }
  }
}

/** Deletes the account and everything in it. Irreversible. */
export async function deleteMyAccount(): Promise<void> {
  await removeMyFiles();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
