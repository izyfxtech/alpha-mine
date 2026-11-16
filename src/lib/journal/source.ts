/**
 * Where a journal's rows come from.
 *
 * Your own journals are read from the base tables. A journal a student shared with you (you are the mentor) is read from the
 * `mentee_*` views, which apply the student's grant and blank the columns the grant does not cover (see
 * supabase/migrations/20261117000009_mentorship.sql). The views have the same columns as the tables, so the same queries work on
 * both once the table name goes through `tableFor`.
 */
export type JournalSource = { kind: "own" } | { kind: "mentee"; scopes: string[] };

export const OWN_SOURCE: JournalSource = { kind: "own" };

/** The view for each table a mentor's pages read. A table not listed here has no mentor view, so it cannot be read as a mentor. */
const MENTEE_VIEWS: Record<string, string> = {
  journals: "mentee_journals",
  trades: "mentee_trades",
  trade_executions: "mentee_trade_executions",
  missed_trades: "mentee_missed_trades",
  instruments: "mentee_instruments",
  setups: "mentee_setups",
  comment_definitions: "mentee_comment_definitions",
  trade_comments: "mentee_trade_comments",
  trade_custom_stats: "mentee_trade_custom_stats",
  trade_rule_checks: "mentee_trade_rule_checks",
  custom_stat_categories: "mentee_custom_stat_categories",
  custom_stat_options: "mentee_custom_stat_options",
  trade_screenshots: "mentee_trade_screenshots",
  trading_plans: "mentee_trading_plans",
  trading_rules: "mentee_trading_rules",
  diary_sessions: "mentee_diary_sessions",
  notebook_pages: "mentee_notebook_pages",
  notebook_folders: "mentee_notebook_folders",
  journal_cashflows: "mentee_journal_cashflows",
};

/** The table or view to query for `table`. Fails closed: as a mentor, an unlisted table throws instead of reading the base table. */
export function tableFor(table: string, source: JournalSource): string {
  if (source.kind === "own") return table;
  const view = MENTEE_VIEWS[table];
  if (!view) throw new Error(`"${table}" is not available in a shared journal.`);
  return view;
}

/** Adds the source to a query key for a mentor's journal, so it can never share a cache entry with the same key as an owner. */
export const keyFor = <K extends readonly unknown[]>(key: K, source: JournalSource) =>
  source.kind === "own" ? key : ([...key, "mentee"] as const);

export const MENTEE_TABLES = Object.keys(MENTEE_VIEWS);
