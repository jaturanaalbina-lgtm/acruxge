import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard, NewTaskButton } from "@/components/KanbanBoard";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, KanbanSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/area/$slug/")({
  ssr: false,
  component: AreaPage,
});

function AreaPage() {
  const { slug } = Route.useParams();

  const { data: area } = useQuery({
    queryKey: ["area", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!area) return <div className="p-6 text-sm text-muted-foreground">Carregando área…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{area.name}</h1>
            <p className="text-sm text-muted-foreground">Gestão de projetos e tarefas da área.</p>
          </div>
          <NewTaskButton areaId={area.id} />
        </div>
      </div>
      <Tabs defaultValue="kanban" className="flex-1 flex flex-col">
        <div className="px-6 border-b border-border">
          <TabsList>
            <TabsTrigger value="kanban"><KanbanSquare className="size-4" /> Kanban da área</TabsTrigger>
            <TabsTrigger value="projects"><FolderKanban className="size-4" /> Projetos</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="kanban" className="flex-1 m-0">
          <KanbanBoard areaId={area.id} projectId={null} />
        </TabsContent>
        <TabsContent value="projects" className="flex-1 m-0 p-6">
          <ProjectsList areaId={area.id} areaSlug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProjectsList({ areaId, areaSlug }: { areaId: string; areaSlug: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", areaId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("area_id", areaId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("projects").insert({ area_id: areaId, name, description: desc || null, due_date: due || null, created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Projeto criado"); qc.invalidateQueries({ queryKey: ["projects", areaId] }); setOpen(false); setName(""); setDesc(""); setDue(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> Novo projeto</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Descrição</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div><Label>Prazo</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!name || create.isPending}>Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects.length === 0 && <p className="text-sm text-muted-foreground col-span-2">Nenhum projeto ainda.</p>}
        {projects.map((p: any) => (
          <Link key={p.id} to="/area/$slug/project/$id" params={{ slug: areaSlug, id: p.id }}>
            <Card className="p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</div>}
                </div>
                <Badge variant="outline">{p.priority}</Badge>
              </div>
              {p.due_date && <div className="text-xs text-muted-foreground mt-2">Prazo: {new Date(p.due_date).toLocaleDateString("pt-BR")}</div>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
