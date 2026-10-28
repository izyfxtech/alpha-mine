// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  D,
  ImpliedRateProvider,
  PnlEngine,
  RateResolver,
  inferInstrument,
  roundMoney,
  type ClosedTrade,
  type Side,
} from '../../../supabase/functions/_shared/pnl-engine/index.ts';
import { HOUR, StaticProvider, T0 } from './helpers.ts';

const eurusd = inferInstrument('EURUSD', { digits: 5, contractSize: 100000 });
const usdjpy = inferInstrument('USDJPY', { digits: 3, contractSize: 100000 });
const eurgbp = inferInstrument('EURGBP', { digits: 5, contractSize: 100000 });

function trade(p: {
  spec: ClosedTrade['spec'];
  side: Side;
  lots: string;
  open: string;
  close: string;
  acct: string;
  id?: string;
  closeAt?: number;
  broker?: ClosedTrade['broker'];
  sl?: string;
}): ClosedTrade {
  return {
    id: p.id ?? 't1',
    spec: p.spec,
    side: p.side,
    lots: D(p.lots),
    openPrice: D(p.open),
    closePrice: D(p.close),
    openTimeMs: T0,
    closeTimeMs: p.closeAt ?? T0 + HOUR,
    accountCurrency: p.acct,
    ...(p.broker ? { broker: p.broker } : {}),
    ...(p.sl ? { stopLoss: D(p.sl) } : {}),
  };
}

function engineWith(table: Record<string, string>) {
  const rates = new RateResolver({ providers: [new StaticProvider('static', table)] });
  return new PnlEngine({ rates });
}

describe('computed path: textbook examples', () => {
  it('EURUSD buy 1 lot 1.0850 -> 1.0900 in a USD account = +$500, 50 pips', async () => {
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '1', open: '1.0850', close: '1.0900', acct: 'USD' }),
    );
    expect(r.grossAccount!.toString()).toBe('500');
    expect(r.pips!.toString()).toBe('50');
    expect(r.grossSource).toBe('computed');
    expect(r.conversion!.source).toBe('identity');
    expect(r.pipValueAccount!.toString()).toBe('10');
  });

  it('USDJPY buy 1 lot 150.000 -> 150.500 in a USD account converts JPY at the close rate', async () => {
    const r = await engineWith({ USDJPY: '150.5' }).computeClosed(
      trade({ spec: usdjpy, side: 'buy', lots: '1', open: '150.000', close: '150.500', acct: 'USD' }),
    );
    expect(r.grossInProfitCurrency.toString()).toBe('50000'); // JPY
    expect(r.pips!.toString()).toBe('50');
    expect(roundMoney(r.grossAccount!, 'USD').toFixed(2)).toBe('332.23'); // 50000 / 150.5
    expect(roundMoney(r.pipValueAccount!, 'USD').toFixed(2)).toBe('6.64'); // 1000 / 150.5
  });

  it('EURGBP sell 0.5 lot 0.8600 -> 0.8550 in a USD account multiplies by GBPUSD', async () => {
    const r = await engineWith({ GBPUSD: '1.30' }).computeClosed(
      trade({ spec: eurgbp, side: 'sell', lots: '0.5', open: '0.8600', close: '0.8550', acct: 'USD' }),
    );
    expect(r.grossInProfitCurrency.toString()).toBe('250'); // GBP
    expect(r.pips!.toString()).toBe('50');
    expect(roundMoney(r.grossAccount!, 'USD').toFixed(2)).toBe('325.00');
  });

  it('EURUSD in a EUR account divides by EURUSD (inverse leg)', async () => {
    const r = await engineWith({ EURUSD: '1.12' }).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '0.1', open: '1.1000', close: '1.1010', acct: 'EUR' }),
    );
    expect(r.grossInProfitCurrency.toString()).toBe('10'); // USD
    expect(roundMoney(r.grossAccount!, 'EUR').toFixed(2)).toBe('8.93'); // 10 / 1.12
  });

  it('a losing short is negative', async () => {
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'sell', lots: '1', open: '1.1000', close: '1.1020', acct: 'USD' }),
    );
    expect(r.grossAccount!.toString()).toBe('-200');
    expect(r.pips!.toString()).toBe('-20');
  });

  it('decimal math is exact where floating point is not', async () => {
    // 0.07 lot x 100000 x 0.00033 -> 2.31 exactly; JS floats give 2.3100000000000005 territory
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '0.07', open: '1.10000', close: '1.10033', acct: 'USD' }),
    );
    expect(r.grossAccount!.toString()).toBe('2.31');
  });
});

