import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ActiveOrgProvider, useActiveOrg } from "@/contexts/active-org";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <ActiveOrgProvider>
      <Shell />
    </ActiveOrgProvider>
  );
}

function Shell() {
  const { orgs, isLoading, activeOrg } = useActiveOrg();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOpenRoute = pathname.startsWith("/onboarding") || pathname.startsWith("/org/new");

  // Enquanto carrega ou está sem equipe, renderiza sem sidebar
  if (isLoading || orgs.length === 0 || isOpenRoute) {
    return <div className="min-h-screen w-full bg-background"><Outlet /></div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-3 border-b border-border px-3 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <div className="text-xs text-muted-foreground truncate">
              {activeOrg?.brand_name || activeOrg?.name} · Gestão da Equipe
            </div>
          </header>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
