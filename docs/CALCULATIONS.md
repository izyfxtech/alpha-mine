# Calculations

Every trade number in AlphaMine comes from two small files: `src/lib/pnl/calc.ts` (the formulas) and `src/lib/pnl/instrument-catalogue.ts` (which asset class a symbol is). Nothing else computes R or trade money.

## R-multiple

```
R = side x (exit - entry) / |entry - initial stop|        side = +1 long, -1 short
```

- Prices only. No quantity, lots, contract size, currency or exchange rate, so it is identical for every instrument.
- Needs entry, exit and a stop on the losing side of entry. Otherwise it is blank (never 0, never a guess). A stop moved to or past break-even no longer says what was risked, so it gives blank too.
- Break-even trades are 0R. Open trades have no R (the Open Trades page shows a what-if at a price you type).
- It is gross of costs: R measures the trade against its stop. Net P&L still includes commission, swap and other fees.
- Planned reward:risk uses the same function with the take-profit as the price.
- Statistics (average R, total R, SQN) count only trades that have an R; a missing R is never treated as 0.

## Money

```
gross = side x (exit - entry) x quantity x contract size        (in the instrument's quote currency)
net   = gross - (commission + swap + other fees)
risk  = |entry - stop| x quantity x contract size               (display only; R does not use it)
```

Conversion to the account currency happens only when it is exact:

| Situation | Result |
|---|---|
| quote currency = account currency (EURUSD on USD) | direct |
| account currency = the pair's base (USDJPY on USD) | divide by the price |
| anything else (EURGBP on USD) | blank: type the P&L, it is kept as typed |
| stocks | no quote currency: already the account currency |

An imported or typed P&L (`pnl_manual`) is never recomputed.

## Asset classes

The class decides the quantity unit and the contract size, nothing else.

| Class | Quantity | One unit is |
|---|---|---|
| forex | lots | 100,000 of the base currency |
| metal | lots | 100 oz (silver 5,000 oz) |
| index | lots / contracts | 1 per index point |
| energy | lots / contracts | 1,000 barrels (natural gas 10,000) |
| future | contracts | the exchange multiplier (ES 50, NQ 20, CL 1,000 ...) |
| crypto | units (coins) | 1 coin |
| stock | units (shares) | 1 share |

Lookup order for a symbol: the catalogue (including aliases such as GOLD, DJ30, USTEC and broker decorations such as `.a`, `m`, `.pro`), then any pair of two known currency codes, then crypto base+quote. Anything else is a stock (in a forex-only journal: a lot contract of unknown size, so R works and money is typed). Futures roots (ES, NQ, CL ...) are recognised only with a contract month (`ESZ6`) or as a continuous contract (`ES1!`), because a bare `ES` or `NG` is also a stock ticker.

Index, energy and future sizes are common broker defaults. If yours differ, type the P&L.

### Supported instruments

**Forex** — 63

EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD, EURGBP, EURJPY, EURCHF, EURAUD, EURCAD, EURNZD, GBPJPY, GBPCHF, GBPAUD, GBPCAD, GBPNZD, AUDJPY, AUDCHF, AUDCAD, AUDNZD, NZDJPY, NZDCHF, NZDCAD, CADJPY, CADCHF, CHFJPY, USDZAR, USDNGN, USDMXN, USDTRY, USDSGD, USDHKD, USDNOK, USDSEK, USDDKK, USDPLN, USDCZK, USDHUF, USDCNH, USDILS, USDTHB, USDINR, USDBRL, EURTRY, EURPLN, EURNOK, EURSEK, EURZAR, EURHUF, EURCZK, EURMXN, GBPNOK, GBPSEK, GBPZAR, GBPTRY, SGDJPY, ZARJPY, NOKJPY, SEKJPY, MXNJPY, TRYJPY

**Metals** — 4

XAUUSD (100), XAGUSD (5,000), XPTUSD (100), XPDUSD (100)

**Indices** — 12

US30, US500, NAS100, US2000, GER40, UK100, JP225, FRA40, AUS200, HK50, ES35, EU50

**Energies** — 3

USOIL (1,000), UKOIL (1,000), NATGAS (10,000)

**Crypto** — 65

BTCUSDT, BTCUSDC, BTCUSD, BTCEUR, BTCGBP, ETHUSDT, ETHUSDC, ETHUSD, ETHEUR, ETHGBP, ETHBTC, SOLUSDT, SOLUSDC, SOLUSD, SOLEUR, SOLGBP, SOLBTC, XRPUSDT, XRPUSDC, XRPUSD, XRPEUR, XRPGBP, XRPBTC, LTCUSDT, LTCUSDC, LTCUSD, LTCEUR, LTCGBP, LTCBTC, BNBUSDT, BNBUSDC, BNBUSD, BNBEUR, BNBGBP, BNBBTC, ADAUSDT, ADAUSDC, ADAUSD, ADAEUR, ADAGBP, ADABTC, DOGEUSDT, DOGEUSDC, DOGEUSD, DOGEEUR, DOGEGBP, DOGEBTC, DOTUSDT, DOTUSDC, DOTUSD, DOTEUR, DOTGBP, DOTBTC, AVAXUSDT, AVAXUSDC, AVAXUSD, AVAXEUR, AVAXGBP, AVAXBTC, LINKUSDT, LINKUSDC, LINKUSD, LINKEUR, LINKGBP, LINKBTC

**Futures** — 20

ES (50), MES (5), NQ (20), MNQ (2), YM (5), MYM (0.5), RTY (50), M2K (5), CL (1,000), MCL (100), GC (100), MGC (10), SI (5,000), NG (10,000), ZB (1,000), ZN (1,000), 6E (125,000), 6B (62,500), 6A, 6J (12,500,000)


## Where the database fits

The `trades_compute_pnl` trigger only: fills gross P&L for spot **stock** trades that have prices but no typed P&L, splits costs (`fees` = -(commission + swap) + other fees), and sets `net_pnl = gross_pnl - fees`. It does no risk or R work.

## Tests

`src/test/calc.test.ts`, `metrics-audit.test.ts`, `rules-open.test.ts`.

## Ratios (Chart Lab, Ratios)

Per-trade, running, in account currency. None is annualised except MAR over a year of history.

| Ratio | Formula |
|---|---|
| Sharpe | mean P&L / sample standard deviation (n - 1) of P&L, risk-free rate 0 |
| Sortino | mean P&L / root mean square of the losses over all trades (target 0) |
| Gain to Pain | net profit / total losses |
| Calmar | net profit / max drawdown (both in money) |
| MAR | annualised compound return % / max drawdown %; under a year it is return % / max drawdown % |
| Sterling | return % / (max drawdown % + 10) |
| Burke | net profit / square root of the sum of squared depths of every drawdown (peak to next peak) |
| K-ratio | slope of ln(equity) against trade number / standard error of that slope (Kestner 1996) |
| Profit factor | gross wins / gross losses |
| SQN | mean R / sample standard deviation of R x sqrt(min(n, 100)) |

Treynor and Information ratio need a market benchmark and are not offered.
