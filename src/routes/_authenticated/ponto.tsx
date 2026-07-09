import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Play, Square, Clock, Calendar, FileText, Download, Trash2, Save, FileDown } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/ponto")({
  ssr: false,
  component: PontoPage,
});

const MIN_REPORT = 10;

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}
function fmtHMS(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtDateLong(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PontoPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [stopOpen, setStopOpen] = useState(false);
  const [stopReport, setStopReport] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile-min", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: open } = useQuery({
    queryKey: ["time-open", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["time-entries", user.id, filterFrom, filterTo],
    queryFn: async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("work_date", filterFrom)
        .lte("work_date", filterTo)
        .order("clock_in", { ascending: false });
      return data ?? [];
    },
  });

  const startMut = useMutation({
    mutationFn: async () => {
      const orgId = typeof window !== "undefined" ? localStorage.getItem("active_org_id") : null;
      if (!orgId) throw new Error("Selecione uma equipe antes de iniciar o ponto.");
      const { data: existing, error: existingError } = await supabase
        .from("time_entries")
        .select("id")
        .eq("user_id", user.id)
        .is("clock_out", null)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        throw new Error("Você já tem um ponto em aberto. Encerre-o antes de iniciar outro.");
      }
      const { data, error } = await supabase
        .from("time_entries")
        .insert({ user_id: user.id, organization_id: orgId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (entry) => {
      toast.success("Ponto iniciado");
      qc.setQueryData(["time-open", user.id], entry);
      qc.invalidateQueries({ queryKey: ["time-open", user.id] });
      qc.invalidateQueries({ queryKey: ["time-entries", user.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stopMut = useMutation({
    mutationFn: async (report: string) => {
      if (!open) return;
      const end = new Date();
      const start = new Date(open.clock_in);
      const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
      const { error } = await supabase
        .from("time_entries")
        .update({ clock_out: end.toISOString(), duration_minutes: mins, notes: report.trim() })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ponto encerrado e relatório salvo");
      setStopOpen(false);
      setStopReport("");
      qc.invalidateQueries({ queryKey: ["time-open", user.id] });
      qc.invalidateQueries({ queryKey: ["time-entries", user.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveNotesMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("time_entries").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anotação salva");
      qc.invalidateQueries({ queryKey: ["time-entries", user.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: ["time-entries", user.id] });
    },
  });

  const liveSeconds = open ? Math.max(0, Math.floor((now - new Date(open.clock_in).getTime()) / 1000)) : 0;
  const liveMinutes = Math.floor(liveSeconds / 60);

  const totalMin = useMemo(
    () => entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0),
    [entries]
  );

  const byDate = useMemo(() => {
    const map: Record<string, typeof entries> = {};
    for (const e of entries) (map[e.work_date] ||= []).push(e);
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  const openStopDialog = () => {
    if (!open) return;
    setStopReport("");
    setStopOpen(true);
  };

  const confirmStop = () => {
    const txt = stopReport.trim();
    if (txt.length < MIN_REPORT) {
      toast.error(`Descreva com pelo menos ${MIN_REPORT} caracteres o que foi feito.`);
      return;
    }
    stopMut.mutate(txt);
  };

  const exportCSV = () => {
    const header = ["Data", "Entrada", "Saída", "Duração (min)", "Atividades"];
    const rows = entries.map((e) => [
      e.work_date,
      fmtTime(e.clock_in),
      e.clock_out ? fmtTime(e.clock_out) : "",
      e.duration_minutes ?? "",
      (e.notes ?? "").replace(/\n/g, " "),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto-${filterFrom}-a-${filterTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const topMargin = 40; // espaço para o timbre físico
    const leftMargin = 20;
    const rightMargin = 20;

    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("Relatório de Ponto", pageWidth / 2, topMargin, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const nome = profile?.full_name || user.email || "—";
    doc.text(`Colaborador: ${nome}`, leftMargin, topMargin + 8);
    doc.text(
      `Período: ${fmtDateLong(filterFrom)} a ${fmtDateLong(filterTo)}`,
      leftMargin,
      topMargin + 14,
    );
    doc.text(`Total de horas: ${fmtDuration(totalMin)}`, leftMargin, topMargin + 20);

    const body: (string | number)[][] = [];
    for (const [date, list] of byDate) {
      const sorted = [...list].sort((a, b) => a.clock_in.localeCompare(b.clock_in));
      const dayTotal = sorted.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
      sorted.forEach((e, i) => {
        body.push([
          i === 0 ? fmtDateLong(date) : "",
          fmtTime(e.clock_in),
          e.clock_out ? fmtTime(e.clock_out) : "—",
          e.duration_minutes ? fmtDuration(e.duration_minutes) : "—",
          (e.notes ?? "").trim() || "—",
        ]);
        if (i === sorted.length - 1 && sorted.length > 1) {
          body.push([
            { content: `Total do dia: ${fmtDuration(dayTotal)}`, colSpan: 5, styles: { fontStyle: "italic", halign: "right", fillColor: [245, 245, 245] } } as any,
          ] as any);
        }
      });
    }

    autoTable(doc, {
      startY: topMargin + 26,
      margin: { left: leftMargin, right: rightMargin, top: topMargin, bottom: 30 },
      head: [["Data", "Entrada", "Saída", "Duração", "Atividades realizadas"]],
      body,
      styles: { font: "times", fontSize: 10, cellPadding: 2, valign: "top", textColor: 20 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 18, halign: "center" },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 20, halign: "center" },
        4: { cellWidth: "auto" },
      },
      didDrawPage: () => {
        // rodapé com assinatura na última página é adicionado após o loop
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? topMargin + 30;
    const pageHeight = doc.internal.pageSize.getHeight();
    let sigY = finalY + 25;
    if (sigY > pageHeight - 30) {
      doc.addPage();
      sigY = topMargin + 20;
    }
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const today = new Date().toLocaleDateString("pt-BR");
    doc.text(`Emitido em ${today}`, leftMargin, sigY);
    sigY += 20;
    const lineW = 80;
    doc.line(leftMargin, sigY, leftMargin + lineW, sigY);
    doc.text("Assinatura do colaborador", leftMargin, sigY + 5);
    doc.line(pageWidth - rightMargin - lineW, sigY, pageWidth - rightMargin, sigY);
    doc.text("Assinatura do responsável", pageWidth - rightMargin - lineW, sigY + 5);

    doc.save(`relatorio-ponto-${filterFrom}-a-${filterTo}.pdf`);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ponto</h1>
        <p className="text-sm text-muted-foreground">Registre seu horário de trabalho. Ao encerrar, é obrigatório descrever o que foi feito no dia.</p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-acrux/10 to-transparent border-acrux/30">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-xl bg-acrux/20 flex items-center justify-center">
              <Clock className="size-7 text-acrux" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {open ? "Em andamento" : "Parado"}
              </div>
              <div className="text-3xl font-mono font-semibold">
                {open ? fmtHMS(liveSeconds) : "00:00:00"}
              </div>
              {open && (
                <div className="text-xs text-muted-foreground">
                  Iniciado às {fmtTime(open.clock_in)}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!open ? (
              <Button size="lg" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                <Play /> Iniciar ponto
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={openStopDialog}>
                <Square /> Encerrar ponto
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40" />
            </div>
            <Badge variant="secondary" className="h-9 px-3 text-sm">
              Total: <span className="font-mono ml-1">{fmtDuration(totalMin)}</span>
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={entries.length === 0}>
              <Download /> CSV
            </Button>
            <Button onClick={exportPDF} disabled={entries.length === 0}>
              <FileDown /> PDF (papel timbrado)
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="size-4" /> Relatório do período</h2>
        {byDate.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum registro neste período.</Card>
        )}
        {byDate.map(([date, list]) => {
          const dayTotal = list.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
          return (
            <Card key={date} className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-acrux" />
                  <span className="font-medium capitalize">{fmtDate(date)}</span>
                </div>
                <Badge variant="outline" className="font-mono">{fmtDuration(dayTotal)}</Badge>
              </div>
              <div className="space-y-3">
                {list.map((e) => {
                  const notes = draftNotes[e.id] ?? e.notes ?? "";
                  const dirty = notes !== (e.notes ?? "");
                  return (
                    <div key={e.id} className="grid md:grid-cols-[180px_1fr_auto] gap-3 items-start">
                      <div className="text-sm">
                        <div className="font-mono">
                          {fmtTime(e.clock_in)} → {e.clock_out ? fmtTime(e.clock_out) : "..."}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.duration_minutes ? fmtDuration(e.duration_minutes) : "em curso"}
                        </div>
                      </div>
                      <Textarea
                        placeholder="O que você fez neste período? (atividades, reuniões, entregas...)"
                        value={notes}
                        onChange={(ev) => setDraftNotes((p) => ({ ...p, [e.id]: ev.target.value }))}
                        rows={2}
                        className="resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          disabled={!dirty || saveNotesMut.isPending}
                          onClick={() => saveNotesMut.mutate({ id: e.id, notes })}
                        >
                          <Save className="size-3" /> Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Remover este registro?")) deleteMut.mutate(e.id);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={stopOpen} onOpenChange={(v) => { if (!stopMut.isPending) setStopOpen(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Encerrar ponto</DialogTitle>
            <DialogDescription>
              {open && (
                <>
                  Duração: <span className="font-mono">{fmtHMS(liveSeconds)}</span> · Início {fmtTime(open.clock_in)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Relatório do dia <span className="text-destructive">*</span></label>
            <Textarea
              autoFocus
              rows={6}
              placeholder="Descreva as atividades, reuniões e entregas realizadas neste período..."
              value={stopReport}
              onChange={(e) => setStopReport(e.target.value)}
            />
            <div className="text-xs text-muted-foreground">
              Mínimo {MIN_REPORT} caracteres. Atual: {stopReport.trim().length}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopOpen(false)} disabled={stopMut.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmStop}
              disabled={stopMut.isPending || stopReport.trim().length < MIN_REPORT}
            >
              <Square /> Confirmar encerramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
