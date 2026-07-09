import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Trash2, Mail, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invites")({
  ssr: false,
  component: InvitesPage,
});

type Invite = {
  id: string;
  email: string;
  area_id: string | null;
  is_leader: boolean;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  note: string | null;
};

import { useActiveOrg } from "@/contexts/active-org";

function InvitesPage() {
  const qc = useQueryClient();
  const { activeOrgId, isAdmin } = useActiveOrg();
  const [email, setEmail] = useState("");
  const [areaId, setAreaId] = useState<string>("none");
  const [isLeader, setIsLeader] = useState(false);
  const [note, setNote] = useState("");

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

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["invites", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("organization_id", activeOrgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
  });

  const areaById = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);

  const createInvite = useMutation({
    mutationFn: async () => {
      if (!activeOrgId) throw new Error("Nenhuma equipe ativa");
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("invites").insert({
        email,
        organization_id: activeOrgId,
        is_leader: isLeader,
        note: note || null,
        area_id: areaId === "none" ? null : areaId,
        invited_by: user.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite criado");
      setEmail(""); setNote(""); setIsLeader(false); setAreaId("none");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Apenas admins podem gerenciar convites.</div>;

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite removido");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const inviteUrl = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/auth?invite=${token}`;

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success("Link copiado");
  };

  const statusOf = (i: Invite) => {
    if (i.used_at) return { label: "Aceito", tone: "default" as const };
    if (new Date(i.expires_at).getTime() < Date.now()) return { label: "Expirado", tone: "secondary" as const };
    return { label: "Pendente", tone: "outline" as const };
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Convites de membros</h1>
        <p className="text-sm text-muted-foreground">
          Convide pessoas por email. Quando elas criarem a conta com o mesmo email, serão vinculadas automaticamente à área escolhida.
        </p>
      </div>

      <Card className="glass-panel p-5">
        <h2 className="text-sm font-semibold mb-3">Novo convite</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" />
          </div>
          <div>
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem área (apenas membro)</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.parent_id ? `↳ ${a.name}` : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Observação (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: novo integrante de marketing 2026" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="leader" checked={isLeader} onCheckedChange={(v) => setIsLeader(Boolean(v))} />
            <Label htmlFor="leader" className="cursor-pointer">Líder da área</Label>
          </div>
          <div className="flex items-end justify-end">
            <Button
              disabled={!email || createInvite.isPending}
              onClick={() => createInvite.mutate()}
            >
              <Mail className="size-4 mr-2" /> Criar convite
            </Button>
          </div>
        </div>
      </Card>

      <Card className="glass-panel p-5">
        <h2 className="text-sm font-semibold mb-3">Convites emitidos</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convite emitido ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map((i) => {
              const st = statusOf(i);
              const area = i.area_id ? areaById[i.area_id] : null;
              return (
                <li key={i.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{i.email}</span>
                      <Badge variant={st.tone}>{st.label}</Badge>
                      {area && <Badge variant="outline">{area.name}</Badge>}
                      {i.is_leader && <Badge variant="outline"><ShieldCheck className="size-3 mr-1" /> Líder</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <Clock className="size-3" /> Expira {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                      {i.note && <span>· {i.note}</span>}
                    </div>
                  </div>
                  {!i.used_at && (
                    <Button size="sm" variant="outline" onClick={() => copy(i.token)}>
                      <Copy className="size-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Dica: também é possível enviar o link manualmente — <Link to="/dashboard" className="underline">voltar ao painel</Link>.
      </p>
    </div>
  );
}
