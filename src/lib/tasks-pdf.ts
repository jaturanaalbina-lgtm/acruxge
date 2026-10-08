import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { splitTasks, type ReportTask } from "@/lib/report-tasks";

export type TaskGroup = "done" | "doing" | "todo";

export function groupOf(status: string): TaskGroup {
  if (status === "done") return "done";
  if (status === "in_progress" || status === "review" || status === "approval") return "doing";
  return "todo";
}

export const GROUP_LABEL: Record<TaskGroup, string> = {
  done: "Feita",
  doing: "Fazendo",
  todo: "A fazer",
};

function fmtDay(d?: string | null) {
  if (!d) return "—";
  const iso = d.length > 10 ? d : d + "T00:00:00";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function isLate(t: ReportTask) {
  if (!t.due_date || t.status === "done") return false;
  return new Date(t.due_date + "T23:59:59").getTime() < Date.now();
}

/** Tarefas consideradas no período: concluídas no período + todas em aberto. */
export function periodTasks(tasks: ReportTask[], from: string, to: string) {
  const { done, openTasks } = splitTasks(tasks, from, to);
  return {
    done,
    doing: openTasks.filter((t) => groupOf(t.status) === "doing"),
    todo: openTasks.filter((t) => groupOf(t.status) === "todo"),
  };
}

const LM = 20;
const TOP = 40;
const tableStyle = {
  styles: { font: "times", fontSize: 9, cellPadding: 2, valign: "top", textColor: 20 } as any,
  headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" } as any,
  margin: { left: LM, right: 20, top: TOP, bottom: 30 },
};

function sections(doc: jsPDF, startY: number, g: ReturnType<typeof periodTasks>, names?: Record<string, string>) {
  let y = startY;
  const withMember = !!names;
  const list: [string, ReportTask[], string][] = [
    ["Tarefas concluídas", g.done, "Concluída em"],
    ["Tarefas em andamento", g.doing, "Prazo"],
    ["Tarefas não feitas", g.todo, "Prazo"],
  ];
  for (const [title, rows, dateCol] of list) {
    if (y > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); y = TOP; }
    doc.setFont("times", "bold"); doc.setFontSize(11);
    doc.text(`${title} (${rows.length})`, LM, y);
    y += 4;
    if (rows.length === 0) {
      doc.setFont("times", "italic"); doc.setFontSize(10);
      doc.text("Nenhuma.", LM, y + 4); y += 12; continue;
    }
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      head: [[...(withMember ? ["Membro"] : []), "Tarefa", "Área", dateCol]],
      body: rows.map((t) => [
        ...(withMember ? [names![t.user_id] ?? "—"] : []),
        t.title + (isLate(t) ? " (atrasada)" : ""),
        t.area_name,
        fmtDay(dateCol === "Prazo" ? t.due_date : t.updated_at),
      ]),
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  }
}

function header(doc: jsPDF, title: string, lines: string[]) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("times", "bold"); doc.setFontSize(14);
  doc.text(title, w / 2, TOP, { align: "center" });
  doc.setFont("times", "normal"); doc.setFontSize(11);
  lines.forEach((l, i) => doc.text(l, LM, TOP + 8 + i * 6));
  return TOP + 8 + lines.length * 6 + 2;
}

type Opts = { orgName: string; from: string; to: string; names: Record<string, string> };
const period = (o: Opts) => `Período: ${fmtDay(o.from)} a ${fmtDay(o.to)}`;

export function exportTeamTasksPDF(tasks: ReportTask[], memberIds: string[], o: Opts) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const g = periodTasks(tasks, o.from, o.to);
  let y = header(doc, "Relatório de Tarefas da Equipe", [
    `Equipe: ${o.orgName}`, period(o),
    `Concluídas: ${g.done.length} · Em andamento: ${g.doing.length} · Não feitas: ${g.todo.length}`,
  ]);
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [["Membro", "Total", "Concluídas", "Em andamento", "Não feitas", "Atrasadas"]],
    body: memberIds.map((uid) => {
      const mine = periodTasks(tasks.filter((t) => t.user_id === uid), o.from, o.to);
      const late = [...mine.doing, ...mine.todo].filter(isLate).length;
      return [o.names[uid] ?? "—", mine.done.length + mine.doing.length + mine.todo.length,
        mine.done.length, mine.doing.length, mine.todo.length, late];
    }),
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  sections(doc, y, g, o.names);
  doc.save(`tarefas-equipe-${o.from}-a-${o.to}.pdf`);
}

export function exportIndividualTasksPDF(tasks: ReportTask[], memberIds: string[], o: Opts) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  memberIds.forEach((uid, i) => {
    if (i > 0) doc.addPage();
    const g = periodTasks(tasks.filter((t) => t.user_id === uid), o.from, o.to);
    const y = header(doc, "Relatório Individual de Tarefas", [
      `Equipe: ${o.orgName}`, `Integrante: ${o.names[uid] ?? "—"}`, period(o),
      `Concluídas: ${g.done.length} · Em andamento: ${g.doing.length} · Não feitas: ${g.todo.length}`,
    ]);
    sections(doc, y, g);
  });
  const label = memberIds.length === 1
    ? (o.names[memberIds[0]] ?? "membro").replace(/\s+/g, "-").toLowerCase() : "individuais";
  doc.save(`tarefas-${label}-${o.from}-a-${o.to}.pdf`);
}
