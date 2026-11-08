export const currencyName = (c: string) => {
  try {
    return `${new Intl.DisplayNames(["en"], { type: "currency" }).of(c) ?? c} (${c})`;
  } catch {
    return c;
  }
};
export const MARKETS = ["Stocks", "Forex", "Futures", "Crypto", "Indices", "Commodities"];
export const TRADE_TYPES = ["Spot", "Futures", "Options", "CFD"];
export const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export const selFixed = "h-9 shrink-0 rounded-md border bg-background px-2 text-sm";
export const card = "rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]";
