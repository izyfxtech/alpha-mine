interface Entered {
  entry_at: string;
}

/** Orders trades by entry time, oldest first (ISO timestamps sort as text). */
export const byEntry = (a: Entered, b: Entered) => a.entry_at.localeCompare(b.entry_at);

/** A copy of the trades ordered by entry time; the input is left as it was. */
export const sortedByEntry = <T extends Entered>(trades: readonly T[]): T[] =>
  [...trades].sort(byEntry);
