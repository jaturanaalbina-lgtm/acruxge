import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "update_task",
  title: "Atualizar tarefa",
  description:
    "Atualiza uma tarefa existente do Kanban: status (mover de coluna), título, descrição, prioridade, prazo, progresso ou etiquetas.",
  inputSchema: {
    task_id: z.string().describe("ID da tarefa."),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z
      .enum(["backlog", "todo", "in_progress", "in_review", "waiting_approval", "done"])
      .optional()
      .describe("Nova coluna do Kanban."),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    due_date: z.string().optional().describe("Prazo no formato AAAA-MM-DD."),
    progress: z.number().int().optional().describe("Progresso de 0 a 100."),
    labels: z.array(z.string()).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, ...fields }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) return errorResult("Informe ao menos um campo para atualizar.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("tasks").update(patch).eq("id", task_id).select().maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Tarefa não encontrada ou sem permissão.");
    return textResult({ updated: data });
  },
});
