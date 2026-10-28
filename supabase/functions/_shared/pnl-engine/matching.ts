/**
 * Turning raw fills into closed trades.
 *
 * Hedging accounts (MT4 tickets, MT5 hedging positions) need NO matching:
 * every position already has an id and its own deals, so use position ids.
 *
 * Netting accounts (MT5 netting, many futures/crypto venues, CSV exports with
 * only executions) need a policy for which entry a partial close consumes.
 * FIFO is the common tax/reporting default. Average-cost is what netting
 * brokers literally carry. Choose per account and store the choice, because
 * the two give different per-trade results (never different totals).
 *
 * Cost allocation: per-lot cost of a fill x lots consumed. Commission and fee
 * follow the fill they were charged on. Swap follows the CLOSING fill (that is
 * where MT5 books it).
 */
import { D, Dec, ZERO } from './decimal.ts';
import type { ClosedTrade, InstrumentSpec, Side } from './types.ts';

export interface Fill {
  id: string;
  side: Side;
  lots: Dec;
  price: Dec;
  timeMs: number;
  /** Signed account-currency amounts. */
  commission?: Dec;
  swap?: Dec;
  fee?: Dec;
}

export interface Segment {
  /** Direction of the position that was reduced. */
  side: Side;
  lots: Dec;
  openPrice: Dec;
  closePrice: Dec;
  openTimeMs: number;
  closeTimeMs: number;
  openFillId: string;
  closeFillId: string;
  commission: Dec;
  swap: Dec;
  fee: Dec;
}

export interface OpenLot {
  fillId: string;
  side: Side;
  lots: Dec;
  price: Dec;
  timeMs: number;
  commissionPerLot: Dec;
  feePerLot: Dec;
}

export interface MatchResult {
  segments: Segment[];
  open: OpenLot[];
}

function sortFills(fills: Fill[]): Fill[] {
  return fills
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.timeMs - b.f.timeMs || a.i - b.i)
    .map((x) => x.f);
}

function perLot(total: Dec | undefined, lots: Dec): Dec {
  return total ? total.div(lots) : ZERO;
}

export function matchFifo(fills: Fill[]): MatchResult {
  const queue: OpenLot[] = [];
  const segments: Segment[] = [];

  for (const fill of sortFills(fills)) {
    if (!fill.lots.gt(0)) throw new RangeError(`Fill ${fill.id}: lots must be > 0`);
    const cPer = perLot(fill.commission, fill.lots);
    const fPer = perLot(fill.fee, fill.lots);
    const sPer = perLot(fill.swap, fill.lots);
    let remaining = fill.lots;

    // Queue invariant: every lot in it has the same direction.
    while (remaining.gt(0) && queue.length > 0 && queue[0]!.side !== fill.side) {
      const lot = queue[0]!;
      const m = Dec.min(lot.lots, remaining);
      segments.push({
        side: lot.side,
        lots: m,
        openPrice: lot.price,
        closePrice: fill.price,
        openTimeMs: lot.timeMs,
        closeTimeMs: fill.timeMs,
        openFillId: lot.fillId,
        closeFillId: fill.id,
        commission: lot.commissionPerLot.times(m).plus(cPer.times(m)),
        fee: lot.feePerLot.times(m).plus(fPer.times(m)),
        swap: sPer.times(m),
      });
      lot.lots = lot.lots.minus(m);
      remaining = remaining.minus(m);
      if (lot.lots.isZero()) queue.shift();
    }

    if (remaining.gt(0)) {
      queue.push({
        fillId: fill.id,
        side: fill.side,
        lots: remaining,
        price: fill.price,
        timeMs: fill.timeMs,
        commissionPerLot: cPer,
        feePerLot: fPer,
      });
    }
  }
  return { segments, open: queue };
}

export function matchAverage(fills: Fill[]): MatchResult {
  const segments: Segment[] = [];
  let pos: {
    side: Side;
    lots: Dec;
    avg: Dec;
    commissionTotal: Dec;
    feeTotal: Dec;
    timeMs: number;
    fillId: string;
  } | null = null;

  for (const fill of sortFills(fills)) {
    if (!fill.lots.gt(0)) throw new RangeError(`Fill ${fill.id}: lots must be > 0`);
    const cPer = perLot(fill.commission, fill.lots);
    const fPer = perLot(fill.fee, fill.lots);
    const sPer = perLot(fill.swap, fill.lots);
    let remaining = fill.lots;

    if (pos && pos.side !== fill.side) {
      const m = Dec.min(pos.lots, remaining);
      const share = m.div(pos.lots);
      const openC = pos.commissionTotal.times(share);
      const openF = pos.feeTotal.times(share);
      segments.push({
        side: pos.side,
        lots: m,
        openPrice: pos.avg,
        closePrice: fill.price,
        openTimeMs: pos.timeMs,
        closeTimeMs: fill.timeMs,
        openFillId: pos.fillId,
        closeFillId: fill.id,
        commission: openC.plus(cPer.times(m)),
        fee: openF.plus(fPer.times(m)),
        swap: sPer.times(m),
      });
      pos.commissionTotal = pos.commissionTotal.minus(openC);
      pos.feeTotal = pos.feeTotal.minus(openF);
      pos.lots = pos.lots.minus(m);
      remaining = remaining.minus(m);
      if (pos.lots.isZero()) pos = null;
    }

    if (remaining.gt(0)) {
      if (!pos) {
        pos = {
          side: fill.side,
          lots: remaining,
          avg: fill.price,
          commissionTotal: cPer.times(remaining),
          feeTotal: fPer.times(remaining),
          timeMs: fill.timeMs,
          fillId: fill.id,
        };
      } else {
        pos.avg = pos.avg.times(pos.lots).plus(fill.price.times(remaining)).div(pos.lots.plus(remaining));
        pos.lots = pos.lots.plus(remaining);
        pos.commissionTotal = pos.commissionTotal.plus(cPer.times(remaining));
        pos.feeTotal = pos.feeTotal.plus(fPer.times(remaining));
      }
    }
  }

  const open: OpenLot[] = pos
    ? [
        {
          fillId: pos.fillId,
          side: pos.side,
          lots: pos.lots,
          price: pos.avg,
          timeMs: pos.timeMs,
          commissionPerLot: pos.commissionTotal.div(pos.lots),
          feePerLot: pos.feeTotal.div(pos.lots),
        },
      ]
    : [];
  return { segments, open };
}

/** Adapt a matched segment into the engine's input. Costs are attached only when non-zero. */
export function segmentToClosedTrade(
  seg: Segment,
  spec: InstrumentSpec,
  accountCurrency: string,
  id: string,
): ClosedTrade {
  const broker: NonNullable<ClosedTrade['broker']> = {};
  if (!seg.commission.isZero()) broker.commission = seg.commission;
  if (!seg.swap.isZero()) broker.swap = seg.swap;
  if (!seg.fee.isZero()) broker.fee = seg.fee;
  return {
    id,
    spec,
    side: seg.side,
    lots: seg.lots,
    openPrice: seg.openPrice,
    closePrice: seg.closePrice,
    openTimeMs: seg.openTimeMs,
    closeTimeMs: seg.closeTimeMs,
    accountCurrency,
    ...(Object.keys(broker).length > 0 ? { broker } : {}),
  };
}

export { D };
