import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalAdmin } from "@/hooks/use-global-admin";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { Trash2, Pencil, Users, ListChecks, CalendarDays, Clock, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/org/hub")({
  ssr: false,
  component: OrgHubPage,
  head: () => ({
    meta: [
      { title: "Todas as equipes | GE by Acrux ROBOCEP" },
      { name: "description", content: "Painel geral com todas as equipes da plataforma, seus dados e exclusão." },
      { property: "og:title", content: "Todas as equipes | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Visão geral de todas as equipes criadas na plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_name: string | null;
  created_at: string;
  owner_name: string | null;
  member_count: number;
  pending_count: number;
  task_count: number;
  event_count: number;
  time_entry_count: number;
};

function OrgHubPage() {
  const { isGlobalAdmin, isLoading: loadingRole } = useGlobalAdmin();
  const { activeOrgId, setActiveOrgId, refetch: refetchOrgs } = useActiveOrg();
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState<OrgRow | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<OrgRow | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["all-organizations"],
    enabled: isGlobalAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("superadmin_list_organizations");
      if (error) throw error;
      return (data ?? []) as OrgRow[];
    },
  });

  const dupNames = useMemo(() => {
    const count: Record<string, number> = {};
    for (const o of orgs) count[o.name.trim().toLowerCase()] = (count[o.name.trim().toLowerCase()] ?? 0) + 1;
    return new Set(Object.entries(count).filter(([, n]) => n > 1).map(([n]) => n));
  }, [orgs]);

  const renameMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("superadmin_rename_organization", {
        _org: renaming!.id, _name: newName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Equipe renomeada");
      setRenaming(null);
      qc.invalidateQueries({ queryKey: ["all-organizations"] });
      refetchOrgs();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("superadmin_delete_organization", { _org: deleting!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      const wasActive = deleting?.id === activeOrgId;
      toast.success("Equipe excluída");
      setDeleting(null);
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["all-organizations"] });
      refetchOrgs().then?.(() => {});
      if (wasActive) {
        const next = orgs.find((o) => o.id !== deleting?.id);
        if (next) setActiveOrgId(next.id);
      }
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loadingRole) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isGlobalAdmin) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <ShieldAlert className="size-6" />
        Esta página é restrita.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Todas as equipes</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral de todas as equipes criadas na plataforma. {orgs.length} no total.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando equipes…</p>}

      <div className="space-y-3">
        {orgs.map((o) => {
          const isDup = dupNames.has(o.name.trim().toLowerCase());
          return (
            <Card key={o.id} className="p-4 hover:border-primary/40 transition-colors">
              <div className="flex flex-wrap items-start gap-4">
                <BrandLogo src={o.logo_url} alt={`Logo ${o.name}`} className="size-10 rounded-md shrink-0" />
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{o.name}</span>
                    {o.id === activeOrgId && <Badge variant="secondary">Equipe ativa</Badge>}
                    {isDup && <Badge variant="destructive">Nome repetido</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    /{o.slug} · dono: {o.owner_name ?? "—"} · criada em{" "}
                    {new Date(o.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><Users className="size-3" /> {o.member_count} membros
                      {o.pending_count > 0 && ` (+${o.pending_count} pendentes)`}</span>
                    <span className="flex items-center gap-1"><ListChecks className="size-3" /> {o.task_count} tarefas</span>
                    <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {o.event_count} eventos</span>
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {o.time_entry_count} pontos</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setRenaming(o); setNewName(o.name); }}>
                    <Pencil className="size-4" /> Renomear
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { setDeleting(o); setConfirmText(""); }}>
                    <Trash2 className="size-4" /> Excluir
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear equipe</DialogTitle></DialogHeader>
          <div><Label>Novo nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button onClick={() => renameMut.mutate()} disabled={!newName.trim() || renameMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir equipe</DialogTitle>
            <DialogDescription>
              Serão apagados definitivamente {deleting?.member_count ?? 0} vínculos de membros,{" "}
              {deleting?.task_count ?? 0} tarefas, {deleting?.event_count ?? 0} eventos e{" "}
              {deleting?.time_entry_count ?? 0} registros de ponto desta equipe. Não há como desfazer.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Digite <span className="font-semibold">{deleting?.name}</span> para confirmar</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== deleting?.name || deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
