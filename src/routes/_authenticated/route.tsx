import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { pendingInvite } from "@/lib/mentor/scopes";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JournalProvider } from "@/lib/journal/journal-context";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { RouteGate } from "@/components/layout/RouteGate";
import { TopBar } from "@/components/layout/TopBar";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { SpotlightTour } from "@/components/onboarding/SpotlightTour";
import { TradeDrawerProvider } from "@/components/journal/TradeDrawer";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 800px)").matches,
  );
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // An invite link opened while signed out is remembered across sign-in; pick it up here.
  useEffect(() => {
    const token = pendingInvite();
    if (token && !pathname.startsWith("/invite"))
      navigate({ to: "/invite/$token", params: { token } });
  }, [navigate, pathname]);
  useEffect(() => {
    document.documentElement.classList.add("app-scale");
    return () => document.documentElement.classList.remove("app-scale");
  }, []);
  return (
    <JournalProvider>
      <TradeDrawerProvider>
        <div className="flex h-dvh min-h-0 w-full overflow-hidden">
          <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[21px]">
              <div className="w-full min-w-0">
                <RouteGate>
                  <Outlet />
                </RouteGate>
              </div>
            </main>
          </div>
        </div>
        <Onboarding />
        <SpotlightTour />
      </TradeDrawerProvider>
    </JournalProvider>
  );
}
