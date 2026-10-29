/**
 * DOM-free HTML table extraction. MetaTrader reports are flat, sometimes sloppy HTML (unclosed <td>/<tr>,
 * colspans, entities). `DOMParser` does not exist in Deno, so this is a small tokenizer instead: the same
 * function works in the browser, in tests and in an Edge Function.
 *
 * Contract: rows come back in DOCUMENT order, one string per <td>/<th>, whitespace collapsed (NBSP included),
 * entities decoded. A cell holds its OWN text only: a nested table's text goes to the nested table's rows, never
 * into the parent cell, so content is never duplicated. Rows with no text at all are dropped.
 */
import { clean } from "./cells.ts";

const NAMED: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "-",
  minus: "-",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

// comment | script/style block (skipped whole) | any tag | text | a stray "<"
const TOKEN =
  /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<\/?([a-z][a-z0-9]*)\b[^>]*>|[^<]+|</gi;

/** Tags that separate words inside a cell. */
const BREAKS = new Set(["br", "p", "div", "li"]);

interface Frame {
  row: string[] | null;
  cell: string[] | null;
}

export function htmlToRows(html: string): string[][] {
  const rows: string[][] = [];
  const stack: Frame[] = [];

  const top = (): Frame => {
    if (stack.length === 0) stack.push({ row: null, cell: null }); // tolerate a fragment with no <table>
    return stack[stack.length - 1]!;
  };
  const closeCell = (f: Frame) => {
    if (f.cell && f.row) f.row.push(clean(decodeEntities(f.cell.join(""))));
    f.cell = null;
  };
  const openRow = (f: Frame) => {
    f.row = [];
    rows.push(f.row);
  };

  for (const m of html.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.startsWith("<!--") || m[1]) continue;
    const tag = m[2]?.toLowerCase();

    if (!tag) {
      const f = stack[stack.length - 1];
      if (f?.cell) f.cell.push(tok);
      continue;
    }

    const closing = tok[1] === "/";
    if (tag === "table") {
      if (closing) {
        const f = stack.pop();
        if (f) closeCell(f);
      } else {
        stack.push({ row: null, cell: null });
      }
    } else if (tag === "tr") {
      const f = top();
      closeCell(f);
      f.row = null;
      if (!closing) openRow(f);
    } else if (tag === "td" || tag === "th") {
      const f = top();
      closeCell(f);
      if (!closing) {
        if (!f.row) openRow(f);
        f.cell = [];
      }
    } else if (BREAKS.has(tag)) {
      const f = stack[stack.length - 1];
      if (f?.cell) f.cell.push(" ");
    }
  }
  for (const f of stack) closeCell(f);

  return rows.filter((r) => r.some(Boolean));
}
