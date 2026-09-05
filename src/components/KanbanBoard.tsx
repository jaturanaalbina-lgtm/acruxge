import { useState, useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalIcon, GripVertical, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "A Fazer" },
  { key: "in_progress", label: "Fazendo" },
  { key: "done", label: "Feito" },
];

const UNASSIGNED = "__none__";

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
  assignee_id: string | null;
}

export type Member = { id: string; full_name: string | null; avatar_url: string | null };

export function useOrgMembers() {
  const { activeOrgId } = useActiveOrg();
  return useQuery({
    queryKey: ["directory", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory", { _org: activeOrgId! });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/** Nenhuma tarefa pode sumir: situações antigas caem nas 3 colunas atuais. */
const COLUMN_OF: Record<TaskStatus, TaskStatus> = {
  backlog: "todo",
  todo: "todo",
  in_progress: "in_progress",
  review: "in_progress",
  approval: "in_progress",
  done: "done",
};

export function KanbanBoard({ areaId, projectId }: { areaId: string; projectId?: string | null }) {
  const qc = useQueryClient();
  const key = ["tasks", areaId, projectId ?? "area"];
  const { data: members = [] } = useOrgMembers();

  const { data: tasks = [], isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      // tarefas compartilhadas com esta área
      const { data: shared } = await supabase.from("task_areas").select("task_id").eq("area_id", areaId);
      const sharedIds = (shared ?? []).map((r: any) => r.task_id as string);

      let q = supabase.from("tasks").select("*").eq("area_id", areaId);
      q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
      const { data, error } = await q
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const own = (data ?? []) as Task[];

      const missing = sharedIds.filter((id) => !own.some((t) => t.id === id));
      if (!missing.length) return own;
      const { data: extra, error: extraErr } = await supabase
        .from("tasks").select("*").in("id", missing)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (extraErr) throw extraErr;
      return [...own, ...((extra ?? []) as Task[])];
    },
  });

  // responsáveis adicionais (tarefas compartilhadas)
  const taskIds = tasks.map((t) => t.id);
  const assigneesKey = [...taskIds].sort().join(",");
  const { data: extraAssignees = {} } = useQuery({
    queryKey: ["task-assignees", areaId, assigneesKey],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("task_assignees").select("task_id,user_id").in("task_id", taskIds);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of (data ?? []) as any[]) (map[r.task_id] ||= []).push(r.user_id);
      return map;
    },
  });


  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });
    const channel = supabase
      .channel(`tasks-board:${areaId}:${projectId ?? "area"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_areas" }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, projectId]);

  const patchTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); toast.error("Não foi possível atualizar a tarefa."); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (!count) throw new Error("Você não tem permissão para excluir esta tarefa.");
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) => old.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e?.message ?? "Não foi possível excluir a tarefa.");
    },
    onSuccess: () => toast.success("Tarefa excluída"),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const reorder = useMutation({
    mutationFn: async (updates: { id: string; status: TaskStatus; position: number }[]) => {
      for (const u of updates) {
        const { error } = await supabase.from("tasks")
          .update({ status: u.status, position: u.position }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onError: () => { toast.error("Não foi possível mover a tarefa."); qc.invalidateQueries({ queryKey: key }); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // Pointer-based drag & drop (works with mouse and touch)
  const [drag, setDrag] = useState<{ id: string; title: string; x: number; y: number } | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null);

  const columnAt = (x: number, y: number): TaskStatus | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const col = el?.closest("[data-col]") as HTMLElement | null;
    return (col?.dataset.col as TaskStatus) ?? null;
  };

  /** Índice onde o cartão deve entrar dentro da coluna, pela posição do ponteiro. */
  const indexAt = (colKey: TaskStatus, y: number, draggedId: string) => {
    const list = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-col="${colKey}"] [data-task]`),
    ).filter((el) => el.dataset.task !== draggedId);
    let idx = list.length;
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { idx = i; break; }
    }
    return idx;
  };

  const startDrag = (e: RPointerEvent, task: Task) => {
    if ((e.target as HTMLElement).closest("button,select,[role='combobox'],a,input")) {
      const handle = (e.target as HTMLElement).closest("[data-drag-handle]");
      if (!handle) return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: task.id, startX: e.clientX, startY: e.clientY, active: false };
  };

  const moveDrag = (e: RPointerEvent) => {
    const cur = dragRef.current;
    if (!cur) return;
    if (!cur.active) {
      const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
      if (dist < 5) return;
      cur.active = true;
      const t = tasks.find((x) => x.id === cur.id);
      setDrag({ id: cur.id, title: t?.title ?? "", x: e.clientX, y: e.clientY });
    }
    e.preventDefault();
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setOverCol(columnAt(e.clientX, e.clientY));
  };

  const endDrag = (e: RPointerEvent) => {
    const cur = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setOverCol(null);
    if (!cur || !cur.active) return;

    const colKey = columnAt(e.clientX, e.clientY);
    const task = tasks.find((t) => t.id === cur.id);
    if (!colKey || !task) return;

    const target = tasks.filter((t) => COLUMN_OF[t.status] === colKey && t.id !== task.id);
    const idx = indexAt(colKey, e.clientY, task.id);
    target.splice(idx, 0, { ...task, status: colKey });

    const updates = target.map((t, i) => ({ id: t.id, status: colKey, position: i }));
    qc.setQueryData<Task[]>(key, (old = []) =>
      old.map((t) => {
        const u = updates.find((x) => x.id === t.id);
        return u ? { ...t, status: u.status, position: u.position } : t;
      }),
    );
    reorder.mutate(updates.filter((u) => {
      const orig = tasks.find((t) => t.id === u.id)!;
      return orig.status !== u.status || orig.position !== u.position;
    }));
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto p-4">
        {COLUMNS.map((c) => (
          <div key={c.key} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Não conseguimos carregar as tarefas desta área.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="size-4" /> Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex gap-3 overflow-x-auto p-4 pb-6 min-h-[calc(100vh-12rem)]">
      {COLUMNS.map((col) => {
        const items = tasks
          .filter((t) => COLUMN_OF[t.status] === col.key)
          .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
        return (
          <div
            key={col.key}
            data-col={col.key}
            className={`kanban-col w-72 shrink-0 flex flex-col rounded-lg transition-colors ${
              overCol === col.key ? "ring-2 ring-primary/60 bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-display">{col.label}</span>
                <Badge variant="secondary" className="h-5">{items.length}</Badge>
              </div>
              <NewTaskButton areaId={areaId} projectId={projectId} status={col.key} compact />
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={members}
                  coAssigneeIds={(extraAssignees as Record<string, string[]>)[task.id] ?? []}
                  shared={task.area_id !== areaId}

                  dragging={drag?.id === task.id}
                  onPointerDownHandle={(e) => startDrag(e, task)}
                  onPointerMoveHandle={moveDrag}
                  onPointerUpHandle={endDrag}
                  onAssign={(assignee_id) => patchTask.mutate({ id: task.id, patch: { assignee_id } })}
                  onDelete={() => deleteTask.mutate(task.id)}
                />
              ))}
              {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">Vazio</div>}
            </div>
          </div>
        );
      })}

      {drag && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-primary/50 bg-card px-3 py-2 text-xs shadow-lg"
          style={{ left: drag.x + 8, top: drag.y + 8, maxWidth: 220 }}
        >
          {drag.title}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task, members, coAssigneeIds = [], shared = false, dragging,
  onPointerDownHandle, onPointerMoveHandle, onPointerUpHandle, onAssign, onDelete,
}: {
  task: Task;
  members: Member[];
  coAssigneeIds?: string[];
  shared?: boolean;
  dragging: boolean;
  onPointerDownHandle: (e: RPointerEvent) => void;
  onPointerMoveHandle: (e: RPointerEvent) => void;
  onPointerUpHandle: (e: RPointerEvent) => void;
  onAssign: (id: string | null) => void;
  onDelete: () => void;
}) {
  const priorityClr: Record<Priority, string> = {
    urgent: "bg-red-500/15 text-red-300 border-red-500/30",
    high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    medium: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    low: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
  const assignee = members.find((m) => m.id === task.assignee_id) ?? null;
  const coAssignees = members.filter((m) => coAssigneeIds.includes(m.id) && m.id !== task.assignee_id);


  return (
    <Card className={`p-3 hover:border-primary/50 transition-all group ${dragging ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Arrastar tarefa"
          className="mt-0.5 -ml-1 p-1 rounded cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
          onPointerDown={onPointerDownHandle}
          onPointerMove={onPointerMoveHandle}
          onPointerUp={onPointerUpHandle}
          onPointerCancel={onPointerUpHandle}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-sm font-medium leading-snug">{task.title}</div>
          {task.description && <div className="text-xs text-muted-foreground line-clamp-2">{task.description}</div>}
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={priorityClr[task.priority]}>{task.priority}</Badge>
            {task.due_date && (
              <Badge variant="outline" className="gap-1"><CalIcon className="size-3" />{new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Badge>
            )}
            {task.labels?.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
            {shared && <Badge variant="outline" className="border-acrux/50 text-acrux-glow">Compartilhada</Badge>}
            {coAssignees.map((m) => (
              <Badge key={m.id} variant="secondary" className="gap-1">
                <UserRound className="size-3" />{m.full_name ?? "Membro"}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Avatar className="size-6">
              {assignee?.avatar_url && <AvatarImage src={assignee.avatar_url} alt={assignee.full_name ?? "Responsável"} />}
              <AvatarFallback className="text-[10px]">
                {assignee ? initials(assignee.full_name) : <UserRound className="size-3" />}
              </AvatarFallback>
            </Avatar>
            <Select
              value={task.assignee_id ?? UNASSIGNED}
              onValueChange={(v) => onAssign(v === UNASSIGNED ? null : v)}
            >
              <SelectTrigger className="h-7 text-xs flex-1" aria-label="Responsável">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Membro"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir tarefa"
              className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
              <AlertDialogDescription>
                “{task.title}” será removida definitivamente para toda a equipe.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}


export function NewTaskButton({ areaId, projectId, status = "todo", compact = false }: { areaId: string; projectId?: string | null; status?: TaskStatus; compact?: boolean }) {
  const qc = useQueryClient();
  const { activeOrgId } = useActiveOrg();
  const { data: members = [] } = useOrgMembers();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [extraAreas, setExtraAreas] = useState<string[]>([]);

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id,name")
        .eq("organization_id", activeOrgId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setOpen(false); setTitle(""); setDescription(""); setDueDate("");
    setLabels(""); setAssignees([]); setExtraAreas([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: area, error: areaErr } = await supabase
        .from("areas").select("organization_id").eq("id", areaId).single();
      if (areaErr) throw areaErr;
      const { data: task, error } = await supabase.from("tasks").insert({
        area_id: areaId, organization_id: area.organization_id,
        project_id: projectId ?? null, title, description: description || null,
        status, priority, due_date: dueDate || null,
        labels: labels ? labels.split(",").map((x) => x.trim()).filter(Boolean) : [],
        created_by: u.user?.id, assignee_id: assignees[0] ?? null,
      }).select("id").single();
      if (error) throw error;

      const allAreas = Array.from(new Set([areaId, ...extraAreas]));
      const { error: areasErr } = await supabase.from("task_areas")
        .insert(allAreas.map((a) => ({ task_id: task.id, area_id: a })));
      if (areasErr) throw areasErr;

      if (assignees.length) {
        const { error: asErr } = await supabase.from("task_assignees")
          .insert(assignees.map((uid) => ({ task_id: task.id, user_id: uid })));
        if (asErr) throw asErr;
      }
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task-assignees"] });
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
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
          <div>
            <Label>Responsáveis</Label>
            <div className="mt-1 max-h-32 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={assignees.includes(m.id)}
                    onCheckedChange={() => toggle(assignees, setAssignees, m.id)}
                  />
                  {m.full_name ?? "Membro"}
                </label>
              ))}
              {!members.length && <div className="text-xs text-muted-foreground">Nenhum membro ativo.</div>}
            </div>
          </div>
          <div>
            <Label>Também mostrar nestas áreas</Label>
            <div className="mt-1 max-h-32 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
              {areas.filter((a) => a.id !== areaId).map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={extraAreas.includes(a.id)}
                    onCheckedChange={() => toggle(extraAreas, setExtraAreas, a.id)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
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

