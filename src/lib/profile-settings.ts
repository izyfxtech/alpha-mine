import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileSettings {
  showWeeklyTotals: boolean;
  showCalendarWinrate: boolean;
  showBalance: boolean;
  allowSharing: boolean;
  /** First day of the week in calendars: 1 = Monday, 0 = Sunday. */
  weekStartsOn: 0 | 1;
}
export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = { showWeeklyTotals: false, showCalendarWinrate: false, showBalance: true, allowSharing: true, weekStartsOn: 1 };

export function readSettings(raw: unknown): ProfileSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const b = (k: "showWeeklyTotals" | "showCalendarWinrate" | "showBalance" | "allowSharing") => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_PROFILE_SETTINGS[k]);
  return { showWeeklyTotals: b("showWeeklyTotals"), showCalendarWinrate: b("showCalendarWinrate"), showBalance: b("showBalance"), allowSharing: b("allowSharing"), weekStartsOn: o.weekStartsOn === 0 ? 0 : 1 };
}

/** Signed-in user's profile row plus parsed account toggles. */
export function useProfile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      return { id, email: u.user?.email ?? "", display_name: p?.display_name ?? "", base_currency: p?.base_currency ?? "USD", settings: readSettings(p?.settings) };
    },
    staleTime: 60_000,
  });
  const settings = q.data?.settings ?? DEFAULT_PROFILE_SETTINGS;
  async function saveSettings(patch: Partial<ProfileSettings>) {
    if (!q.data) return;
    const next = { ...settings, ...patch };
    const { error } = await supabase.from("profiles").upsert({ id: q.data.id, settings: next as never });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["profile"] });
  }
  return { profile: q.data, settings, saveSettings };
}
