import { useState, useEffect, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalIcon, GripVertical } from "lucide-react";
import { toast } from "sonner";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "A Fazer" },
  { key: "in_progress", label: "Em Andamento" },
  { key: "review", label: "Em Revisão" },
  { key: "approval", label: "Aguardando Aprovação" },
  { key: "done", label: "Concluído" },
];

type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "approval" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  labels: string[] | null;
  progress: number | null;
  area_id: string;
  project_id: string | null;
}

export function KanbanBoard({ areaId, projectId }: { areaId: string; projectId?: string | null }) {
  const qc = useQueryClient();
  const key = ["tasks", areaId, projectId ?? "area"];

  const { data: tasks = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").eq("area_id", areaId);
      q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`tasks:${areaId}:${projectId ?? "area"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `area_id=eq.${areaId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, projectId]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === id ? { ...t, status } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); toast.error("Não foi possível mover."); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const [dragging, setDragging] = useState<string | null>(null);
  const onDragStart = (e: DragEvent, id: string) => { setDragging(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    if (dragging) updateStatus.mutate({ id: dragging, status });
    setDragging(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto p-4 pb-6 min-h-[calc(100vh-12rem)]">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.key);
        return (
          <div key={col.key} className="kanban-col w-72 shrink-0 flex flex-col" onDragOver={onDragOver} onDrop={(e) => onDrop(e, col.key)}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="h-5">{items.length}</Badge>
              </div>
              <NewTaskButton areaId={areaId} projectId={projectId} status={col.key} compact />
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {items.map((task) => (
                <TaskCard key={task.id} task={task} onDragStart={(e) => onDragStart(e, task.id)} />
              ))}
              {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">Vazio</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onDragStart }: { task: Task; onDragStart: (e: DragEvent) => void }) {
  const priorityClr: Record<Priority, string> = {
    urgent: "bg-red-500/15 text-red-300 border-red-500/30",
    high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    medium: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    low: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
  return (
    <Card draggable onDragStart={onDragStart} className="p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors group">
      <div className="flex items-start gap-2">
        <GripVertical className="size-3 text-muted-foreground mt-1 opacity-0 group-hover:opacity-100" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-sm font-medium leading-snug">{task.title}</div>
          {task.description && <div className="text-xs text-muted-foreground line-clamp-2">{task.description}</div>}
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={priorityClr[task.priority]}>{task.priority}</Badge>
            {task.due_date && (
              <Badge variant="outline" className="gap-1"><CalIcon className="size-3" />{new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Badge>
            )}
            {task.labels?.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function NewTaskButton({ areaId, projectId, status = "backlog", compact = false }: { areaId: string; projectId?: string | null; status?: TaskStatus; compact?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        area_id: areaId, project_id: projectId ?? null, title, description: description || null,
        status, priority, due_date: dueDate || null,
        labels: labels ? labels.split(",").map((x) => x.trim()).filter(Boolean) : [],
        created_by: u.user?.id, assignee_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tasks", areaId] });
      setOpen(false); setTitle(""); setDescription(""); setDueDate(""); setLabels("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact
          ? <Button variant="ghost" size="icon" className="size-6"><Plus className="size-3" /></Button>
          : <Button size="sm"><Plus className="size-4" /> Nova tarefa</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Prazo</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div><Label>Etiquetas (separadas por vírgula)</Label><Input value={labels} onChange={(e) => setLabels(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!title || create.isPending}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
