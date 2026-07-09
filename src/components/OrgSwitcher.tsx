import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react";
import { useActiveOrg } from "@/contexts/active-org";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function OrgSwitcher() {
  const { orgs, activeOrg, activeOrgId, setActiveOrgId, isAdmin } = useActiveOrg();
  if (!activeOrg) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <div className="size-8 rounded-md bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center overflow-hidden shrink-0">
            {activeOrg.logo_url
              ? <img src={activeOrg.logo_url} alt="" className="size-full object-cover" />
              : <span className="text-[11px] font-bold text-white">{activeOrg.name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="flex-1 text-left group-data-[collapsible=icon]:hidden min-w-0">
            <div className="text-sm font-semibold truncate">{activeOrg.name}</div>
            <div className="text-[10px] text-muted-foreground capitalize">{activeOrg.role}</div>
          </div>
          <ChevronsUpDown className="size-4 opacity-60 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">Suas equipes</div>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => setActiveOrgId(o.id)} className="gap-2">
            <div className="size-5 rounded bg-muted flex items-center justify-center text-[9px] font-bold">
              {o.logo_url
                ? <img src={o.logo_url} alt="" className="size-full object-cover rounded" />
                : o.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === activeOrgId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/org/settings"><Settings className="size-4" /> Configurações da equipe</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/org/new"><Plus className="size-4" /> Criar nova equipe</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
