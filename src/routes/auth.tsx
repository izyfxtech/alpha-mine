import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

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
    <div className="grid min-h-screen bg-background lg:grid-cols-[.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-ink-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -right-32 top-24 size-96 rounded-full border border-profit/20" /><div className="absolute -right-16 top-40 size-64 rounded-full border border-profit/15" />
        <div className="relative"><Logo /><div className="mt-32 max-w-md"><div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-profit/15 text-profit"><Sparkles className="size-5" /></div><h1 className="text-5xl font-bold leading-[1.02] tracking-[-.05em]">Your best trades are waiting to be <span className="text-profit">understood.</span></h1><p className="mt-6 leading-7 text-ink-foreground/65">Build the habit of looking back. AlphaMine turns your trading history into a clearer path forward.</p></div></div>
        <div className="relative flex items-center gap-3 text-xs text-ink-foreground/55"><ShieldCheck className="size-4 text-profit" /> Your data stays private and secure</div>
      </aside>
      <main className="flex items-center justify-center px-6 py-10 sm:px-12"><form onSubmit={submit} className="w-full max-w-md">
        <div className="mb-12 flex items-center justify-between"><div className="lg:hidden"><Logo /></div><Link to="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" /> Back home</Link></div>
        <div className="mb-8"><div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-profit-soft text-profit"><LockKeyhole className="size-5" /></div><h2 className="text-3xl font-bold tracking-tight">{mode === "in" ? "Welcome back" : mode === "up" ? "Start your journal" : "Reset your password"}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === "in" ? "Pick up where you left off." : mode === "up" ? "A clearer view of your trading starts here." : "We will send a secure link to your inbox."}</p></div>
        <div className="flex flex-col gap-5">
          {mode === "up" && <div className="flex flex-col gap-2"><Label htmlFor="name">Name</Label><Input id="name" placeholder="Alex Morgan" value={name} onChange={(e) => setName(e.target.value)} /></div>}
          <div className="flex flex-col gap-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "forgot" && <div className="flex flex-col gap-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label>{mode === "in" && <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-profit hover:underline">Forgot password?</button>}</div><Input id="password" type="password" placeholder="••••••••" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          <Button size="lg" className="mt-1 w-full rounded-xl" disabled={busy}>{mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}<ArrowRight data-icon="inline-end" /></Button>
          {mode !== "forgot" && <><div className="relative my-1 text-center text-xs text-muted-foreground before:absolute before:left-0 before:top-1/2 before:h-px before:w-[42%] before:bg-border after:absolute after:right-0 after:top-1/2 after:h-px after:w-[42%] after:bg-border"><span className="relative bg-background px-3">or continue with</span></div><Button type="button" variant="outline" size="lg" className="w-full rounded-xl" onClick={google}>Continue with Google</Button></>}
          <p className="pt-3 text-center text-sm text-muted-foreground">{mode === "forgot" ? <button type="button" onClick={() => setMode("in")} className="font-medium text-foreground hover:underline">Back to sign in</button> : <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-medium text-profit hover:underline">{mode === "in" ? "Create an account" : "Already have an account? Sign in"}</button>}</p>
        </div>
      </form></main>
    </div>
  );
}
