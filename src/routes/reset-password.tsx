import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — AlphaMine" },
      { name: "description", content: "Choose a new password for your AlphaMine account." },
      { property: "og:title", content: "Set a new password — AlphaMine" },
      { property: "og:description", content: "Choose a new password for your AlphaMine account." },
       { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/home" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={save} className="w-full max-w-sm space-y-4">
        <Logo />
        <h2 className="text-2xl font-bold">Set a new password</h2>
        <Input type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <Button className="w-full">Update password</Button>
      </form>
    </div>
  );
}
