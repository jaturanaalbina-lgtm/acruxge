import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveOrg, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "Listar tarefas do Kanban",
  description:
    "Lista tarefas do Kanban da equipe, com filtros opcionais por área, projeto, status e busca por título.",
  inputSchema: {
    team: z.string().optional().describe("ID ou slug da equipe. Padrão: primeira equipe do usuário."),
    area_id: z.string().optional().describe("Filtra por ID da área."),
    project_id: z.string().optional().describe("Filtra por ID do projeto."),
    status: z
      .enum(["backlog", "todo", "in_progress", "in_review", "waiting_approval", "done"])
      .optional()
      .describe("Filtra por coluna do Kanban."),
    search: z.string().optional().describe("Busca por trecho do título."),
    limit: z.number().int().optional().describe("Máximo de tarefas retornadas (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ team, area_id, project_id, status, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const supabase = supabaseForUser(ctx);
    try {
      const org = await resolveOrg(supabase, team);
      let query = supabase
        .from("tasks")
        .select("id,title,description,status,priority,due_date,labels,progress,area_id,project_id,updated_at")
        .eq("organization_id", org.id)
        .order("updated_at", { ascending: false })
        .limit(Math.min(Math.max(limit ?? 50, 1), 200));
      if (area_id) query = query.eq("area_id", area_id);
      if (project_id) query = query.eq("project_id", project_id);
      if (status) query = query.eq("status", status);
      if (search) query = query.ilike("title", `%${search}%`);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ team: org.name, count: data?.length ?? 0, tasks: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
