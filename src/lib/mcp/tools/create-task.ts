import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveOrg, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Criar tarefa",
  description: "Cria uma nova tarefa no Kanban da equipe, dentro de uma área (e opcionalmente de um projeto).",
  inputSchema: {
    title: z.string().describe("Título da tarefa."),
    area_id: z.string().describe("ID da área (use list_areas para descobrir)."),
    team: z.string().optional().describe("ID ou slug da equipe. Padrão: primeira equipe do usuário."),
    description: z.string().optional().describe("Descrição detalhada."),
    project_id: z.string().optional().describe("ID do projeto."),
    status: z
      .enum(["backlog", "todo", "in_progress", "in_review", "waiting_approval", "done"])
      .optional()
      .describe("Coluna inicial (padrão: backlog)."),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Prioridade."),
    due_date: z.string().optional().describe("Prazo no formato AAAA-MM-DD."),
    labels: z.array(z.string()).optional().describe("Etiquetas."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const supabase = supabaseForUser(ctx);
    try {
      const org = await resolveOrg(supabase, input.team);
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          organization_id: org.id,
          area_id: input.area_id,
          project_id: input.project_id ?? null,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "backlog",
          priority: input.priority ?? "medium",
          due_date: input.due_date ?? null,
          labels: input.labels ?? null,
          created_by: ctx.getUserId(),
        })
        .select()
        .single();
      if (error) return errorResult(error.message);
      return textResult({ created: data });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
