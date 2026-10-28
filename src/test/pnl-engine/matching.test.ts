// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { D, matchAverage, matchFifo, segmentToClosedTrade, inferInstrument, type Fill, type Side } from '../../../supabase/functions/_shared/pnl-engine/index.ts';

const fill = (id: string, side: Side, lots: string, price: string, t: number, extra: Partial<Fill> = {}): Fill => ({
  id,
  side,
  lots: D(lots),
  price: D(price),
  timeMs: t,
  ...extra,
});

describe('matchFifo', () => {
  it('splits a partial close across lots oldest-first and allocates costs pro rata', () => {
    const { segments, open } = matchFifo([
      fill('b1', 'buy', '1', '1.1000', 1, { commission: D('-3.5') }),
      fill('b2', 'buy', '1', '1.1020', 2),
      fill('s1', 'sell', '1.5', '1.1050', 3, { commission: D('-5.25'), swap: D('-0.3') }),
    ]);
    expect(segments).toHaveLength(2);

    // first segment consumes the whole first lot
    expect(segments[0]!.lots.toString()).toBe('1');
    expect(segments[0]!.openPrice.toString()).toBe('1.1');
    expect(segments[0]!.closePrice.toString()).toBe('1.105');
    expect(segments[0]!.commission.toString()).toBe('-7'); // -3.5 (open) + -3.5 (close share)
    expect(segments[0]!.swap.toString()).toBe('-0.2');

    // second segment consumes half of the second lot
    expect(segments[1]!.lots.toString()).toBe('0.5');
    expect(segments[1]!.openPrice.toString()).toBe('1.102');
    expect(segments[1]!.commission.toString()).toBe('-1.75'); // only the closing share; b2 had no commission
    expect(segments[1]!.swap.toString()).toBe('-0.1');

    // conservation: allocated closing commission equals what was charged
    const total = segments.reduce((a, s) => a.plus(s.commission), D(0));
    expect(total.toString()).toBe('-8.75'); // -3.5 (b1) + -5.25 (s1)

    expect(open).toHaveLength(1);
    expect(open[0]!.lots.toString()).toBe('0.5');
    expect(open[0]!.price.toString()).toBe('1.102');
  });

  it('a fill larger than the open position closes it and flips the remainder', () => {
    const { segments, open } = matchFifo([
      fill('b1', 'buy', '1', '1.1000', 1),
      fill('s1', 'sell', '2', '1.2000', 2),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.side).toBe('buy');
    expect(open).toHaveLength(1);
    expect(open[0]!.side).toBe('sell');
    expect(open[0]!.lots.toString()).toBe('1');
    expect(open[0]!.price.toString()).toBe('1.2');
  });

  it('is order-stable for fills with identical timestamps', () => {
    const { segments } = matchFifo([
      fill('b1', 'buy', '1', '1.1', 5),
      fill('s1', 'sell', '1', '1.2', 5),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.openFillId).toBe('b1');
  });

  it('rejects zero-lot fills', () => {
    expect(() => matchFifo([fill('x', 'buy', '0', '1.1', 1)])).toThrow(/lots/);
  });

  it('adapts a segment into an engine trade, attaching only non-zero costs', () => {
    const spec = inferInstrument('EURUSD', { digits: 5, contractSize: 100000 });
    const { segments } = matchFifo([fill('b', 'buy', '1', '1.1', 1, { commission: D('-3') }), fill('s', 'sell', '1', '1.2', 2)]);
    const t = segmentToClosedTrade(segments[0]!, spec, 'USD', 'seg-1');
    expect(t.broker!.commission!.toString()).toBe('-3');
    expect(t.broker!.swap).toBeUndefined();
  });
});

describe('matchAverage', () => {
  it('closes against the volume-weighted average entry', () => {
    const { segments, open } = matchAverage([
      fill('b1', 'buy', '1', '1.10', 1),
      fill('b2', 'buy', '1', '1.20', 2),
      fill('s1', 'sell', '1', '1.30', 3),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.openPrice.toString()).toBe('1.15');
    expect(segments[0]!.closePrice.toString()).toBe('1.3');
    expect(open[0]!.lots.toString()).toBe('1');
    expect(open[0]!.price.toString()).toBe('1.15'); // average is unchanged by a partial close
  });

  it('flips direction on an over-sized closing fill', () => {
    const { segments, open } = matchAverage([fill('b', 'buy', '1', '1.1', 1), fill('s', 'sell', '3', '1.2', 2)]);
    expect(segments).toHaveLength(1);
    expect(open[0]!.side).toBe('sell');
    expect(open[0]!.lots.toString()).toBe('2');
  });

  it('FIFO and average-cost differ per trade but agree on total P&L (price component)', () => {
    const fills = [
      fill('b1', 'buy', '1', '1.10', 1),
      fill('b2', 'buy', '1', '1.20', 2),
      fill('s1', 'sell', '2', '1.30', 3),
    ];
    const pnl = (segs: ReturnType<typeof matchFifo>['segments']) =>
      segs.reduce((a, s) => a.plus(s.closePrice.minus(s.openPrice).times(s.lots)), D(0));
    expect(pnl(matchFifo(fills).segments).toString()).toBe('0.3'); // 0.2 + 0.1
    expect(pnl(matchAverage(fills).segments).toString()).toBe('0.3'); // 0.15 x 2
  });
});
