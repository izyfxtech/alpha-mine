// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  UnsupportedInstrumentError,
  deriveFxPipSize,
  ecbFixingUtcMs,
  inferInstrument,
  normalizeSymbol,
  roundMoney,
  D,
  serverWallToUtcMs,
  zoneOffsetMs,
} from '@engine/index.ts';

describe('instruments', () => {
  it('strips broker suffixes', () => {
    for (const s of ['EURUSD.a', 'EURUSDm', 'eurusd#', 'EURUSD_i']) {
      expect(normalizeSymbol(s).startsWith('EURUSD')).toBe(true);
      const spec = inferInstrument(s, { digits: 5 });
      expect([spec.base, spec.quote, spec.kind]).toEqual(['EUR', 'USD', 'fx']);
    }
  });

  it('derives pip size from digits (fractional-pip quotes)', () => {
    expect(deriveFxPipSize(5).toString()).toBe('0.0001');
    expect(deriveFxPipSize(4).toString()).toBe('0.0001');
    expect(deriveFxPipSize(3).toString()).toBe('0.01'); // JPY pairs, 3 digits
    expect(deriveFxPipSize(2).toString()).toBe('0.01'); // JPY pairs, 2 digits
  });

  it('classifies metals and gives pip=null (points are the honest unit)', () => {
    const gold = inferInstrument('XAUUSD', { digits: 2 });
    expect(gold.kind).toBe('metal');
    expect(gold.pipSize).toBeNull();
    expect(gold.contractSize.toString()).toBe('100');
    expect(gold.contractSizeSource).toBe('default');
  });

  it('broker-supplied contract size overrides defaults and is marked as such', () => {
    const gold = inferInstrument('XAUUSD', { digits: 2, contractSize: 1 });
    expect(gold.contractSize.toString()).toBe('1');
    expect(gold.contractSizeSource).toBe('broker');
  });

  it('refuses to guess for unclassifiable CFDs; accepts them with explicit profit currency', () => {
    expect(() => inferInstrument('GER40', { digits: 1 })).toThrow(UnsupportedInstrumentError);
    const dax = inferInstrument('GER40', { digits: 1, profitCurrency: 'EUR', contractSize: 1, kind: 'index' });
    expect(dax.profitCurrency).toBe('EUR');
    expect(dax.pipSize).toBeNull();
  });

  it('rejects absurd digits', () => {
    expect(() => inferInstrument('EURUSD', { digits: 12 })).toThrow(/digits/);
  });
});

describe('money rounding', () => {
  it('uses ISO minor units', () => {
    expect(roundMoney(D('1234.5678'), 'USD').toString()).toBe('1234.57');
    expect(roundMoney(D('1234.5678'), 'JPY').toString()).toBe('1235');
    expect(roundMoney(D('1.23456'), 'BHD').toString()).toBe('1.235');
  });
  it('rounds half up (away from zero for positives)', () => {
    expect(roundMoney(D('0.125'), 'USD').toString()).toBe('0.13');
  });
});

describe('server time -> UTC', () => {
  const wall = (y: number, mo: number, d: number, h = 12, mi = 0) => Date.UTC(y, mo - 1, d, h, mi, 0);

  it("'ny-close' is GMT+3 in summer, GMT+2 in winter", () => {
    expect(serverWallToUtcMs(wall(2026, 7, 1), { kind: 'ny-close' })).toBe(wall(2026, 7, 1, 9));
    expect(serverWallToUtcMs(wall(2026, 1, 15), { kind: 'ny-close' })).toBe(wall(2026, 1, 15, 10));
  });

  it("'ny-close' switches on US DST dates (8 Mar 2026 start, 1 Nov 2026 end)", () => {
    expect(serverWallToUtcMs(wall(2026, 3, 7, 23, 59), { kind: 'ny-close' })).toBe(wall(2026, 3, 7, 21, 59)); // +2
    expect(serverWallToUtcMs(wall(2026, 3, 8, 0, 0), { kind: 'ny-close' })).toBe(wall(2026, 3, 7, 21, 0)); // +3
    expect(serverWallToUtcMs(wall(2026, 10, 31, 23, 59), { kind: 'ny-close' })).toBe(wall(2026, 10, 31, 20, 59)); // +3
    expect(serverWallToUtcMs(wall(2026, 11, 1, 0, 0), { kind: 'ny-close' })).toBe(wall(2026, 10, 31, 22, 0)); // +2
  });

  it('fixed offsets and IANA zones', () => {
    expect(serverWallToUtcMs(wall(2026, 7, 1), { kind: 'fixed', offsetMinutes: 120 })).toBe(wall(2026, 7, 1, 10));
    expect(serverWallToUtcMs(wall(2026, 7, 1), { kind: 'iana', zone: 'Europe/Athens' })).toBe(wall(2026, 7, 1, 9));
    expect(serverWallToUtcMs(wall(2026, 1, 15), { kind: 'iana', zone: 'Europe/Athens' })).toBe(wall(2026, 1, 15, 10));
  });

  it('zoneOffsetMs reflects DST', () => {
    expect(zoneOffsetMs('Europe/Berlin', wall(2026, 7, 1))).toBe(2 * 3_600_000);
    expect(zoneOffsetMs('Europe/Berlin', wall(2026, 1, 15))).toBe(3_600_000);
  });

  it('ECB fixing is 16:00 Berlin time (14:00 UTC in CEST, 15:00 UTC in CET)', () => {
    expect(ecbFixingUtcMs('2026-10-23')).toBe(Date.UTC(2026, 9, 23, 14, 0, 0));
    expect(ecbFixingUtcMs('2026-01-15')).toBe(Date.UTC(2026, 0, 15, 15, 0, 0));
  });
});
