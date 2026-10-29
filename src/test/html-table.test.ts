import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToRows } from "@shared/mt/html-table.ts";

describe("htmlToRows (DOM-free)", () => {
  it("reads rows and cells in document order", () => {
    expect(htmlToRows("<table><tr><td>a</td><td>b</td></tr><tr><th>c</th></tr></table>")).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("decodes named, decimal and hex entities and collapses NBSP / whitespace", () => {
    const rows = htmlToRows(
      "<table><tr><td>A&nbsp;&amp;&nbsp;B &#65; &#x42;\n\t  C</td><td>1&nbsp;000.50</td></tr></table>",
    );
    expect(rows).toEqual([["A & B A B C", "1 000.50"]]);
  });

  it("leaves unknown or out-of-range entities alone instead of throwing", () => {
    expect(decodeEntities("&bogus; &#99999999; ok")).toBe("&bogus; &#99999999; ok");
  });

  it("tolerates unclosed td and tr, which MetaTrader emits", () => {
    const rows = htmlToRows("<table><tr><td>1<td>2<td>3<tr><td>4<td>5</table>");
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5"],
    ]);
  });

  it("is case-insensitive and ignores attributes", () => {
    expect(
      htmlToRows('<TABLE><TR bgcolor="#fff"><TD colspan=2 align=right>x</TD></TR></TABLE>'),
    ).toEqual([["x"]]);
  });

  it("skips scripts, styles and comments", () => {
    const html =
      "<style>td{color:red}</style><table><!-- <td>hidden</td> --><tr><td>shown</td></tr></table><script>var x='<td>no</td>'</script>";
    expect(htmlToRows(html)).toEqual([["shown"]]);
  });

  it("turns <br> and block tags into spaces, not glued words", () => {
    expect(htmlToRows("<table><tr><td>one<br>two<p>three</p></td></tr></table>")).toEqual([
      ["one two three"],
    ]);
  });

  it("keeps a nested table's text out of the parent cell, rows in document order", () => {
    const rows = htmlToRows(
      "<table><tr><td>outer<table><tr><td>inner</td></tr></table>tail</td><td>next</td></tr></table>",
    );
    expect(rows).toEqual([["outertail", "next"], ["inner"]]);
  });

  it("drops rows that are entirely blank and accepts a fragment with no <table>", () => {
    expect(htmlToRows("<tr><td> </td><td>&nbsp;</td></tr><tr><td>kept</td></tr>")).toEqual([
      ["kept"],
    ]);
  });

  it("handles a large report quickly", () => {
    const row = "<tr><td>2026.10.20 08:15:00</td><td>1</td><td>EURUSD</td><td>buy</td></tr>";
    const t0 = performance.now();
    const rows = htmlToRows(`<table>${row.repeat(20000)}</table>`);
    expect(rows).toHaveLength(20000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
