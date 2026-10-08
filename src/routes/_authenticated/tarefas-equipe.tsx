import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileDown } from "lucide-react";
import { fetchAssignedTasks } from "@/lib/report-tasks";
import { exportIndividualTasksPDF, exportTeamTasksPDF, GROUP_LABEL, groupOf, isLate, periodTasks } from "@/lib/tasks-pdf";

export const Route = createFileRoute("/_authenticated/tarefas-equipe")({
  ssr: false,
  component: TeamTasksPage,
  head: () => ({
    meta: [
      { title: "Tarefas da equipe | GE by Acrux ROBOCEP" },
      { name: "description", content: "Relatórios de tarefas distribuídas por membro, com exportação em papel timbrado." },
      { property: "og:title", content: "Tarefas da equipe | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Quantas tarefas foram concluídas, estão em andamento ou não foram feitas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TeamTasksPage() {
  const { activeOrgId, activeOrg, isAdmin } = useActiveOrg();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [member, setMember] = useState("all");
  const [area, setArea] = useState("all");

  const { data: directory = [] } = useQuery({
    queryKey: ["directory", activeOrgId],
    enabled: !!activeOrgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_directory", { _org: activeOrgId! });
      if (error) throw error;
      return data ?? [];
    },
  });
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of directory as any[]) m[p.id] = p.full_name ?? "Sem nome";
    return m;
  }, [directory]);
  const ids = (directory as any[]).map((p) => p.id as string);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["team-tasks", activeOrgId, ids.join(",")],
    enabled: !!activeOrgId && isAdmin && ids.length > 0,
    queryFn: () => fetchAssignedTasks(activeOrgId!, ids),
  });

  const areas = useMemo(() => Array.from(new Set(tasks.map((t) => t.area_name))).sort(), [tasks]);
  const scoped = tasks.filter((t) => area === "all" || t.area_name === area);
  const memberIds = member === "all" ? ids : [member];
  const filtered = scoped.filter((t) => memberIds.includes(t.user_id));
  const g = periodTasks(filtered, from, to);
  const list = [...g.done, ...g.doing, ...g.todo];
  const opts = { orgName: activeOrg?.brand_name || activeOrg?.name || "—", from, to, names };

  const exportCSV = () => {
    const rows = [["Membro", "Tarefa", "Área", "Situação", "Prazo", "Atrasada"],
      ...list.map((t) => [names[t.user_id] ?? "", t.title, t.area_name, GROUP_LABEL[groupOf(t.status)], t.due_date ?? "", isLate(t) ? "sim" : ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `tarefas-equipe-${from}-a-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Apenas admins da equipe podem ver esta página.</div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Tarefas da equipe</h1>
        <p className="text-sm text-muted-foreground">Concluídas no período, em andamento e não feitas, por integrante.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground">Membro</label>
            <Select value={member} onValueChange={setMember}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os membros</SelectItem>
                {ids.map((id) => <SelectItem key={id} value={id}>{names[id]}</SelectItem>)}
              </SelectContent>
            </Select></div>
          <div><label className="text-xs text-muted-foreground">Área</label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={list.length === 0}><Download /> CSV</Button>
          <Button onClick={() => exportTeamTasksPDF(scoped, memberIds, opts)} disabled={ids.length === 0}>
            <FileDown /> PDF da equipe
          </Button>
          <Button variant="outline" onClick={() => exportIndividualTasksPDF(scoped, memberIds, opts)} disabled={ids.length === 0}>
            <FileDown /> {member === "all" ? "PDF individual de todos" : "PDF individual"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Resumo por membro</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-2">Membro</th><th>Concluídas</th><th>Em andamento</th><th>Não feitas</th><th>Atrasadas</th><th /></tr>
            </thead>
            <tbody>
              {memberIds.map((uid) => {
                const m = periodTasks(scoped.filter((t) => t.user_id === uid), from, to);
                return (
                  <tr key={uid} className="border-t border-border">
                    <td className="py-2">{names[uid]}</td>
                    <td>{m.done.length}</td><td>{m.doing.length}</td><td>{m.todo.length}</td>
                    <td>{[...m.doing, ...m.todo].filter(isLate).length}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => exportIndividualTasksPDF(scoped, [uid], opts)}>
                        <FileDown className="size-3" /> PDF
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Tarefas</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p>}
        {list.map((t) => (
          <div key={`${t.id}:${t.user_id}`} className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t.title}</div>
              <div className="text-xs text-muted-foreground">{names[t.user_id]} · {t.area_name}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isLate(t) && <span className="text-xs text-destructive font-semibold">Atrasada</span>}
              <Badge variant="outline">{GROUP_LABEL[groupOf(t.status)]}</Badge>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
