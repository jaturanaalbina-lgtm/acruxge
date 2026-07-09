import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Retro-compat: mantido para não quebrar imports antigos.
// Agora todas as operações escopam por organization.

async function assertOrgAdmin(
  context: { supabase: any; userId: string },
  organization_id: string,
) {
  const { data: ok } = await context.supabase.rpc("is_org_admin", {
    _user: context.userId,
    _org: organization_id,
  });
  if (!ok) throw new Error("Apenas admins da equipe podem executar essa ação.");
}

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organization_id: string; user_id: string; is_admin: boolean }) => {
    if (!data?.organization_id) throw new Error("organization_id obrigatório");
    if (!data?.user_id) throw new Error("user_id obrigatório");
    return {
      organization_id: String(data.organization_id),
      user_id: String(data.user_id),
      is_admin: Boolean(data.is_admin),
    };
  })
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context, data.organization_id);
    if (data.user_id === context.userId && !data.is_admin) {
      throw new Error("Você não pode remover o próprio papel de admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ role: data.is_admin ? "admin" : "member" })
      .eq("organization_id", data.organization_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organization_id: string; user_id: string }) => {
    if (!data?.organization_id) throw new Error("organization_id obrigatório");
    if (!data?.user_id) throw new Error("user_id obrigatório");
    return {
      organization_id: String(data.organization_id),
      user_id: String(data.user_id),
    };
  })
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context, data.organization_id);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode remover a própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: areas } = await supabaseAdmin
      .from("areas").select("id").eq("organization_id", data.organization_id);
    if (areas?.length) {
      await supabaseAdmin
        .from("area_members")
        .delete()
        .eq("user_id", data.user_id)
        .in("area_id", areas.map((a) => a.id));
    }
    const { error } = await supabaseAdmin
      .from("organization_members")
      .delete()
      .eq("organization_id", data.organization_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });
