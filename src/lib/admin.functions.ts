import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string }) => {
    if (!data?.email || typeof data.email !== "string") throw new Error("Email obrigatório");
    return { email: data.email.trim().toLowerCase() };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const callerEmail = String((claims as { email?: string }).email ?? "").toLowerCase();

    if (callerEmail !== data.email) {
      throw new Error("O email informado precisa ser o mesmo da conta autenticada.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if any admin already exists
    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) throw countErr;

    if ((count ?? 0) > 0) {
      // Only existing admins can promote
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) {
        throw new Error("Já existe um administrador. Peça a ele para te promover.");
      }
    }

    // Promote: insert admin role (ignore conflict)
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleErr) throw roleErr;

    // Attach as leader to every top-level area
    const { data: areas, error: areasErr } = await supabaseAdmin
      .from("areas")
      .select("id")
      .is("parent_id", null);
    if (areasErr) throw areasErr;

    if (areas?.length) {
      const rows = areas.map((a) => ({
        area_id: a.id,
        user_id: userId,
        is_leader: true,
      }));
      const { error: memErr } = await supabaseAdmin
        .from("area_members")
        .upsert(rows, { onConflict: "area_id,user_id" });
      if (memErr) throw memErr;
    }

    return { ok: true, areas: areas?.length ?? 0 };
  });

async function assertCallerAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem executar essa ação.");
}

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; is_admin: boolean }) => {
    if (!data?.user_id) throw new Error("user_id obrigatório");
    return { user_id: String(data.user_id), is_admin: Boolean(data.is_admin) };
  })
  .handler(async ({ data, context }) => {
    await assertCallerAdmin(context);
    if (data.user_id === context.userId && !data.is_admin) {
      throw new Error("Você não pode remover o próprio papel de admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.is_admin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
      if (error) throw error;
    }
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => {
    if (!data?.user_id) throw new Error("user_id obrigatório");
    return { user_id: String(data.user_id) };
  })
  .handler(async ({ data, context }) => {
    await assertCallerAdmin(context);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode remover a própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("area_members").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw error;
    return { ok: true };
  });
