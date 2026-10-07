import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JournalProvider } from "@/lib/journal-context";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { TradeDrawerProvider } from "@/components/TradeDrawer";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <JournalProvider>
      <TradeDrawerProvider>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto p-[21px]"><div className="w-full min-w-0"><Outlet /></div></main>
          </div>
        </div>
      </TradeDrawerProvider>
    </JournalProvider>
  );
}
