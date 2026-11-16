import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MENTEE_TABLES,
  OWN_SOURCE,
  keyFor,
  tableFor,
  type JournalSource,
} from "@/lib/journal/source";
import { isLive } from "@/lib/mentor/scopes";

const mentee: JournalSource = { kind: "mentee", scopes: ["trades"] };

describe("journal source", () => {
  it("reads your own journal from the tables", () => {
    expect(tableFor("trades", OWN_SOURCE)).toBe("trades");
    expect(tableFor("anything_else", OWN_SOURCE)).toBe("anything_else");
  });
  it("reads a shared journal from the mentor views", () => {
    expect(tableFor("trades", mentee)).toBe("mentee_trades");
    expect(tableFor("journals", mentee)).toBe("mentee_journals");
    expect(tableFor("journal_cashflows", mentee)).toBe("mentee_journal_cashflows");
  });
  it("fails closed: a table with no mentor view cannot be read as a mentor", () => {
    for (const t of [
      "profiles",
      "trade_feedback",
      "journal_access",
      "prop_challenges",
      "saved_filters",
    ])
      expect(() => tableFor(t, mentee), t).toThrow(/not available in a shared journal/);
  });
  it("keeps a mentor's cache entries apart from the owner's", () => {
    expect(keyFor(["trades", "j1"], OWN_SOURCE)).toEqual(["trades", "j1"]);
    expect(keyFor(["trades", "j1"], mentee)).toEqual(["trades", "j1", "mentee"]);
  });
  it("every mentor view the client uses is created by the migration", () => {
    const sql = readFileSync("supabase/migrations/20261117000009_mentorship.sql", "utf8");
    const explicit = [...sql.matchAll(/create view public\.(mentee_\w+)/g)].map((m) => m[1]!);
    const generated = [
      ...sql.matchAll(/\('(\w+)', '(?:trades|screenshots|plans|notes|money)'\)/g),
    ].map((m) => `mentee_${m[1]}`);
    const created = new Set([...explicit, ...generated]);
    for (const table of MENTEE_TABLES)
      expect(created.has(tableFor(table, mentee)), table).toBe(true);
  });
  it("the journal and trade views leave out what the student never shared", () => {
    const sql = readFileSync("supabase/migrations/20261117000009_mentorship.sql", "utf8");
    // The statement itself: comments are not part of what the view exposes.
    const statement = (name: string) =>
      sql
        .slice(sql.indexOf(`create view public.${name} `))
        .split(";")[0]!
        .replace(/--.*$/gm, "");
    for (const secret of ["share_token", "mt_login", "mt_server", "broker"])
      expect(statement("mentee_journals"), secret).not.toContain(secret);
    expect(statement("mentee_trades")).not.toContain("external_id");
  });
});

describe("grant liveness", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("is live until it is revoked or past its end", () => {
    expect(isLive({ revoked_at: null, expires_at: null }, now)).toBe(true);
    expect(isLive({ revoked_at: null, expires_at: "2026-11-17T00:00:00Z" }, now)).toBe(true);
    expect(isLive({ revoked_at: null, expires_at: "2026-11-16T11:59:59Z" }, now)).toBe(false);
    expect(isLive({ revoked_at: "2026-11-01T00:00:00Z", expires_at: null }, now)).toBe(false);
  });
});
