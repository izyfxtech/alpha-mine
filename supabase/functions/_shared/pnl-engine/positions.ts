/**
 * Fills -> positions (scaling in, partial exits, flips).
 *
 * A position lives from flat to flat: every fill in the same direction adds an ENTRY leg, every fill against it
 * adds an EXIT leg, and the position closes when the net size returns to zero. A fill that overshoots zero is
 * split at the crossing: the first part closes the position, the rest opens a new one in the other direction,
 * with the fill's costs shared by size.
 *
 * Totals do not depend on the accounting method. For one position, sum(price move x lots) over any pairing of
 * entry and exit lots (FIFO, LIFO, average cost) equals (weighted exit - weighted entry) x lots, so a trade row
 * carrying the weighted averages has exactly the same gross result. Use matching.ts when you need the lot by lot
 * split instead (tax lots, per-lot R).
 *
 * Costs stay on the leg they were charged on. Swap follows the closing leg, as MT5 books it.
 */
import { Dec, ZERO } from './decimal.ts';
import type { Fill } from './matching.ts';
import type { Side } from './types.ts';

export interface Leg {
  fillId: string;
  side: Side;
  lots: Dec;
  price: Dec;
  timeMs: number;
  commission: Dec;
  swap: Dec;
  fee: Dec;
}

export interface Position {
  side: Side;
  entries: Leg[];
  exits: Leg[];
  /** Total entered size (equals total exited size once closed). */
  lots: Dec;
  avgEntry: Dec;
  /** null while nothing has been exited yet. */
  avgExit: Dec | null;
  openTimeMs: number;
  /** Time of the last exit leg. */
  closeTimeMs: number | null;
  commission: Dec;
  swap: Dec;
  fee: Dec;
  /** Size still open (zero for a closed position). */
  remaining: Dec;
}

export interface PositionResult {
  closed: Position[];
  /** The position still open at the end of the data, with the exits made so far. */
  open: Position | null;
}

const weighted = (legs: Leg[]): Dec | null => {
  const lots = legs.reduce((s, l) => s.plus(l.lots), ZERO);
  if (lots.isZero()) return null;
  return legs.reduce((s, l) => s.plus(l.price.times(l.lots)), ZERO).div(lots);
};

function toPosition(side: Side, entries: Leg[], exits: Leg[], remaining: Dec): Position {
  const all = [...entries, ...exits];
  const lots = entries.reduce((s, l) => s.plus(l.lots), ZERO);
  return {
    side,
    entries,
    exits,
    lots,
    avgEntry: weighted(entries)!,
    avgExit: weighted(exits),
    openTimeMs: Math.min(...entries.map((l) => l.timeMs)),
    closeTimeMs: exits.length ? Math.max(...exits.map((l) => l.timeMs)) : null,
    commission: all.reduce((s, l) => s.plus(l.commission), ZERO),
    swap: all.reduce((s, l) => s.plus(l.swap), ZERO),
    fee: all.reduce((s, l) => s.plus(l.fee), ZERO),
    remaining,
  };
}

function leg(f: Fill, lots: Dec): Leg {
  const share = lots.div(f.lots);
  return {
    fillId: f.id,
    side: f.side,
    lots,
    price: f.price,
    timeMs: f.timeMs,
    commission: (f.commission ?? ZERO).times(share),
    swap: (f.swap ?? ZERO).times(share),
    fee: (f.fee ?? ZERO).times(share),
  };
}

export function buildPositions(fills: Fill[]): PositionResult {
  const sorted = fills.map((f, i) => ({ f, i })).sort((a, b) => a.f.timeMs - b.f.timeMs || a.i - b.i).map((x) => x.f);
  const closed: Position[] = [];
  let cur: { side: Side; entries: Leg[]; exits: Leg[]; net: Dec } | null = null;

  for (const f of sorted) {
    if (!f.lots.gt(0)) throw new RangeError(`Fill ${f.id}: lots must be > 0`);
    if (!f.price.gt(0)) throw new RangeError(`Fill ${f.id}: price must be > 0`);
    let remaining = f.lots;
    while (remaining.gt(0)) {
      if (!cur) {
        cur = { side: f.side, entries: [leg(f, remaining)], exits: [], net: remaining };
        remaining = ZERO;
      } else if (f.side === cur.side) {
        cur.entries.push(leg(f, remaining));
        cur.net = cur.net.plus(remaining);
        remaining = ZERO;
      } else {
        const closing = Dec.min(remaining, cur.net);
        cur.exits.push(leg(f, closing));
        cur.net = cur.net.minus(closing);
        remaining = remaining.minus(closing);
        if (cur.net.isZero()) {
          closed.push(toPosition(cur.side, cur.entries, cur.exits, ZERO));
          cur = null;
        }
      }
    }
  }
  return { closed, open: cur ? toPosition(cur.side, cur.entries, cur.exits, cur.net) : null };
}
