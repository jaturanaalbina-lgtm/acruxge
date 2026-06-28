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
