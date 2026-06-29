import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Gate: pending users only see /pending
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user.id)
      .maybeSingle();
    const status = profile?.status ?? "pending";
    if (status !== "approved" && !location.pathname.startsWith("/pending")) {
      throw redirect({ to: "/pending" });
    }
    if (status === "approved" && location.pathname.startsWith("/pending")) {
      throw redirect({ to: "/dashboard" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-3 border-b border-border px-3 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <div className="text-xs text-muted-foreground">Acrux ROBOCEP · Gestão da Equipe</div>
          </header>
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
