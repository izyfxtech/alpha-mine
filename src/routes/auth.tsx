import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Eye, EyeSlash, GoogleLogo, EnvelopeSimple } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { MkShell } from "@/components/marketing/marketing-shell";
import { AuthFrame, EMAIL_RE, Field } from "@/components/auth-bits";

/** Cloudflare Turnstile's public site key. Unset, the check is not shown (and Supabase must not require one). */
const TURNSTILE_SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signup" } =>
    s.mode === "signup" ? { mode: "signup" } : {},
  head: () => ({
    meta: [
      { title: "Sign in to EdgeWhiz" },
      { name: "description", content: "Sign in or create your EdgeWhiz trading journal account." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sign in to EdgeWhiz" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <MkShell>
      <AuthPage />
    </MkShell>
  ),
});

type Mode = "in" | "up" | "forgot";
const COPY: Record<Mode, { h: string; sub: string; cta: string; busy: string }> = {
  in: {
    h: "Welcome back",
    sub: "Sign in to open your journal.",
    cta: "Sign in",
    busy: "Signing in",
  },
  up: {
    h: "Create your account",
    sub: "Start a journal in under a minute.",
    cta: "Create account",
    busy: "Creating account",
  },
  forgot: {
    h: "Reset your password",
    sub: "We will email you a link to choose a new one.",
    cta: "Send reset link",
    busy: "Sending link",
  },
};

function AuthPage() {
  const navigate = useNavigate();
  const { mode: initial } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initial === "signup" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstile = useRef<TurnstileInstance>(null);
  const [errs, setErrs] = useState<{ email?: string; password?: string; form?: string }>({});
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => data.session && navigate({ to: "/home", replace: true }));
    const { data } = supabase.auth.onAuthStateChange(
      (_e, s) => s && navigate({ to: "/home", replace: true }),
    );
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const switchTo = (m: Mode) => {
    setMode(m);
    setErrs({});
    setSent(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errs = {};
    if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address, like name@example.com.";
    if (mode !== "forgot" && password.length < 8) next.password = "Use at least 8 characters.";
    if (TURNSTILE_SITE_KEY && !captchaToken)
      next.form = "Complete the check below, then try again.";
    setErrs(next);
    if (next.email || next.password || next.form) return;
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) throw error;
      } else if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/home",
            data: { full_name: name },
            captchaToken,
          },
        });
        if (error) throw error;
        setSent("confirm");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
          captchaToken,
        });
        if (error) throw error;
        setSent("reset");
      }
    } catch (err) {
      setErrs({ form: `${(err as Error).message}. Check your details and try again.` });
    } finally {
      // A Turnstile token works once, so the next attempt needs a fresh one.
      turnstile.current?.reset();
      setCaptchaToken(undefined);
      setBusy(false);
    }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) setErrs({ form: "Google sign in failed. Try again or use your email." });
  }

  if (sent) {
    return (
      <AuthFrame>
        <div className="mk-card p-6 text-center hover:!translate-y-0">
          <EnvelopeSimple size={32} className="mx-auto text-[var(--mk-acc)]" />
          <h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
          <p className="mt-2 text-base text-[var(--mk-mute)]">
            {sent === "confirm"
              ? "We sent a confirmation link to "
              : "We sent a password reset link to "}
            <span className="font-semibold text-[var(--mk-fg)]">{email}</span>.
          </p>
          <button
            type="button"
            onClick={() => switchTo("in")}
            className="mk-btn mk-btn-sec mt-6 w-full"
          >
            Back to sign in
          </button>
        </div>
      </AuthFrame>
    );
  }

  const c = COPY[mode];
  return (
    <AuthFrame>
      <h1 className="text-3xl font-semibold">{c.h}</h1>
      <p className="mt-2 text-base text-[var(--mk-mute)]">{c.sub}</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        {mode === "up" && (
          <Field
            label="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={errs.email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
        {mode !== "forgot" && (
          <Field
            label="Password"
            type={show ? "text" : "password"}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            error={errs.password}
            onChange={(e) => setPassword(e.target.value)}
            right={
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg text-sm text-[var(--mk-mute)] transition-colors duration-300 hover:text-[var(--mk-fg)]"
                aria-pressed={show}
              >
                {show ? <EyeSlash size={16} /> : <Eye size={16} />}
                {show ? "Hide" : "Show"}
              </button>
            }
          />
        )}
        {errs.form && (
          <p role="alert" className="rounded-lg border border-red-500 p-3 text-sm text-red-500">
            {errs.form}
          </p>
        )}
        {TURNSTILE_SITE_KEY && (
          <Turnstile
            key={mode}
            ref={turnstile}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={setCaptchaToken}
            onExpire={() => setCaptchaToken(undefined)}
            options={{ theme: "auto" }}
          />
        )}
        <button className="mk-btn mk-btn-pri w-full disabled:opacity-60" disabled={busy}>
          {busy ? c.busy : c.cta}
        </button>
        {mode !== "forgot" && (
          <button type="button" onClick={google} className="mk-btn mk-btn-sec w-full">
            <GoogleLogo size={18} weight="bold" />
            Continue with Google
          </button>
        )}
      </form>
      {mode !== "forgot" && (
        <p className="mt-6 text-sm text-[var(--mk-mute)]">
          By continuing you agree to the{" "}
          <Link to="/terms" className="font-semibold underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-semibold underline">
            Privacy policy
          </Link>
          .
        </p>
      )}
      <div className="mt-6 flex justify-between text-sm text-[var(--mk-mute)]">
        <button
          type="button"
          onClick={() => switchTo(mode === "in" ? "up" : "in")}
          className="rounded-lg transition-colors duration-300 hover:text-[var(--mk-fg)]"
        >
          {mode === "in" ? "Create an account" : "Have an account? Sign in"}
        </button>
        {mode === "in" && (
          <button
            type="button"
            onClick={() => switchTo("forgot")}
            className="rounded-lg transition-colors duration-300 hover:text-[var(--mk-fg)]"
          >
            Forgot password?
          </button>
        )}
      </div>
    </AuthFrame>
  );
}
