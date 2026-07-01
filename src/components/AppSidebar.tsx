import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, LayoutDashboard, Users, Wrench, Code, Megaphone, LogOut, CalendarDays, FolderKanban, ShieldCheck, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, any> = { social: Users, engenharia: Wrench, programacao: Code, marketing: Megaphone };

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: adminInfo } = useQuery({
    queryKey: ["sidebar-admin-info"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      let isAdmin = false;
      if (uid) {
        const { data } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
        isAdmin = Boolean(data);
      }
      const { count } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      return { isAdmin, anyAdmin: (count ?? 0) > 0 };
    },
  });
  const isAdmin = adminInfo?.isAdmin ?? false;
  const showSetup = isAdmin || !(adminInfo?.anyAdmin ?? true);

  const parents = areas.filter((a) => !a.parent_id);


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="size-8 rounded-md bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
            <Cpu className="size-4 text-white" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold leading-tight">Acrux ROBOCEP</div>
            <div className="text-[10px] text-muted-foreground">Gestão interna</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Geral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"}>
                  <Link to="/dashboard"><LayoutDashboard /> <span>Início</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/ponto"}>
                  <Link to="/ponto"><Clock /> <span>Ponto</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/invites"}>
                    <Link to="/invites"><Mail /> <span>Convites</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {showSetup && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/setup"}>
                    <Link to="/setup"><ShieldCheck /> <span>Setup admin</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Áreas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {parents.map((area) => {
                const Icon = ICONS[area.slug] ?? FolderKanban;
                const children = areas.filter((a) => a.parent_id === area.id);
                const isActive = pathname.includes(`/area/${area.slug}`);
                return (
                  <SidebarMenuItem key={area.id}>
                    <SidebarMenuButton asChild isActive={pathname === `/area/${area.slug}`}>
                      <Link to="/area/$slug" params={{ slug: area.slug }}>
                        <Icon /> <span>{area.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {children.length > 0 && isActive && (
                      <SidebarMenuSub>
                        {children.map((c) => (
                          <SidebarMenuSubItem key={c.id}>
                            <SidebarMenuSubButton asChild isActive={pathname === `/area/${c.slug}`}>
                              <Link to="/area/$slug" params={{ slug: c.slug }}>{c.name}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        {area.slug === "social" && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === "/social/content"}>
                              <Link to="/social/content"><CalendarDays className="size-3" /> Planejamento</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="size-4" /> <span className="group-data-[collapsible=icon]:hidden">Sair</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
