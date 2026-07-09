import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, Wrench, Code, Megaphone, LogOut, CalendarDays, FolderKanban, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrg } from "@/contexts/active-org";
import { OrgSwitcher } from "@/components/OrgSwitcher";

const ICONS: Record<string, any> = { social: Users, engenharia: Wrench, programacao: Code, marketing: Megaphone };

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeOrgId, isAdmin } = useActiveOrg();

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*")
        .eq("organization_id", activeOrgId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const parents = areas.filter((a) => !a.parent_id);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <OrgSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
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
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/members"}>
                      <Link to="/members"><Users /> <span>Membros</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/invites"}>
                      <Link to="/invites"><Mail /> <span>Convites</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Áreas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {parents.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                  Nenhuma área ainda.
                </div>
              )}
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