describe('unpriced and costs', () => {
  it('refuses to guess when no rate is fresh enough', async () => {
    const stale = new StaticProvider('stale', { USDJPY: '150.5' }, { lagMs: HOUR, maxStalenessMs: 5 * 60_000 });
    const eng = new PnlEngine({ rates: new RateResolver({ providers: [stale] }) });
    const r = await eng.computeClosed(
      trade({ spec: usdjpy, side: 'buy', lots: '1', open: '150.000', close: '150.500', acct: 'USD' }),
    );
    expect(r.grossSource).toBe('unpriced');
    expect(r.grossAccount).toBeNull();
    expect(r.netAccount).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/No JPY->USD rate/);
  });

  it('net = gross + swap + commission + fee with costs as signed amounts', async () => {
    const r = await engineWith({}).computeClosed(
      trade({
        spec: eurusd,
        side: 'buy',
        lots: '1',
        open: '1.0850',
        close: '1.0900',
        acct: 'USD',
        broker: { swap: D('-1.5'), commission: D('-7'), fee: D('-0.25') },
      }),
    );
    expect(r.grossAccount!.toString()).toBe('500');
    expect(r.netAccount!.toString()).toBe('491.25');
    expect(r.costsReported).toBe(true);
  });

  it('warns when no costs were supplied', async () => {
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '1', open: '1.0850', close: '1.0900', acct: 'USD' }),
    );
    expect(r.costsReported).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/No swap\/commission\/fee/);
  });

  it('warns when contract size is only a default', async () => {
    const spec = inferInstrument('EURUSD', { digits: 5 });
    const r = await engineWith({}).computeClosed(
      trade({ spec, side: 'buy', lots: '1', open: '1.0850', close: '1.0900', acct: 'USD' }),
    );
    expect(r.warnings.join(' ')).toMatch(/default assumption/);
  });
});

describe('broker-authoritative path and reconciliation', () => {
  const jpyTrade = (broker: ClosedTrade['broker'], id = 'j1', closeAt = T0 + HOUR) =>
    trade({ spec: usdjpy, side: 'buy', lots: '1', open: '150.000', close: '150.500', acct: 'USD', id, closeAt, broker });

  it("stores the broker's number and reconciles it against an independent rate", async () => {
    const eng = engineWith({ USDJPY: '150.5' });
    const r = await eng.computeClosed(
      jpyTrade({ profit: D('332.00'), commission: D('-7'), swap: D('-1.5') }),
    );
    expect(r.grossSource).toBe('broker');
    expect(r.grossAccount!.toString()).toBe('332');
    expect(r.netAccount!.toString()).toBe('323.5');
    expect(r.reconciliation!.status).toBe('OK'); // 0.23 off, well inside 0.05 + 0.3%
    expect(roundMoney(r.computedGross!, 'USD').toFixed(2)).toBe('332.23');
  });

  it('with no independent rate, keeps the broker figure, reports WARN and says why', async () => {
    const r = await engineWith({}).computeClosed(jpyTrade({ profit: D('332.00') }));
    expect(r.grossSource).toBe('broker');
    expect(r.grossAccount!.toString()).toBe('332');
    expect(r.reconciliation!.status).toBe('WARN');
    expect(r.computedGross).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/stored unverified: no independent JPY->USD rate/);
    // the implied rate is still learned: it does not depend on an external rate
    expect(r.impliedRate!.rate.toString()).toBe('0.00664');
  });

  it('back-solves the exact broker conversion rate', async () => {
    const r = await engineWith({ USDJPY: '150.5' }).computeClosed(jpyTrade({ profit: D('332.00') }));
    expect(r.impliedRate!.base).toBe('JPY');
    expect(r.impliedRate!.quote).toBe('USD');
    expect(r.impliedRate!.rate.toString()).toBe('0.00664'); // 332 / 50000
    expect(r.impliedRate!.kind).toBe('implied');
  });

  it('flags a power-of-ten error and does NOT learn a rate from a bad trade', async () => {
    const implied = new ImpliedRateProvider({ scope: 'acct-1' });
    const rates = new RateResolver({ providers: [new StaticProvider('ext', { USDJPY: '150.5' })] });
    const eng = new PnlEngine({ rates, implied, validationRates: rates });
    const r = await eng.computeClosed(jpyTrade({ profit: D('3322.26') }));
    expect(r.reconciliation!.status).toBe('MISMATCH');
    expect(r.reconciliation!.diagnosis.join(' ')).toMatch(/power of ten/);
    expect(r.warnings.join(' ')).toMatch(/disagrees/);
    expect(implied.size()).toBe(0);
  });

  it('flags opposite signs as a probable side reversal', async () => {
    const r = await engineWith({ USDJPY: '150.5' }).computeClosed(jpyTrade({ profit: D('-332.00') }));
    expect(r.reconciliation!.status).toBe('MISMATCH');
    expect(r.reconciliation!.diagnosis.join(' ')).toMatch(/Opposite signs/);
    expect(r.warnings.join(' ')).toMatch(/sign contradicts/);
  });

  it('uses a rate learned from one trade to price the next trade the broker never valued', async () => {
    const implied = new ImpliedRateProvider({ scope: 'acct-1' });
    const ext = new StaticProvider('ext', { USDJPY: '150.5' });
    const eng = new PnlEngine({
      rates: new RateResolver({ providers: [implied, ext] }), // implied first: most accurate
      validationRates: new RateResolver({ providers: [ext] }), // external only: no circular check
      implied,
    });

    const first = await eng.computeClosed(jpyTrade({ profit: D('332.00') }, 'j1', T0 + HOUR));
    expect(first.reconciliation!.status).toBe('OK');
    expect(implied.size()).toBe(1);

    // Ten minutes later, no broker profit supplied (e.g. a CSV row without a profit column):
    const second = await eng.computeClosed(
      trade({ spec: usdjpy, side: 'buy', lots: '0.5', open: '148.000', close: '148.200', acct: 'USD', id: 'j2', closeAt: T0 + HOUR + 600_000 }),
    );
    expect(second.grossSource).toBe('computed');
    expect(second.conversion!.kind).toBe('implied');
    expect(second.grossAccount!.toString()).toBe('66.4'); // 0.2 * 50000 * 0.00664
  });
});

