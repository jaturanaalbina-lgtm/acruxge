import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const { data } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data: ok } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      return Boolean(ok);
    },
    staleTime: 60_000,
  });
  return Boolean(data);
}
