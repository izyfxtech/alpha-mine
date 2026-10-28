/** Minimal fetch surface so providers can be unit-tested with a stub and no network. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<HttpResponse>;

/** Hard ceiling for any single provider request. A hung socket must not stall an import. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export const defaultFetch: FetchLike = (url, init) =>
  fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True for responses worth retrying: rate-limit and transient server errors. */
export const isRetryable = (status: number) => status === 429 || (status >= 500 && status <= 599);
