import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_name: string | null;
  role: "owner" | "admin" | "member";
  member_count: number;
  member_limit: number;
};

type Ctx = {
  orgs: Organization[];
  activeOrg: Organization | null;
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
  isLoading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  refetch: () => void;
};

const ActiveOrgContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "active_org_id";
const OPEN_ROUTES = ["/onboarding", "/org/new"];

export function ActiveOrgProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeId, setActive] = useState<string | null>(null);

  const { data: orgs = [], isLoading, refetch } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_organizations");
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (orgs.length === 0) { setActive(null); return; }
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && orgs.find((o) => o.id === stored) ? stored : orgs[0].id;
    setActive(valid);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, valid);
  }, [orgs, isLoading]);

  const setActiveOrgId = (id: string) => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    setActive(id);
  };

  const noOrgs = !isLoading && orgs.length === 0;
  const onOpenRoute = OPEN_ROUTES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (noOrgs && !onOpenRoute) {
      navigate({ to: "/onboarding" });
    }
  }, [noOrgs, onOpenRoute, navigate]);

  const activeOrg = orgs.find((o) => o.id === activeId) ?? null;
  return (
    <ActiveOrgContext.Provider
      value={{
        orgs,
        activeOrg,
        activeOrgId: activeId,
        setActiveOrgId,
        isLoading,
        isAdmin: activeOrg?.role === "admin" || activeOrg?.role === "owner",
        isOwner: activeOrg?.role === "owner",
        refetch,
      }}
    >
      {children}
    </ActiveOrgContext.Provider>
  );
}

export function useActiveOrg() {
  const ctx = useContext(ActiveOrgContext);
  if (!ctx) throw new Error("useActiveOrg deve estar dentro de <ActiveOrgProvider>");
  return ctx;
}
