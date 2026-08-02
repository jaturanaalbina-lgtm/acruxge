import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveOrg, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_areas",
  title: "Listar áreas e projetos",
  description:
    "Lista as áreas (Social, Engenharia, Programação, etc.) e os projetos da equipe. Use para descobrir os IDs necessários para criar tarefas.",
  inputSchema: {
    team: z.string().optional().describe("ID ou slug da equipe. Padrão: primeira equipe do usuário."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ team }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const supabase = supabaseForUser(ctx);
    try {
      const org = await resolveOrg(supabase, team);
      const [areas, projects] = await Promise.all([
        supabase
          .from("areas")
          .select("id,name,slug,parent_id,sort_order")
          .eq("organization_id", org.id)
          .order("sort_order"),
        supabase
          .from("projects")
          .select("id,name,area_id,priority,due_date")
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false }),
      ]);
      if (areas.error) return errorResult(areas.error.message);
      if (projects.error) return errorResult(projects.error.message);
      return textResult({ team: org, areas: areas.data ?? [], projects: projects.data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
