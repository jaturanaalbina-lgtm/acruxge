import { supabase } from "@/integrations/supabase/client";
import autoTable from "jspdf-autotable";
import type jsPDF from "jspdf";

export type ReportTask = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  updated_at: string;
  area_name: string;
  user_id: string;
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "A fazer",
  todo: "A fazer",
  in_progress: "Fazendo",
  review: "Fazendo",
  approval: "Fazendo",
  done: "Feito",
};

export function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function fmtDay(d?: string | null) {
  if (!d) return "—";
  const iso = d.length > 10 ? d : d + "T00:00:00";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Busca tarefas atribuídas (responsável principal ou co-responsável) a um
 * conjunto de pessoas dentro de uma equipe.
 */
export async function fetchAssignedTasks(
  orgId: string,
  userIds: string[],
): Promise<ReportTask[]> {
  if (!orgId || userIds.length === 0) return [];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,status,due_date,updated_at,assignee_id,area_id")
    .eq("organization_id", orgId);
  if (!tasks || tasks.length === 0) return [];

  const ids = tasks.map((t) => t.id);
  const { data: extra } = await supabase
    .from("task_assignees")
    .select("task_id,user_id")
    .in("task_id", ids);

  const { data: areas } = await supabase
    .from("areas")
    .select("id,name")
    .eq("organization_id", orgId);
  const areaName: Record<string, string> = {};
  for (const a of areas ?? []) areaName[a.id] = a.name;

  const wanted = new Set(userIds);
  const out: ReportTask[] = [];
  const seen = new Set<string>();

  const push = (task: any, userId: string) => {
    const key = `${task.id}:${userId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: task.id,
      title: task.title,
      status: task.status,
      due_date: task.due_date,
      updated_at: task.updated_at,
      area_name: areaName[task.area_id] ?? "—",
      user_id: userId,
    });
  };

  for (const t of tasks) {
    if (t.assignee_id && wanted.has(t.assignee_id)) push(t, t.assignee_id);
  }
  for (const link of extra ?? []) {
    if (!wanted.has(link.user_id)) continue;
    const t = tasks.find((x) => x.id === link.task_id);
    if (t) push(t, link.user_id);
  }
  return out;
}

export function splitTasks(tasks: ReportTask[], from: string, to: string) {
  const start = new Date(from + "T00:00:00").getTime();
  const end = new Date(to + "T23:59:59").getTime();
  const done = tasks.filter((t) => {
    if (t.status !== "done") return false;
    const ts = new Date(t.updated_at).getTime();
    return ts >= start && ts <= end;
  });
  const openTasks = tasks.filter((t) => t.status !== "done");
  return { done, openTasks };
}

/** Desenha as seções de tarefas no PDF e devolve a posição Y final. */
export function drawTaskSections(
  doc: jsPDF,
  opts: {
    startY: number;
    leftMargin: number;
    rightMargin: number;
    done: ReportTask[];
    openTasks: ReportTask[];
    names?: Record<string, string>;
    withMemberColumn?: boolean;
  },
) {
  const { startY, leftMargin, rightMargin, done, openTasks, names, withMemberColumn } = opts;
  let y = startY;

  const section = (
    title: string,
    head: string[],
    body: (string | number)[][],
    empty: string,
  ) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 40;
    }
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.text(title, leftMargin, y);
    y += 4;
    if (body.length === 0) {
      doc.setFont("times", "italic");
      doc.setFontSize(10);
      doc.text(empty, leftMargin, y + 4);
      y += 12;
      return;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: leftMargin, right: rightMargin, top: 40, bottom: 30 },
      head: [head],
      body,
      styles: { font: "times", fontSize: 9, cellPadding: 2, valign: "top", textColor: 20 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  };

  const memberCol = (t: ReportTask) => names?.[t.user_id] ?? "—";

  section(
    "Tarefas concluídas no período",
    withMemberColumn ? ["Membro", "Tarefa", "Área", "Concluída em"] : ["Tarefa", "Área", "Concluída em"],
    done.map((t) =>
      withMemberColumn
        ? [memberCol(t), t.title, t.area_name, fmtDay(t.updated_at)]
        : [t.title, t.area_name, fmtDay(t.updated_at)],
    ),
    "Nenhuma tarefa concluída no período.",
  );

  section(
    "Tarefas atribuídas em aberto",
    withMemberColumn ? ["Membro", "Tarefa", "Área", "Situação", "Prazo"] : ["Tarefa", "Área", "Situação", "Prazo"],
    openTasks.map((t) =>
      withMemberColumn
        ? [memberCol(t), t.title, t.area_name, statusLabel(t.status), fmtDay(t.due_date)]
        : [t.title, t.area_name, statusLabel(t.status), fmtDay(t.due_date)],
    ),
    "Nenhuma tarefa em aberto.",
  );

  return y;
}
