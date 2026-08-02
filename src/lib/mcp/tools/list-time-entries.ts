import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveOrg, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_time_entries",
  title: "Listar registros de ponto",
  description: "Lista os registros de ponto da equipe visíveis ao usuário, com filtro por período.",
  inputSchema: {
    team: z.string().optional().describe("ID ou slug da equipe. Padrão: primeira equipe do usuário."),
    from: z.string().optional().describe("Data inicial AAAA-MM-DD."),
    to: z.string().optional().describe("Data final AAAA-MM-DD."),
    limit: z.number().int().optional().describe("Máximo de registros (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ team, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const supabase = supabaseForUser(ctx);
    try {
      const org = await resolveOrg(supabase, team);
      let query = supabase
        .from("time_entries")
        .select("id,user_id,work_date,clock_in,clock_out,duration_minutes,notes,area_id")
        .eq("organization_id", org.id)
        .order("work_date", { ascending: false })
        .limit(Math.min(Math.max(limit ?? 50, 1), 200));
      if (from) query = query.gte("work_date", from);
      if (to) query = query.lte("work_date", to);
      const { data, error } = await query;
      if (error) return errorResult(error.message);
      return textResult({ team: org.name, count: data?.length ?? 0, entries: data ?? [] });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
