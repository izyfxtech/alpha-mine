import { calcSignOk } from './guards.ts';
import { D, Dec, ZERO } from './decimal.ts';
import { grossInProfitCurrency, pipValueInProfitCurrency, pipsMoved, priceDelta, unitsOf } from './calc.ts';
import { deriveImpliedRate, type ImpliedRateProvider } from './rates/implied.ts';
import type { RateResolver } from './rates/resolver.ts';
import type { RateObservation } from './rates/types.ts';
import {
  absoluteToleranceFor,
  reconcile,
  relativeToleranceFor,
  type Reconciliation,
  type Tolerance,
} from './reconcile.ts';
import type { ClosedTrade, OpenPosition } from './types.ts';

export interface EngineOptions {
  /**
   * Resolver used to PRICE trades when the broker gave no profit figure.
   * May include broker-implied rates: they are the most accurate source.
   */
  rates: RateResolver;
  /**
   * Resolver used to VALIDATE broker-reported profit. Must NOT include the
   * implied-rate provider, otherwise the check is circular (a trade would be
   * validated against a rate back-solved from itself). Defaults to `rates`.
   */
  validationRates?: RateResolver;
  /** When set, every broker-profit trade teaches the engine a conversion rate. */
  implied?: ImpliedRateProvider;
  /** Override tolerance policy. Default adapts to rate quality and account currency. */
  tolerance?: (accountCurrency: string, conversion: RateObservation | null) => Tolerance;
}

export type BatchItem = { tradeId: string; result: PnlResult } | { tradeId: string; error: string };

export type GrossSource = 'broker' | 'computed' | 'unpriced';

export interface PnlResult {
  tradeId: string;
  accountCurrency: string;
  profitCurrency: string;

  /** Raw result in the instrument's profit currency. */
  grossInProfitCurrency: Dec;
  pips: Dec | null;
  /** Value of one pip for this size, in account currency, at the close-time rate. null if unpriced. */
  pipValueAccount: Dec | null;

  /** Conversion used for our own calculation (null if profit currency == account currency is NOT the case and nothing could be priced). */
  conversion: RateObservation | null;
  /** Our independent gross figure in account currency. */
  computedGross: Dec | null;
  /** The number of record. Broker's when supplied, else ours. */
  grossAccount: Dec | null;
  grossSource: GrossSource;

  /** Signed, account currency; zero when not reported. */
  swap: Dec;
  commission: Dec;
  fee: Dec;
  costsReported: boolean;
  netAccount: Dec | null;

  reconciliation: Reconciliation | null;
  /** The conversion rate back-solved from the broker's own number (if learnable). */
  impliedRate: RateObservation | null;

  /** Planned risk in account currency at ENTRY-time rate. null without a valid initial SL. */
  plannedRisk: Dec | null;
  /** The entry-time conversion behind plannedRisk. Persist it so R-multiples are reproducible. */
  openConversion: RateObservation | null;
  /**
   * NET result (after swap, commission and fee) divided by planned risk. A trade that wins
   * 1.0 gross but pays costs therefore shows slightly under 1R. Divide grossAccount by
   * plannedRisk yourself if you prefer a gross basis.
   */
  rMultiple: Dec | null;

  warnings: string[];
}

export interface FloatingResult {
  positionId: string;
  grossAccount: Dec | null;
  netAccount: Dec | null;
  pips: Dec | null;
  conversion: RateObservation | null;
  warnings: string[];
}

export class PnlEngine {
  constructor(private readonly o: EngineOptions) {
    // Without a separate validation resolver, broker profits would be checked against rates
    // learned from other broker profits: the check could no longer catch a systematic error.
    if (o.implied && !o.validationRates) {
      throw new Error(
        'PnlEngine: `implied` requires `validationRates` (an external-only resolver). ' +
          'Validating broker profit against broker-implied rates is circular.',
      );
    }
  }

