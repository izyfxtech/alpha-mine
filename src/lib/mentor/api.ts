import { supabase } from "@/integrations/supabase/client";

/** Every write the mentor features make. The database functions do the checks; these only call them and turn failures into messages. */
function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export async function createInvite(input: {
  role: "mentor" | "student";
  journalIds?: string[];
  scopes: string[];
  accessDays: number | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_mentor_invite", {
    _role: input.role,
    _journal_ids: input.journalIds ?? [],
    _scopes: input.scopes,
    _access_days: input.accessDays,
  });
  fail(error);
  return data;
}

export async function previewInvite(token: string) {
  const { data, error } = await supabase.rpc("preview_mentor_invite", { _token: token });
  fail(error);
  return data[0] ?? null;
}

export async function acceptInvite(
  token: string,
  choice?: { journalIds: string[]; scopes: string[]; accessDays: number | null },
): Promise<string> {
  const { data, error } = await supabase.rpc("accept_mentor_invite", {
    _token: token,
    ...(choice
      ? { _journal_ids: choice.journalIds, _scopes: choice.scopes, _access_days: choice.accessDays }
      : {}),
  });
  fail(error);
  return data;
}

export async function revokeInvite(id: string) {
  const { error } = await supabase.rpc("revoke_mentor_invite", { _id: id });
  fail(error);
}

export async function saveAccess(input: {
  mentorshipId: string;
  journalIds: string[];
  scopes: string[];
  accessDays: number | null;
}) {
  const { error } = await supabase.rpc("save_mentor_access", {
    _mentorship: input.mentorshipId,
    _journal_ids: input.journalIds,
    _scopes: input.scopes,
    _access_days: input.accessDays,
  });
  fail(error);
}

export async function endMentorship(id: string) {
  const { error } = await supabase.rpc("end_mentorship", { _id: id });
  fail(error);
}

export async function pauseAllMentors(): Promise<number> {
  const { data, error } = await supabase.rpc("pause_all_mentors");
  fail(error);
  return data;
}

export type TargetType = "trade" | "diary_session" | "journal";

export async function postFeedback(input: {
  journalId: string;
  targetType: TargetType;
  targetId: string | null;
  body: string;
  parentId?: string | null;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { error } = await supabase.from("trade_feedback").insert({
    journal_id: input.journalId,
    target_type: input.targetType,
    target_id: input.targetId,
    parent_id: input.parentId ?? null,
    author_id: u.user.id,
    body: input.body.trim(),
  });
  fail(error);
}

export async function editFeedback(id: string, body: string) {
  const { error } = await supabase.rpc("edit_feedback", { _id: id, _body: body.trim() });
  fail(error);
}

export async function deleteFeedback(id: string) {
  const { error } = await supabase.rpc("delete_feedback", { _id: id });
  fail(error);
}

export async function resolveFeedback(id: string, resolved: boolean) {
  const { error } = await supabase.rpc("resolve_feedback", { _id: id, _resolved: resolved });
  fail(error);
}

export async function markNotificationsRead(ids?: string[]) {
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (ids) q = q.in("id", ids);
  const { error } = await q;
  fail(error);
}