describe('planned risk and R-multiple', () => {
  it('R = net / (|entry - SL| x units x entry-time rate)', async () => {
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '1', open: '1.1000', close: '1.1050', acct: 'USD', sl: '1.0950' }),
    );
    expect(r.plannedRisk!.toString()).toBe('500');
    expect(r.rMultiple!.toString()).toBe('1');
  });

  it('skips R when the stop was trailed to/over break-even', async () => {
    const r = await engineWith({}).computeClosed(
      trade({ spec: eurusd, side: 'buy', lots: '1', open: '1.1000', close: '1.1050', acct: 'USD', sl: '1.1010' }),
    );
    expect(r.plannedRisk).toBeNull();
    expect(r.rMultiple).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/trailed/);
  });
});

describe('mark-to-market', () => {
  const pos = (side: Side) => ({
    id: 'p1',
    spec: eurusd,
    side,
    lots: D('1'),
    openPrice: D('1.1000'),
    openTimeMs: T0,
    accountCurrency: 'USD',
  });
  const q = { bid: D('1.1010'), ask: D('1.1012') };

  it('values longs at BID', async () => {
    const f = await engineWith({}).markToMarket(pos('buy'), q, T0 + HOUR);
    expect(f.grossAccount!.toString()).toBe('100');
    expect(f.pips!.toString()).toBe('10');
  });

  it('values shorts at ASK', async () => {
    const f = await engineWith({}).markToMarket(pos('sell'), q, T0 + HOUR);
    expect(f.grossAccount!.toString()).toBe('-120');
  });
});

describe('input validation', () => {
  it('rejects non-positive lots, bad prices and time travel', async () => {
    const eng = engineWith({});
    await expect(eng.computeClosed(trade({ spec: eurusd, side: 'buy', lots: '0', open: '1', close: '1', acct: 'USD' }))).rejects.toThrow(/lots/);
    await expect(eng.computeClosed(trade({ spec: eurusd, side: 'buy', lots: '1', open: '0', close: '1', acct: 'USD' }))).rejects.toThrow(/prices/);
    await expect(
      eng.computeClosed(trade({ spec: eurusd, side: 'buy', lots: '1', open: '1', close: '1', acct: 'USD', closeAt: T0 - 1 })),
    ).rejects.toThrow(/closeTime/);
  });
});
