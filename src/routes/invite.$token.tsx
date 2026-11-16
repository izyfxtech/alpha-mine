import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MkShell } from "@/components/marketing/marketing-shell";
import { AccessForm, type AccessChoice } from "@/components/mentor/AccessForm";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite, previewInvite } from "@/lib/mentor/api";
import { DEFAULT_SCOPES, forgetInvite, rememberInvite } from "@/lib/mentor/scopes";
import { localDay } from "@/lib/time/local-time";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Mentor invitation — AlphaMine" },
      {
        name: "description",
        content: "Accept an invitation to share or review a trading journal on AlphaMine.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <MkShell>
      <InvitePage />
    </MkShell>
  ),
});

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto my-16 w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      {children}
    </div>
  );
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const session = useQuery({
    queryKey: ["invite-session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: 0,
  });
  const signedIn = !!session.data;
  const preview = useQuery({
    queryKey: ["invite-preview", token, signedIn],
    enabled: signedIn,
    retry: false,
    queryFn: () => previewInvite(token),
  });
  const { data: journals = [] } = useQuery({
    queryKey: ["invite-journals"],
    enabled: signedIn && preview.data?.inviter_role === "mentor",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("id,name,currency")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [picked, setPicked] = useState<AccessChoice | null>(null);
  // Until they change anything, every journal is ticked, so the common case (share everything) is one click.
  const choice: AccessChoice = picked ?? {
    journalIds: journals.map((j) => j.id),
    scopes: DEFAULT_SCOPES,
    days: 90,
  };
  const [busy, setBusy] = useState(false);
  const [now] = useState(Date.now);
  // The link only has to survive a sign-in or sign-up, which leave this page. Once the person is here signed in, it is no longer needed.
  useEffect(() => {
    if (session.data) forgetInvite();
  }, [session.data]);

  if (session.isLoading) return <Card>Loading…</Card>;

  if (!signedIn)
    return (
      <Card>
        <h1 className="text-lg font-semibold">You have been invited</h1>
        <p className="text-sm text-muted-foreground">
          Sign in or create a free account to see who invited you and accept. The link stays valid
          while you do.
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              rememberInvite(token);
              navigate({ to: "/auth" });
            }}
          >
            Sign in
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              rememberInvite(token);
              navigate({ to: "/auth", search: { mode: "signup" } });
            }}
          >
            Create account
          </Button>
        </div>
      </Card>
    );

  if (preview.isLoading) return <Card>Checking the invitation…</Card>;
  const p = preview.data;
  if (!p || !p.usable)
    return (
      <Card>
        <h1 className="text-lg font-semibold">This invitation cannot be used</h1>
        <p className="text-sm text-muted-foreground">
          {p?.expires_at && new Date(p.expires_at).getTime() < now
            ? "It has expired."
            : "It was already used, cancelled, or sent by you. Ask for a new link."}
        </p>
        <Button asChild variant="outline">
          <Link to="/home">Go to my journal</Link>
        </Button>
      </Card>
    );

  const fromMentor = p.inviter_role === "mentor"; // I am the student
  async function accept() {
    setBusy(true);
    try {
      await acceptInvite(
        token,
        fromMentor
          ? { journalIds: choice.journalIds, scopes: choice.scopes, accessDays: choice.days }
          : undefined,
      );
      toast.success(
        fromMentor
          ? `${p!.inviter_name} can now review your journal`
          : `You are now a mentor of ${p!.inviter_name}`,
      );
      navigate(
        fromMentor
          ? { to: "/settings/$section", params: { section: "sharing" } }
          : { to: "/mentor" },
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold">
        {fromMentor
          ? `${p.inviter_name} wants to be your mentor`
          : `${p.inviter_name} wants you as their mentor`}
      </h1>
      <p className="text-sm text-muted-foreground">
        {fromMentor
          ? "Choose what they can see. They can read it and leave feedback; they can never change your data. You can stop sharing at any time."
          : `They are sharing ${p.journal_count} journal${p.journal_count === 1 ? "" : "s"} with you. You can read them and leave feedback; you cannot change anything.`}{" "}
        This invitation expires on {localDay(p.expires_at)}.
      </p>
      {fromMentor && <AccessForm journals={journals} value={choice} onChange={setPicked} />}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy || (fromMentor && !choice.journalIds.length)}
          onClick={accept}
        >
          {busy ? "Accepting…" : "Accept"}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/home">Not now</Link>
        </Button>
      </div>
    </Card>
  );
}
