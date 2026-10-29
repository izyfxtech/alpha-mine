// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { guessDigits, mapTrade, pickRiskApplications, type InstrumentRow, type JournalRow, type TradeRow } from '@shared/pnl-map.ts';

const base: TradeRow = {
  id: 't1', direction: 'long', entry_at: '2026-10-22T12:00:00Z', exit_at: '2026-10-22T13:00:00Z',
  entry_price: '150.000', exit_price: '150.500', quantity: 1, stop_loss: null, take_profit: null,
  gross_pnl: 332, net_pnl: 332, fees: 0, commission: null, swap: null, risk_amount: null,
  source: 'mt5', raw_symbol: 'USDJPY', is_break_even: false, pnl_manual: true, instrument_id: 'i1',
};
const ins: InstrumentRow = { id: 'i1', symbol: 'USDJPY', contract_size: null, digits: null, profit_currency: null, kind: null };
const lotsJournal: JournalRow = { id: 'j', currency: 'usd', quantity_unit: 'lots' };

describe('mapTrade', () => {
  it('maps an imported MT5 trade, using the file profit as the broker figure', () => {
    const m = mapTrade(base, ins, lotsJournal, guessDigits([base]));
    if (!('trade' in m)) throw new Error(m.skip);
    expect(m.trade.side).toBe('buy');
    expect(m.trade.lots.toString()).toBe('1');
    expect(m.trade.accountCurrency).toBe('USD');
    expect(m.trade.broker?.profit?.toString()).toBe('332');
    expect(m.trade.spec.digits).toBe(3);
    expect(m.notes.join(' ')).toMatch(/digits inferred/);
  });
  it('never overwrites P&L typed in by hand', () => {
    expect(mapTrade({ ...base, source: 'manual' }, ins, lotsJournal, new Map())).toEqual({ skip: 'P&L entered by hand is never overwritten' });
  });
  it('skips instead of guessing when the journal quantity unit is unknown', () => {
    const m = mapTrade(base, ins, { ...lotsJournal, quantity_unit: null }, new Map());
    expect(m).toEqual({ skip: 'journal quantity unit (lots or units) is not set' });
  });
  it('converts units to lots with the contract size', () => {
    const m = mapTrade({ ...base, quantity: 50000 }, ins, { ...lotsJournal, quantity_unit: 'units' }, new Map());
    if (!('trade' in m)) throw new Error(m.skip);
    expect(m.trade.lots.toString()).toBe('0.5');
  });
  it('treats short as a sell and passes costs through', () => {
    const m = mapTrade({ ...base, direction: 'short', commission: -7, swap: -1.5 }, ins, lotsJournal, new Map());
    if (!('trade' in m)) throw new Error(m.skip);
    expect(m.trade.side).toBe('sell');
    expect([m.trade.broker?.commission?.toString(), m.trade.broker?.swap?.toString()]).toEqual(['-7', '-1.5']);
  });
  it('falls back to AlphaMine fees (a positive cost) as a negative fee', () => {
    const m = mapTrade({ ...base, fees: 4.2 }, ins, lotsJournal, new Map());
    if (!('trade' in m)) throw new Error(m.skip);
    expect(m.trade.broker?.fee?.toString()).toBe('-4.2');
  });
  it('skips break even, unclosed and unsupported rows with a reason', () => {
    expect(mapTrade({ ...base, is_break_even: true }, ins, lotsJournal, new Map())).toHaveProperty('skip');
    expect(mapTrade({ ...base, exit_price: null }, ins, lotsJournal, new Map())).toHaveProperty('skip');
    expect(mapTrade({ ...base, raw_symbol: 'GER40' }, { ...ins, symbol: 'GER40' }, lotsJournal, new Map())).toHaveProperty('skip');
  });
});

describe('pickRiskApplications', () => {
  it('keeps only computed, not yet applied rows with a positive planned risk, once per trade', () => {
    const rows = [
      { trade_id: 'a', status: 'computed', planned_risk: '12.5' },
      { trade_id: 'a', status: 'computed', planned_risk: '99' }, // duplicate trade: first wins
      { trade_id: 'b', status: 'computed', planned_risk: null },
      { trade_id: 'c', status: 'skipped', planned_risk: 5 },
      { trade_id: 'd', status: 'computed', planned_risk: 0 },
      { trade_id: 'e', status: 'computed', planned_risk: 3, applied: true },
      { trade_id: 'f', status: 'computed', planned_risk: 7 },
    ];
    expect(pickRiskApplications(rows)).toEqual([{ trade_id: 'a', risk_amount: 12.5 }, { trade_id: 'f', risk_amount: 7 }]);
  });
});