  async computeClosed(t: ClosedTrade): Promise<PnlResult> {
    const warnings: string[] = [];
    this.validate(t, warnings);

    const acct = t.accountCurrency.toUpperCase();
    const pc = t.spec.profitCurrency;
    const grossQ = grossInProfitCurrency(t.spec, t.side, t.lots, t.openPrice, t.closePrice);
    const pips = pipsMoved(t.spec, t.side, t.openPrice, t.closePrice);
    const pipValQ = pipValueInProfitCurrency(t.spec, t.lots);

    if (t.spec.contractSizeSource === 'default') {
      warnings.push(`Contract size for ${t.spec.symbol} is a default assumption, not broker-confirmed.`);
    }

    // ---- which resolver prices this trade? -----------------------------------
    const brokerProfit = t.broker?.profit;
    const hasBrokerProfit = brokerProfit !== undefined;
    const pricingResolver = hasBrokerProfit ? (this.o.validationRates ?? this.o.rates) : this.o.rates;

    const conversion = await pricingResolver.resolve(pc, acct, t.closeTimeMs);
    const computedGross = conversion ? grossQ.times(conversion.rate) : null;

    // ---- number of record ----------------------------------------------------
    let grossAccount: Dec | null;
    let grossSource: GrossSource;
    let reconciliation: Reconciliation | null = null;
    let impliedRate: RateObservation | null = null;

    if (hasBrokerProfit) {
      grossAccount = brokerProfit;
      grossSource = 'broker';
      const tol = this.o.tolerance
        ? this.o.tolerance(acct, conversion)
        : { absolute: absoluteToleranceFor(acct), relative: relativeToleranceFor(conversion) };
      reconciliation = reconcile(brokerProfit, computedGross, tol, conversion ? conversion.source : null);
      if (reconciliation.status === 'MISMATCH') warnings.push('Broker profit disagrees with independent calculation.');
      if (computedGross === null) {
        warnings.push(`Broker profit stored unverified: no independent ${pc}->${acct} rate was available.`);
      }

      impliedRate = deriveImpliedRate({
        spec: t.spec,
        side: t.side,
        lots: t.lots,
        openPrice: t.openPrice,
        closePrice: t.closePrice,
        brokerProfit,
        accountCurrency: acct,
        closeTimeMs: t.closeTimeMs,
        source: `broker-implied:${t.id}`,
      });
      // Learn only from trades we can trust: those that reconcile (OK), or that cannot be checked at
      // all because no independent rate exists. A WARN or MISMATCH WITH an independent figure means
      // the numbers disagree, and recording it would poison the rate series.
      const trusted = reconciliation.status === 'OK' || computedGross === null;
      if (impliedRate && this.o.implied && trusted) this.o.implied.record(impliedRate);
    } else if (computedGross) {
      grossAccount = computedGross;
      grossSource = 'computed';
      if (conversion && conversion.kind !== 'implied' && conversion.source !== 'identity') {
        const worst = describeQuality(conversion);
        if (worst === 'daily-fix') warnings.push('Converted at a daily reference rate: approximate (can differ by ~1%).');
      }
    } else {
      grossAccount = null;
      grossSource = 'unpriced';
      warnings.push(`No ${pc}->${acct} rate available at close time: P&L left unpriced rather than guessed.`);
    }

    // ---- costs ---------------------------------------------------------------
    const swap = t.broker?.swap ?? ZERO;
    const commission = t.broker?.commission ?? ZERO;
    const fee = t.broker?.fee ?? ZERO;
    const costsReported =
      t.broker?.swap !== undefined || t.broker?.commission !== undefined || t.broker?.fee !== undefined;
    if (!costsReported) warnings.push('No swap/commission/fee supplied: net equals gross and may overstate results.');
    const netAccount = grossAccount ? grossAccount.plus(swap).plus(commission).plus(fee) : null;

    // ---- planned risk & R ----------------------------------------------------
    let plannedRisk: Dec | null = null;
    let rMultiple: Dec | null = null;
    let openConversion: RateObservation | null = null;
    if (t.stopLoss) {
      const riskDelta = priceDelta(t.side, t.openPrice, t.stopLoss); // negative when SL is on the loss side
      if (riskDelta.gte(0)) {
        warnings.push('Stop loss is at/beyond break-even (likely trailed): planned risk unknown, R-multiple skipped.');
      } else {
        const openConv = await this.o.rates.resolve(pc, acct, t.openTimeMs);
        if (openConv) {
          openConversion = openConv;
          plannedRisk = riskDelta.abs().times(unitsOf(t.spec, t.lots)).times(openConv.rate);
          if (netAccount && plannedRisk.gt(0)) rMultiple = netAccount.div(plannedRisk);
        } else warnings.push('No entry-time rate for planned risk.');
      }
    }

    const pipValueAccount = pipValQ && conversion ? pipValQ.times(conversion.rate) : null;

    return {
      tradeId: t.id,
      accountCurrency: acct,
      profitCurrency: pc,
      grossInProfitCurrency: grossQ,
      pips,
      pipValueAccount,
      conversion,
      computedGross,
      grossAccount,
      grossSource,
      swap,
      commission,
      fee,
      costsReported,
      netAccount,
      reconciliation,
      impliedRate,
      plannedRisk,
      openConversion,
      rMultiple,
      warnings,
    };
  }

