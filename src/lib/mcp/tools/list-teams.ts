import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, resolveOrg, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_teams",
  title: "Listar equipes",
  description: "Lista as equipes (organizações) das quais o usuário autenticado faz parte, com seu cargo.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Não autenticado");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("my_organizations");
    if (error) return errorResult(error.message);
    return textResult(data ?? []);
  },
});

export const _resolveOrg = resolveOrg;
export const _z = z;
