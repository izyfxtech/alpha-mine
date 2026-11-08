import { z } from "zod";
import type { Filters } from "@/lib/journal/journal-context";
import type { Rule } from "@/lib/pnl/prop-challenge";

/**
 * Checks for data that comes from outside the code that reads it: JSON columns, a public RPC, anything a user could have edited.
 * Static types say what we expect; these say whether what arrived really is that.
 */

/** A field that is dropped, rather than failing the whole object, when its value has the wrong shape. */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const range = z.object({ min: z.number().optional(), max: z.number().optional() });
const numbers = z.array(z.number());
const strings = z.array(z.string());

/** A saved filter set. Unknown keys are removed and a bad field is dropped, so an old or hand-edited row still loads. */
export const filtersSchema: z.ZodType<Filters> = z.object({
  from: lenient(z.string()),
  to: lenient(z.string()),
  instrument: lenient(strings),
  setup: lenient(strings),
  outcome: lenient(z.array(z.enum(["win", "loss", "be"]))),
  month: lenient(numbers),
  weekday: lenient(numbers),
  hour: lenient(numbers),
  year: lenient(numbers),
  tradeType: lenient(strings),
  direction: lenient(z.enum(["long", "short"])),
  starred: lenient(z.enum(["yes", "no"])),
  lastTrades: lenient(z.number()),
  returnPct: lenient(range),
  rMultiple: lenient(range),
  rrr: lenient(range),
  stats: lenient(z.record(z.string(), strings)),
  day: lenient(z.string()),
  q: lenient(z.string()),
  compliance: lenient(z.array(z.enum(["followed", "partial", "violated", "unrated"]))),
  violated: lenient(strings),
});

const amount = z.object({ value: z.number(), unit: z.enum(["absolute", "percent"]) });

/** One prop-firm challenge rule. */
export const ruleSchema: z.ZodType<Rule> = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("profit_target"), target: amount }),
  z.object({
    id: z.string(),
    kind: z.literal("max_drawdown"),
    limit: amount,
    mode: z.enum(["static", "eod_trailing", "intraday_trailing"]),
    lockAtStart: z.boolean().optional(),
  }),
  z.object({ id: z.string(), kind: z.literal("daily_loss"), limit: amount }),
  z.object({ id: z.string(), kind: z.literal("min_trading_days"), days: z.number() }),
  z.object({
    id: z.string(),
    kind: z.literal("min_profitable_days"),
    days: z.number(),
    minDailyProfit: z.number(),
  }),
  z.object({ id: z.string(), kind: z.literal("consistency"), maxBestDayPercent: z.number() }),
]);

/** The rules stored on a challenge. A malformed rule is skipped instead of breaking the whole page. */
export function parseRules(value: unknown): Rule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = ruleSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** What the public share link returns. */
export const sharedJournalSchema = z.object({
  name: z.string(),
  currency: z.string(),
  starting_balance: z.number(),
  total: z.number().optional(),
  net: z.number().optional(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  gross_win: z.number().optional(),
  gross_loss: z.number().optional(),
  truncated: z.boolean().optional(),
  trades: z.array(
    z.object({
      entry_at: z.string(),
      net_pnl: z.number(),
      direction: z.string(),
      instrument: z.string().nullable(),
      setup: z.string().nullable(),
    }),
  ),
});
export type SharedJournalData = z.infer<typeof sharedJournalSchema>;

/** The share response, or null when the link does not exist. A response of the wrong shape is an error, not "not found". */
export function parseSharedJournal(value: unknown): SharedJournalData | null {
  if (value == null) return null;
  return sharedJournalSchema.parse(value);
}
