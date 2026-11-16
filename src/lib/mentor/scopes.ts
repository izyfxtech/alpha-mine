/** What a student can share with a mentor, as the student reads it. `money` is always included in Phase 1 (see the migration header). */
export const SCOPES = [
  { key: "trades", label: "Trades", hint: "Trades, comments, custom statistics and rule checks." },
  { key: "screenshots", label: "Screenshots", hint: "Chart images attached to trades." },
  { key: "plans", label: "Trading plans and rules", hint: "Plans and the rules you trade by." },
  { key: "money", label: "Amounts", hint: "Profit and loss, balance, deposits and withdrawals." },
] as const;

export type ScopeKey = (typeof SCOPES)[number]["key"] | "notes";

/** Phase 1 always shares amounts, so the picker shows it checked and locked. */
export const LOCKED_SCOPES: ScopeKey[] = ["trades", "money"];
export const DEFAULT_SCOPES: ScopeKey[] = ["trades", "screenshots", "plans", "money"];

export const ACCESS_CHOICES: { days: number | null; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: null, label: "Until I stop it" },
];

export const scopeLabel = (key: string) =>
  SCOPES.find((s) => s.key === key)?.label ?? (key === "notes" ? "Diary and notes" : key);

/** True while a grant is in force: not revoked and not past its end date. */
export function isLive(
  g: { revoked_at: string | null; expires_at: string | null },
  now = Date.now(),
) {
  return !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > now);
}

/** `/invite/<token>` on this site: what a student or mentor sends. */
export const inviteUrl = (token: string, origin = window.location.origin) =>
  `${origin}/invite/${token}`;

const PENDING_KEY = "am.pendingInvite";
/** Keeps an invite across sign-up or sign-in, which leave the page. */
export function rememberInvite(token: string) {
  try {
    localStorage.setItem(PENDING_KEY, token);
  } catch {
    /* private mode: the person can open the link again after signing in */
  }
}
export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}