  /**
   * Compute many trades without letting one bad row abort the batch. Runs sequentially and in the
   * order given, because implied rates learned from earlier trades feed later ones.
   * Invalid trades (bad lots, prices or timestamps) come back as `{ error }` instead of throwing.
   */
  async computeMany(trades: ClosedTrade[]): Promise<BatchItem[]> {
    const out: BatchItem[] = [];
    for (const t of trades) {
      try {
        out.push({ tradeId: t.id, result: await this.computeClosed(t) });
      } catch (err) {
        out.push({ tradeId: t.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return out;
  }

  /**
   * Floating (unrealised) P&L. A long exits at BID, a short exits at ASK:
   * valuing open trades at mid flatters them by half the spread.
   */
  async markToMarket(p: OpenPosition, quote: { bid: Dec; ask: Dec }, atMs: number): Promise<FloatingResult> {
    const warnings: string[] = [];
    const exit = p.side === 'buy' ? quote.bid : quote.ask;
    const acct = p.accountCurrency.toUpperCase();
    const pc = p.spec.profitCurrency;
    const grossQ = grossInProfitCurrency(p.spec, p.side, p.lots, p.openPrice, exit);
    const conversion = await this.o.rates.resolve(pc, acct, atMs);
    const gross = conversion ? grossQ.times(conversion.rate) : null;
    if (!gross) warnings.push(`No ${pc}->${acct} rate at ${new Date(atMs).toISOString()}.`);
    const costs = (p.broker?.swap ?? ZERO).plus(p.broker?.commission ?? ZERO).plus(p.broker?.fee ?? ZERO);
    return {
      positionId: p.id,
      grossAccount: gross,
      netAccount: gross ? gross.plus(costs) : null,
      pips: pipsMoved(p.spec, p.side, p.openPrice, exit),
      conversion,
      warnings,
    };
  }

  private validate(t: ClosedTrade, warnings: string[]): void {
    if (!t.lots.gt(0)) throw new RangeError(`Trade ${t.id}: lots must be > 0`);
    if (!t.openPrice.gt(0) || !t.closePrice.gt(0)) throw new RangeError(`Trade ${t.id}: prices must be > 0`);
    if (t.closeTimeMs < t.openTimeMs) throw new RangeError(`Trade ${t.id}: closeTime precedes openTime`);
    calcSignOk(t, warnings);
  }
}

/** Loosest rate kind in a conversion chain. */
function describeQuality(o: RateObservation): RateObservation['kind'] {
  if (o.lineage && o.lineage.length > 0) {
    const kinds = o.lineage.map(describeQuality);
    return kinds.includes('daily-fix') ? 'daily-fix' : kinds[0]!;
  }
  return o.kind;
}

export { D };
