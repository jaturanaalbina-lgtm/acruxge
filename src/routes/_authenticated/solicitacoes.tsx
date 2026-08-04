import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UserCheck, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/solicitacoes")({
  ssr: false,
  component: SolicitacoesPage,
  head: () => ({
    meta: [
      { title: "Solicitações de entrada | GE by Acrux ROBOCEP" },
      { name: "description", content: "Aprove ou recuse pedidos de entrada de novos membros na sua equipe." },
      { property: "og:title", content: "Solicitações de entrada | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Painel de aprovação de novos membros por equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export type PendingMember = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  requested_at: string;
};

export function usePendingMembers() {
  const { activeOrgId, isAdmin } = useActiveOrg();
  return useQuery({
    queryKey: ["pending-members", activeOrgId],
    enabled: !!activeOrgId && isAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_pending_members", { _org: activeOrgId! });
      if (error) throw error;
      return (data ?? []) as PendingMember[];
    },
  });
}

function SolicitacoesPage() {
  const qc = useQueryClient();
  const { activeOrgId, isAdmin, activeOrg } = useActiveOrg();
  const { data: pending = [], isLoading } = usePendingMembers();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pending-members", activeOrgId] });
    qc.invalidateQueries({ queryKey: ["admin-members", activeOrgId] });
    qc.invalidateQueries({ queryKey: ["my-organizations"] });
  };

  const approve = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await (supabase.rpc as any)("approve_member", { _org: activeOrgId!, _user: user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Membro aprovado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await (supabase.rpc as any)("reject_member", { _org: activeOrgId!, _user: user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pedido recusado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Apenas admins da equipe podem ver esta página.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
          <UserCheck className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold font-display">Solicitações</h1>
          <p className="text-sm text-muted-foreground">
            Autorize quem pode participar de {activeOrg?.brand_name || activeOrg?.name || "sua equipe"}.
          </p>
        </div>
      </div>

      <Card className="glass-panel">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : pending.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma solicitação pendente no momento.</div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.user_id} className="p-4 flex items-center gap-4 hover-lift">
                <div className="size-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="size-full object-cover" />
                    : <span className="text-xs font-medium">{(p.full_name ?? "?").slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.full_name ?? "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.phone ? `${p.phone} · ` : ""}
                    pediu em {new Date(p.requested_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(p.user_id)}>
                    <Check className="size-3 mr-1" /> Aprovar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline"><X className="size-3 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Recusar {p.full_name ?? "este pedido"}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A pessoa não entrará na equipe. Ela poderá solicitar novamente pelo link de entrada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => reject.mutate(p.user_id)}>Recusar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
