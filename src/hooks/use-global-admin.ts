import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Admin global da plataforma (papel `admin` em user_roles). */
export function useGlobalAdmin() {
  const { data = false, isLoading } = useQuery({
    queryKey: ["is-global-admin"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      if (error) return false;
      return !!data;
    },
  });
  return { isGlobalAdmin: data, isLoading };
}
