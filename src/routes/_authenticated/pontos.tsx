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
import { Clock, Download, FileDown, Users } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/pontos")({
  ssr: false,
  component: PontosAdminPage,
});

type Entry = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  notes: string | null;
};

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateLong(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PontosAdminPage() {
  const { activeOrgId, activeOrg, isAdmin } = useActiveOrg();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [member, setMember] = useState<string>("all");

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
    const map: Record<string, string> = {};
    for (const p of directory as any[]) map[p.id] = p.full_name ?? "Sem nome";
    return map;
  }, [directory]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["org-time-entries", activeOrgId, from, to],
    enabled: !!activeOrgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,user_id,work_date,clock_in,clock_out,duration_minutes,notes")
        .eq("organization_id", activeOrgId!)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const filtered = useMemo(
    () => (member === "all" ? entries : entries.filter((e) => e.user_id === member)),
    [entries, member],
  );

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filtered) map[e.user_id] = (map[e.user_id] ?? 0) + (e.duration_minutes ?? 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const totalMin = filtered.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

  const exportCSV = () => {
    const header = ["Membro", "Data", "Entrada", "Saída", "Duração (min)", "Atividades"];
    const rows = filtered.map((e) => [
      names[e.user_id] ?? e.user_id,
      e.work_date,
      fmtTime(e.clock_in),
      e.clock_out ? fmtTime(e.clock_out) : "",
      e.duration_minutes ?? "",
      (e.notes ?? "").replace(/\n/g, " "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pontos-equipe-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const topMargin = 40;
    const leftMargin = 20;

    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("Relatório de Ponto da Equipe", pageWidth / 2, topMargin, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(`Equipe: ${activeOrg?.brand_name || activeOrg?.name || "—"}`, leftMargin, topMargin + 8);
    doc.text(`Período: ${fmtDateLong(from)} a ${fmtDateLong(to)}`, leftMargin, topMargin + 14);
    doc.text(`Total de horas: ${fmtDuration(totalMin)}`, leftMargin, topMargin + 20);

    autoTable(doc, {
      startY: topMargin + 26,
      margin: { left: leftMargin, right: 20, top: topMargin, bottom: 30 },
      head: [["Membro", "Data", "Entrada", "Saída", "Duração", "Atividades realizadas"]],
      body: filtered.map((e) => [
        names[e.user_id] ?? "—",
        fmtDateLong(e.work_date),
        fmtTime(e.clock_in),
        e.clock_out ? fmtTime(e.clock_out) : "—",
        e.duration_minutes ? fmtDuration(e.duration_minutes) : "—",
        (e.notes ?? "").trim() || "—",
      ]),
      styles: { font: "times", fontSize: 9, cellPadding: 2, valign: "top", textColor: 20 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 22 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 18, halign: "center" },
        5: { cellWidth: "auto" },
      },
    });

    doc.save(`relatorio-pontos-equipe-${from}-a-${to}.pdf`);
  };

  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Apenas admins da equipe podem ver esta página.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight font-display">Pontos da equipe</h1>
        <p className="text-sm text-muted-foreground">
          Todos os registros de ponto e relatórios diários dos membros da equipe.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Membro</label>
              <Select value={member} onValueChange={setMember}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os membros</SelectItem>
                  {(directory as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="h-9 px-3 text-sm">
              Total: <span className="font-mono ml-1">{fmtDuration(totalMin)}</span>
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download /> CSV
            </Button>
            <Button onClick={exportPDF} disabled={filtered.length === 0}>
              <FileDown /> PDF (papel timbrado)
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Users className="size-4" /> Horas por membro</h2>
        {totals.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map(([uid, mins]) => (
            <div key={uid} className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm truncate">{names[uid] ?? "Membro"}</span>
              <Badge variant="outline" className="font-mono">{fmtDuration(mins)}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Clock className="size-4" /> Registros</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum registro neste período.</p>
        )}
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="grid md:grid-cols-[180px_150px_1fr] gap-3 items-start rounded-md border border-border p-3">
              <div className="text-sm font-medium truncate">{names[e.user_id] ?? "Membro"}</div>
              <div className="text-sm">
                <div className="font-mono">
                  {fmtTime(e.clock_in)} → {e.clock_out ? fmtTime(e.clock_out) : "..."}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDateLong(e.work_date)} · {e.duration_minutes ? fmtDuration(e.duration_minutes) : "em curso"}
                </div>
              </div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {(e.notes ?? "").trim() || "Sem relatório."}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
