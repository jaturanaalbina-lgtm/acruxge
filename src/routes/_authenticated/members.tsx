import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { removeMember, setAdminRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Users, ShieldCheck, ShieldOff, Plus, Trash2, Settings2, UserX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/members")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: MembersPage,
});

type Membership = { area_id: string; is_leader: boolean };
type Member = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_admin: boolean;
  memberships: Membership[];
};

function MembersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const removeMemberFn = useServerFn(removeMember);
  const setAdminFn = useServerFn(setAdminRole);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_members");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const areaById = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);

  const filtered = members.filter((m) =>
    !search || (m.full_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const addMembership = useMutation({
    mutationFn: async (p: { user_id: string; area_id: string; is_leader: boolean }) => {
      const { error } = await supabase
        .from("area_members")
        .upsert({ area_id: p.area_id, user_id: p.user_id, is_leader: p.is_leader }, { onConflict: "area_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Área atribuída");
      qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleLeader = useMutation({
    mutationFn: async (p: { user_id: string; area_id: string; is_leader: boolean }) => {
      const { error } = await supabase
        .from("area_members")
        .update({ is_leader: p.is_leader })
        .eq("user_id", p.user_id)
        .eq("area_id", p.area_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMembership = useMutation({
    mutationFn: async (p: { user_id: string; area_id: string }) => {
      const { error } = await supabase
        .from("area_members")
        .delete()
        .eq("user_id", p.user_id)
        .eq("area_id", p.area_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da área");
      qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAdmin = useMutation({
    mutationFn: async (p: { user_id: string; is_admin: boolean }) =>
      setAdminFn({ data: p }),
    onSuccess: (_r, p) => {
      toast.success(p.is_admin ? "Promovido a admin" : "Admin removido");
      qc.invalidateQueries({ queryKey: ["admin-members"] });
      qc.invalidateQueries({ queryKey: ["sidebar-admin-info"] });
      qc.invalidateQueries({ queryKey: ["is-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMember = useMutation({
    mutationFn: async (user_id: string) => removeMemberFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Membro removido");
      qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
          <Users className="size-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Membros</h1>
          <p className="text-sm text-muted-foreground">Atribua áreas e defina quem é líder.</p>
        </div>
        <Input
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      <Card className="glass-panel">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum membro encontrado.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((m) => (
              <li key={m.id} className="p-4 flex items-start gap-4">
                <div className="size-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium">{(m.full_name ?? "?").slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{m.full_name ?? "Sem nome"}</span>
                    {m.is_admin && <Badge variant="default">Admin</Badge>}
                    {m.memberships.length === 0 && (
                      <Badge variant="outline" className="text-muted-foreground">Sem área</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.memberships.map((mb) => {
                      const area = areaById[mb.area_id];
                      if (!area) return null;
                      return (
                        <div
                          key={mb.area_id}
                          className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                        >
                          <span>{area.name}</span>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <Checkbox
                              checked={mb.is_leader}
                              onCheckedChange={(v) =>
                                toggleLeader.mutate({
                                  user_id: m.id,
                                  area_id: mb.area_id,
                                  is_leader: Boolean(v),
                                })
                              }
                            />
                            <ShieldCheck className="size-3" /> Líder
                          </label>
                          <button
                            onClick={() =>
                              removeMembership.mutate({ user_id: m.id, area_id: mb.area_id })
                            }
                            className="text-destructive hover:opacity-70"
                            title="Remover da área"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <AddAreaDialog
                  areas={areas}
                  existing={m.memberships.map((x) => x.area_id)}
                  onAdd={(area_id, is_leader) =>
                    addMembership.mutate({ user_id: m.id, area_id, is_leader })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddAreaDialog({
  areas,
  existing,
  onAdd,
}: {
  areas: Array<{ id: string; name: string; parent_id: string | null }>;
  existing: string[];
  onAdd: (area_id: string, is_leader: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState<string>("");
  const [isLeader, setIsLeader] = useState(false);
  const available = areas.filter((a) => !existing.includes(a.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-3 mr-1" /> Área
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4" /> Atribuir área
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {available.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.parent_id ? `↳ ${a.name}` : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isLeader} onCheckedChange={(v) => setIsLeader(Boolean(v))} />
            <span className="text-sm">Definir como líder da área</span>
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={!areaId}
            onClick={() => {
              onAdd(areaId, isLeader);
              setOpen(false);
              setAreaId("");
              setIsLeader(false);
            }}
          >
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
