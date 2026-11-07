/**
 * Screenshots can be added as a link instead of a file. A link is stored as typed and the browser loads it from the other
 * site, so it cannot be compressed or cached by us and it breaks when the other site removes it.
 */

/** A TradingView share page (tradingview.com/x/<id>/) is HTML; the picture itself is at s3.tradingview.com/snapshots/<first letter>/<id>.png. */
export function normalizeImageUrl(raw: string): string {
  const v = raw.trim();
  const m = /^https:\/\/(?:www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(v);
  return m ? `https://s3.tradingview.com/snapshots/${m[1]![0]!.toLowerCase()}/${m[1]}.png` : v;
}

/** Does this url load as an image? Resolves false on an error or after `ms`. Sends no referrer, so the other site learns nothing about this app. */
export function imageLoads(url: string, ms = 8000): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), ms);
    img.referrerPolicy = "no-referrer";
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = url;
  });
}
