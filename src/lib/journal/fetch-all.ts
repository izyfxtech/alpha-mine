/**
 * Loads EVERY row of a query. PostgREST caps each response at the project's Max Rows setting (1000 by default)
 * whatever `.limit()` says, so a plain select silently drops everything past it, and the journal then shows a partial
 * history with no warning (AM-C01).
 *
 * `page(from, to, first)` must build the query with `.range(from, to)` and a TOTAL order (end with a unique column,
 * or rows can repeat or go missing between pages). On the first page only, pass `countOption(first)` to `select` so
 * the server reports the exact total once; the loop then advances by the rows it actually received, so it is correct
 * for any Max Rows value, and costs a single request for a small table.
 */
const PAGE = 1000;
type Page<T> = PromiseLike<{ data: T[] | null; count?: number | null; error: { message: string } | null }>;

export const countOption = (first: boolean) => (first ? ({ count: "exact" } as const) : undefined);

export async function fetchAllRows<T>(page: (from: number, to: number, first: boolean) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  let total: number | null = null;
  for (let from = 0; ; ) {
    const { data, count, error } = await page(from, from + PAGE - 1, from === 0);
    if (error) throw error;
    const rows = data ?? [];
    if (from === 0 && count != null) total = count;
    out.push(...rows);
    from += rows.length;
    // An empty page always ends the loop; with a known total, so does having every row.
    if (rows.length === 0 || (total != null && out.length >= total)) return out;
  }
}
