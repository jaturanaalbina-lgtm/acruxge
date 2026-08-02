import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FolderTree, Plus, Trash2, ArrowUp, ArrowDown, Check, Pencil } from "lucide-react";

type Area = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
};

function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "area";
}

export function AreasManager() {
  const qc = useQueryClient();
  const { activeOrgId } = useActiveOrg();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ["areas", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*")
        .eq("organization_id", activeOrgId!).order("sort_order");
      if (error) throw error;
      return data as Area[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["areas", activeOrgId] });

  const create = useMutation({
    mutationFn: async () => {
      const base = slugify(name);
      const taken = new Set(areas.map((a) => a.slug));
      let slug = base;
      let i = 2;
      while (taken.has(slug)) slug = `${base}-${i++}`;
      const nextOrder = Math.max(0, ...areas.map((a) => a.sort_order ?? 0)) + 1;
      const { error } = await supabase.from("areas").insert({
        organization_id: activeOrgId!,
        parent_id: parentId === "none" ? null : parentId,
        name: name.trim(),
        slug,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Área criada");
      setName("");
      setParentId("none");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async (p: { id: string; name: string }) => {
      const { error } = await supabase.from("areas").update({ name: p.name.trim() }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { setEditingId(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async (p: { a: Area; b: Area }) => {
      const oa = p.a.sort_order ?? 0;
      const ob = p.b.sort_order ?? 0;
      const { error: e1 } = await supabase.from("areas").update({ sort_order: ob }).eq("id", p.a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("areas").update({ sort_order: oa }).eq("id", p.b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Área excluída"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const parents = areas.filter((a) => !a.parent_id);
  const ordered: Area[] = parents.flatMap((p) => [p, ...areas.filter((a) => a.parent_id === p.id)]);

  const siblings = (a: Area) =>
    a.parent_id ? areas.filter((x) => x.parent_id === a.parent_id) : parents;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <FolderTree className="size-4 text-muted-foreground" />
        <div>
          <h2 className="font-medium">Áreas da equipe</h2>
          <p className="text-xs text-muted-foreground">
            Cada área tem seu próprio Kanban. Subáreas ficam agrupadas na barra lateral.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma área ainda. Crie a primeira abaixo.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {ordered.map((a) => {
            const sib = siblings(a);
            const idx = sib.findIndex((x) => x.id === a.id);
            return (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={a.parent_id ? "pl-5 text-muted-foreground" : "font-medium"}>
                  {a.parent_id ? "↳ " : ""}
                </span>
                {editingId === a.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => rename.mutate({ id: a.id, name: editName })}
                      disabled={!editName.trim()}
                    >
                      <Check className="size-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{a.name}</span>
                    <Button size="sm" variant="ghost"
                      onClick={() => { setEditingId(a.id); setEditName(a.name); }}
                      title="Renomear">
                      <Pencil className="size-3" />
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" disabled={idx <= 0}
                  onClick={() => move.mutate({ a, b: sib[idx - 1] })} title="Subir">
                  <ArrowUp className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" disabled={idx < 0 || idx >= sib.length - 1}
                  onClick={() => move.mutate({ a, b: sib[idx + 1] })} title="Descer">
                  <ArrowDown className="size-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" title="Excluir área">
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir “{a.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso remove também as subáreas, projetos, tarefas e posts vinculados a ela.
                        Não pode ser desfeito.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(a.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <Label>Nova área</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Design" />
        </div>
        <div>
          <Label>Dentro de</Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Área principal</SelectItem>
              {parents.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => create.mutate()} disabled={name.trim().length < 2 || create.isPending}>
          <Plus className="size-3 mr-1" /> Criar
        </Button>
      </div>
    </Card>
  );
}
