import { format } from "date-fns";

/**
 * Where the app reads the current time for display (today's highlight, the default year). Keeping these in one place means a
 * test can fake the clock once, and components stay free of direct clock reads.
 */
export const now = () => new Date();
export const currentYear = () => now().getFullYear();
/** Today as `yyyy-MM-dd` in the device's time zone. */
export const todayKey = () => format(now(), "yyyy-MM-dd");
