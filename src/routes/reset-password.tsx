import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MkShell } from "@/components/marketing-shell";
import { AuthFrame, Field } from "@/components/auth-bits";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password for AlphaMine" }, { name: "description", content: "Choose a new password for your AlphaMine account." }, { name: "robots", content: "noindex" }] }),
  component: () => <MkShell><Reset /></MkShell>,
});

function Reset() {
  const navigate = useNavigate();
  const [pw, setPw] = useState(""); const [again, setAgain] = useState("");
  const [err, setErr] = useState<{ pw?: string; again?: string; form?: string }>({}); const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n: typeof err = {};
    if (pw.length < 6) n.pw = "Use at least 6 characters.";
    if (again !== pw) n.again = "The two passwords do not match.";
    setErr(n);
    if (n.pw || n.again) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr({ form: `${error.message}. Open the reset link from your email again.` });
    navigate({ to: "/home" });
  }

  return (
    <AuthFrame>
      <h1 className="text-3xl font-semibold">Set a new password</h1>
      <p className="mt-2 text-base text-[var(--mk-mute)]">Choose something you have not used before.</p>
      <form onSubmit={save} noValidate className="mt-8 space-y-4">
        <Field label="New password" type="password" autoComplete="new-password" value={pw} error={err.pw} onChange={(e) => setPw(e.target.value)} />
        <Field label="Confirm password" type="password" autoComplete="new-password" value={again} error={err.again} onChange={(e) => setAgain(e.target.value)} />
        {err.form && <p role="alert" className="rounded-lg border border-red-500 p-3 text-sm text-red-500">{err.form}</p>}
        <button className="mk-btn mk-btn-pri w-full disabled:opacity-60" disabled={busy}>{busy ? "Updating password" : "Update password"}</button>
      </form>
    </AuthFrame>
  );
}
