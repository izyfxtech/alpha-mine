import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromTable } from "@/lib/journal/untyped-table";
import type { Tables } from "@/integrations/supabase/types";
import { isLive } from "./scopes";
import type { TargetType } from "./api";

export type Grant = Pick<
  Tables<"journal_access">,
  "mentorship_id" | "journal_id" | "scopes" | "expires_at" | "revoked_at"
>;
export type MentorshipView = Tables<"mentorships"> & {
  /** Which side the signed-in person is on. */
  role: "mentor" | "student";
  otherId: string;
  otherName: string;
  grants: Grant[];
};

/** Both sides of every mentorship the signed-in person is in, with grants and the other person's name. */
export function useMentorships() {
  const q = useQuery({
    queryKey: ["mentorships"],
    staleTime: 60_000,
    queryFn: async (): Promise<MentorshipView[]> => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return [];
      const [m, a, c] = await Promise.all([
        supabase.from("mentorships").select("*").order("created_at"),
        supabase
          .from("journal_access")
          .select("mentorship_id,journal_id,scopes,expires_at,revoked_at"),
        fromTable("profile_cards").select("id,display_name"),
      ]);
      if (m.error) throw m.error;
      if (a.error) throw a.error;
      const names = new Map(
        ((c.data ?? []) as { id: string; display_name: string }[]).map((p) => [
          p.id,
          p.display_name,
        ]),
      );
      return (m.data ?? []).map((x) => {
        const role = x.student_id === uid ? "student" : "mentor";
        const otherId = role === "student" ? x.mentor_id : x.student_id;
        return {
          ...x,
          role,
          otherId,
          otherName: names.get(otherId)?.trim() || (role === "student" ? "Mentor" : "Student"),
          grants: (a.data ?? []).filter((g) => g.mentorship_id === x.id),
        };
      });
    },
  });
  const all = useMemo(() => q.data ?? [], [q.data]);
  return { ...q, all };
}

/** The mentors the signed-in person has shared journals with, ended ones left out. */
export function useMyMentors() {
  const { all, ...rest } = useMentorships();
  return {
    ...rest,
    mentors: useMemo(() => all.filter((m) => m.role === "student" && m.status === "active"), [all]),
  };
}

/** True when someone has shared at least one journal with the signed-in person: the Mentor page is only offered then. */
export function useIsMentor(): boolean {
  const { all } = useMentorships();
  return all.some(
    (m) => m.role === "mentor" && m.status === "active" && m.grants.some((g) => isLive(g)),
  );
}

export type StudentRow = {
  mentorship_id: string;
  student_id: string;
  student_name: string;
  journal_id: string;
  journal_name: string;
  currency: string;
  scopes: string[];
  expires_at: string | null;
  trades: number;
  wins: number | null;
  net_pnl: number | null;
  last_trade_at: string | null;
  open_threads: number;
};

/** The mentor's student list, from live counts in the database. */
export function useMyStudents() {
  return useQuery({
    queryKey: ["my_students"],
    staleTime: 60_000,
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await supabase.rpc("my_students");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        trades: Number(r.trades),
        wins: r.wins == null ? null : Number(r.wins),
        net_pnl: r.net_pnl == null ? null : Number(r.net_pnl),
        open_threads: Number(r.open_threads),
      }));
    },
  });
}

export type Invite = Pick<
  Tables<"mentorship_invites">,
  | "id"
  | "inviter_role"
  | "journal_ids"
  | "scopes"
  | "access_days"
  | "expires_at"
  | "accepted_at"
  | "revoked_at"
  | "created_at"
>;

/** Invites the signed-in person sent that nobody has used yet. */
export function useOpenInvites() {
  return useQuery({
    queryKey: ["mentor_invites"],
    staleTime: 30_000,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("mentorship_invites")
        .select(
          "id,inviter_role,journal_ids,scopes,access_days,expires_at,accepted_at,revoked_at,created_at",
        )
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type FeedbackRow = Tables<"trade_feedback">;

/** The feedback on one thing (a trade, a diary session or the journal), oldest first. The database decides who may read it. */
export function useFeedback(
  journalId: string | undefined,
  targetType: TargetType,
  targetId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["feedback", journalId, targetType, targetId ?? null],
    enabled: !!journalId && (targetType === "journal" || !!targetId),
    staleTime: 15_000,
    queryFn: async (): Promise<FeedbackRow[]> => {
      let q = supabase
        .from("trade_feedback")
        .select("*")
        .eq("journal_id", journalId!)
        .eq("target_type", targetType);
      q = targetId ? q.eq("target_id", targetId) : q.is("target_id", null);
      const { data, error } = await q.order("created_at").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Per trade: how many threads are open and how many there are, for badges on lists. */
export function useFeedbackSummary(journalId: string | undefined) {
  return useQuery({
    queryKey: ["feedback", "summary", journalId],
    enabled: !!journalId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_feedback")
        .select("target_id,resolved_at")
        .eq("journal_id", journalId!)
        .eq("target_type", "trade")
        .is("parent_id", null);
      if (error) throw error;
      const out = new Map<string, { open: number; total: number }>();
      for (const r of data ?? []) {
        if (!r.target_id) continue;
        const c = out.get(r.target_id) ?? { open: 0, total: 0 };
        c.total++;
        if (!r.resolved_at) c.open++;
        out.set(r.target_id, c);
      }
      return out;
    },
  });
}

/** `meta` is always an object (the database defaults it to `{}`), so pages can read keys without checking it first. */
export type NotificationRow = Omit<Tables<"notifications">, "meta"> & {
  meta: Record<string, unknown>;
};

/** The signed-in person's latest notifications. Polled every minute while the tab is visible. */
export function useNotifications() {
  const q = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((n) => ({
        ...n,
        meta:
          n.meta && typeof n.meta === "object" && !Array.isArray(n.meta)
            ? (n.meta as Record<string, unknown>)
            : {},
      }));
    },
  });
  const rows = useMemo(() => q.data ?? [], [q.data]);
  return { ...q, rows, unread: rows.filter((n) => !n.read_at).length };
}
