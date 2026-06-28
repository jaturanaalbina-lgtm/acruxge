import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FolderKanban, ListTodo, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();

  const { data: tasks = [] } = useQuery({
    queryKey: ["my-tasks", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,area_id,areas(slug,name)")
        .eq("assignee_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["recent-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,priority,due_date,areas(slug,name)")
        .order("updated_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const pending = tasks.filter((t: any) => t.status !== "done");
  const done = tasks.filter((t: any) => t.status === "done").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Olá, {user.user_metadata?.full_name?.split(" ")[0] ?? "equipe"} 👋</h1>
          <p className="text-sm text-muted-foreground">Aqui está o resumo do seu trabalho hoje.</p>
        </div>
        <Badge variant="outline" className="gap-1"><Sparkles className="size-3" /> Acrux ROBOCEP</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={ListTodo} label="Tarefas pendentes" value={pending.length} />
        <StatCard icon={CheckCircle2} label="Concluídas (suas)" value={done} />
        <StatCard icon={FolderKanban} label="Projetos recentes" value={projects.length} />
        <StatCard icon={Clock} label="Próximas entregas" value={pending.filter((t: any) => t.due_date).length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><ListTodo className="size-4" /> Minhas tarefas</h2>
          <div className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nada pendente. Bom trabalho!</p>}
            {pending.slice(0, 8).map((t: any) => (
              <Link key={t.id} to="/area/$slug" params={{ slug: t.areas?.slug ?? "" }} className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-accent transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.areas?.name}</div>
                </div>
                <PriorityBadge p={t.priority} />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><FolderKanban className="size-4" /> Projetos recentes</h2>
          <div className="space-y-2">
            {projects.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto ainda. Crie um na sua área.</p>}
            {projects.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-md border border-border">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.areas?.name}</div>
                </div>
                <PriorityBadge p={p.priority} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="size-10 rounded-md bg-accent flex items-center justify-center"><Icon className="size-4" /></div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500/15 text-red-300 border-red-500/30",
    high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    medium: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    low: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
  const labels: Record<string, string> = { urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa" };
  return <Badge variant="outline" className={colors[p] ?? ""}>{labels[p] ?? p}</Badge>;
}
