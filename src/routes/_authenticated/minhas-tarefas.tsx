import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAssignedTasks } from "@/lib/report-tasks";
import { groupOf, GROUP_LABEL, isLate, type TaskGroup } from "@/lib/tasks-pdf";

export const Route = createFileRoute("/_authenticated/minhas-tarefas")({
  ssr: false,
  component: MyTasksPage,
  head: () => ({
    meta: [
      { title: "Minhas tarefas | GE by Acrux ROBOCEP" },
      { name: "description", content: "Todas as tarefas atribuídas a você em todas as áreas da equipe." },
      { property: "og:title", content: "Minhas tarefas | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Acompanhe suas tarefas feitas, em andamento e a fazer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MyTasksPage() {
  const { activeOrgId } = useActiveOrg();
  const qc = useQueryClient();
  const [group, setGroup] = useState<"all" | TaskGroup>("all");
  const [area, setArea] = useState("all");
  const [q, setQ] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      return fetchAssignedTasks(activeOrgId!, [u.user.id]);
    },
  });

  const { data: areaSlugs = {} } = useQuery({
    queryKey: ["area-slugs", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("name,slug").eq("organization_id", activeOrgId!);
      const m: Record<string, string> = {};
      for (const a of data ?? []) m[a.name] = a.slug;
      return m;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("my-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () =>
        qc.invalidateQueries({ queryKey: ["my-tasks"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const areas = useMemo(() => Array.from(new Set(tasks.map((t) => t.area_name))).sort(), [tasks]);
  const shown = tasks.filter((t) =>
    (group === "all" || groupOf(t.status) === group) &&
    (area === "all" || t.area_name === area) &&
    t.title.toLowerCase().includes(q.toLowerCase()));

  const count = (g: TaskGroup) => tasks.filter((t) => groupOf(t.status) === g).length;
  const stats = [
    ["Total", tasks.length], ["Feitas", count("done")], ["Fazendo", count("doing")],
    ["A fazer", count("todo")], ["Atrasadas", tasks.filter(isLate).length],
  ] as const;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Minhas tarefas</h1>
        <p className="text-sm text-muted-foreground">Tudo o que foi atribuído a você, em todas as áreas.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(([l, v]) => (
          <Card key={l} className="p-4">
            <div className="text-2xl font-semibold font-display">{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 flex flex-wrap gap-3">
        <Input placeholder="Buscar tarefa…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
        <Select value={group} onValueChange={(v) => setGroup(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            <SelectItem value="todo">A fazer</SelectItem>
            <SelectItem value="doing">Fazendo</SelectItem>
            <SelectItem value="done">Feitas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="p-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && shown.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>}
        {shown.map((t) => {
          const late = isLate(t);
          const slug = areaSlugs[t.area_name];
          const body = (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.area_name}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.due_date && (
                  <span className={`text-xs ${late ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
                <Badge variant={groupOf(t.status) === "done" ? "secondary" : "outline"}>{GROUP_LABEL[groupOf(t.status)]}</Badge>
              </div>
            </>
          );
          const cls = "flex items-center justify-between gap-3 p-3 rounded-md border border-border hover:bg-accent transition-colors";
          return slug ? (
            <Link key={t.id} to="/area/$slug" params={{ slug }} className={cls}>{body}</Link>
          ) : <div key={t.id} className={cls}>{body}</div>;
        })}
      </Card>
    </div>
  );
}
