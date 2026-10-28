/**
 * Time handling. Rate lookups are only as good as the timestamp you feed them,
 * and MetaTrader reports SERVER time, not UTC. A 2-3 hour error here means
 * you convert a Friday-evening close at a Monday rate.
 */

/** How the broker's server clock relates to UTC. */
export type ServerTz =
  | { kind: 'fixed'; offsetMinutes: number }
  /** The dominant FX convention: GMT+2 in winter, GMT+3 during US DST ("New York close" servers). */
  | { kind: 'ny-close' }
  /** Server follows an IANA zone's own DST rules, e.g. "Europe/Athens" (EET/EEST, EU DST). */
  | { kind: 'iana'; zone: string };

const dtfCache = new Map<string, Intl.DateTimeFormat>();

/** Offset of `zone` from UTC (ms, positive east) at the given UTC instant. */
export function zoneOffsetMs(zone: string, utcMs: number): number {
  let f = dtfCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(zone, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour']!, p['minute']!, p['second']!);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in an IANA zone (expressed as if it were UTC ms) -> true UTC ms. */
export function zoneWallToUtcMs(zone: string, wallMs: number): number {
  let utc = wallMs - zoneOffsetMs(zone, wallMs);
  utc = wallMs - zoneOffsetMs(zone, utc); // second pass settles DST boundaries
  return utc;
}

/** n-th Sunday (1-based) of a month, as 00:00 UTC ms. monthIdx is 0-based. */
function nthSundayMs(year: number, monthIdx: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return Date.UTC(year, monthIdx, firstSunday + 7 * (n - 1));
}

/**
 * Convert a MetaTrader server timestamp to UTC epoch ms.
 *
 * `serverWallMs` is the number MT gives you: wall-clock server time encoded
 * as if it were UTC (MT5 history times, MT4 OrderOpenTime() etc.).
 *
 * 'ny-close' note: US DST starts the 2nd Sunday of March and ends the 1st
 * Sunday of November. FX is closed across the real switch instant, and the
 * Sunday-evening reopen is already on the new regime, so treating the whole
 * switch Sunday as the new regime is exact for every tradable moment.
 */
export function serverWallToUtcMs(serverWallMs: number, tz: ServerTz): number {
  switch (tz.kind) {
    case 'fixed':
      return serverWallMs - tz.offsetMinutes * 60_000;
    case 'iana':
      return zoneWallToUtcMs(tz.zone, serverWallMs);
    case 'ny-close': {
      const y = new Date(serverWallMs).getUTCFullYear();
      const dstStart = nthSundayMs(y, 2, 2);
      const dstEnd = nthSundayMs(y, 10, 1);
      const dst = serverWallMs >= dstStart && serverWallMs < dstEnd;
      return serverWallMs - (dst ? 180 : 120) * 60_000;
    }
  }
}

/** ECB reference rates are published ~16:00 Central European Time on TARGET business days. */
export function ecbFixingUtcMs(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  return zoneWallToUtcMs('Europe/Berlin', Date.UTC(y, m - 1, d, 16, 0, 0));
}

export function isoDateUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  return isoDateUtc(Date.UTC(y, m - 1, d + days));
}

export function isWeekendIso(dateIso: string): boolean {
  const [y, m, d] = dateIso.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}
