import { useActiveOrg } from "@/contexts/active-org";

/** Admin dentro da equipe ativa. */
export function useIsAdmin() {
  const { isAdmin } = useActiveOrg();
  return isAdmin;
}
