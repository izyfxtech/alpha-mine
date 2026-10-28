// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { D, buildPositions, matchFifo, type Fill } from '../../../supabase/functions/_shared/pnl-engine/index.ts';

const f = (id: string, side: 'buy' | 'sell', lots: string, price: string, t: number, extra: Partial<Fill> = {}): Fill => ({ id, side, lots: D(lots), price: D(price), timeMs: t, ...extra });

describe('buildPositions', () => {
  it('scales in and out of one position and reports weighted averages', () => {
    const r = buildPositions([
      f('a', 'buy', '1', '100', 1), f('b', 'buy', '3', '104', 2), // avg entry 103
      f('c', 'sell', '1', '110', 3), f('d', 'sell', '3', '106', 4), // avg exit 107
    ]);
    expect(r.open).toBeNull();
    expect(r.closed).toHaveLength(1);
    const p = r.closed[0]!;
    expect(p.side).toBe('buy');
    expect(p.lots.toString()).toBe('4');
    expect(p.avgEntry.toString()).toBe('103');
    expect(p.avgExit!.toString()).toBe('107');
    expect([p.openTimeMs, p.closeTimeMs]).toEqual([1, 4]);
    expect(p.entries).toHaveLength(2);
    expect(p.exits).toHaveLength(2);
  });

  it('matches the FIFO matcher in total price move (method does not change totals)', () => {
    const fills = [f('a', 'buy', '1', '100', 1), f('b', 'buy', '3', '104', 2), f('c', 'sell', '2', '110', 3), f('d', 'sell', '2', '106', 4)];
    const p = buildPositions(fills).closed[0]!;
    const viaPosition = p.avgExit!.minus(p.avgEntry).times(p.lots);
    const viaFifo = matchFifo(fills).segments.reduce((s, g) => s.plus(g.closePrice.minus(g.openPrice).times(g.lots)), D(0));
    expect(viaPosition.toString()).toBe(viaFifo.toString());
  });

  it('keeps a partially closed position open with its exits so far', () => {
    const r = buildPositions([f('a', 'sell', '2', '50', 1), f('b', 'buy', '0.5', '48', 2)]);
    expect(r.closed).toEqual([]);
    expect(r.open!.side).toBe('sell');
    expect(r.open!.remaining.toString()).toBe('1.5');
    expect(r.open!.avgExit!.toString()).toBe('48');
  });

  it('splits a flipping fill at zero and shares its costs by size', () => {
    const r = buildPositions([
      f('a', 'buy', '1', '100', 1, { commission: D(-1) }),
      f('b', 'sell', '3', '110', 2, { commission: D(-3) }), // closes 1, opens 2 short
    ]);
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]!.commission.toString()).toBe('-2'); // -1 on entry, -1 (1/3 of -3) on exit
    expect(r.open!.side).toBe('sell');
    expect(r.open!.lots.toString()).toBe('2');
    expect(r.open!.commission.toString()).toBe('-2'); // the other 2/3 of the flipping fill
  });

  it('orders by time with input order as tiebreak and rejects bad fills', () => {
    const r = buildPositions([f('x', 'sell', '1', '11', 5), f('y', 'buy', '1', '10', 5)]);
    // Same timestamp: input order decides, so this is a short (sell first) that the buy closes.
    expect(r.closed.map((p) => p.side)).toEqual(['sell']);
    expect(() => buildPositions([f('z', 'buy', '0', '1', 1)])).toThrow(/lots/);
    expect(() => buildPositions([f('z', 'buy', '1', '0', 1)])).toThrow(/price/);
  });

  it('treats sequential round trips as separate positions', () => {
    const r = buildPositions([f('a', 'buy', '1', '10', 1), f('b', 'sell', '1', '11', 2), f('c', 'sell', '1', '12', 3), f('d', 'buy', '1', '11', 4)]);
    expect(r.closed.map((p) => p.side)).toEqual(['buy', 'sell']);
  });
});
