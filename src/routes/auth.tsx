import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AlphaMine" },
      { name: "description", content: "Sign in or create your AlphaMine trading journal account." },
      { property: "og:title", content: "Sign in — AlphaMine" },
      { property: "og:description", content: "Sign in or create your AlphaMine trading journal account." },
       { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && navigate({ to: "/home", replace: true }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => s && navigate({ to: "/home", replace: true }));
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/home", data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        toast.success("Password reset link sent.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) toast.error(error.message ?? "Google sign-in failed");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-12 text-ink-foreground lg:flex">
        <Logo />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Mine your trades<br />for the edge you already have.</h1>
          <p className="mt-4 max-w-md text-ink-foreground/70">Journal every trade, measure your discipline with the tilt meter, and let the numbers show you what actually works.</p>
        </div>
        <p className="text-sm text-ink-foreground/50">© AlphaMine</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">{mode === "in" ? "Welcome back" : mode === "up" ? "Create your account" : "Reset password"}</h2>
          {mode === "up" && (
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          )}
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "forgot" && (
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          )}
          <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : mode === "up" ? "Sign up" : "Send reset link"}</Button>
          {mode !== "forgot" && (
            <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
          )}
          <div className="flex justify-between text-sm text-muted-foreground">
            <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="hover:text-foreground">
              {mode === "in" ? "Create an account" : "Have an account? Sign in"}
            </button>
            {mode === "in" && <button type="button" onClick={() => setMode("forgot")} className="hover:text-foreground">Forgot password?</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
