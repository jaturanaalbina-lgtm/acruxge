import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; slug?: string; brand_name?: string }) => {
    const name = String(data?.name ?? "").trim();
    if (name.length < 2) throw new Error("Nome muito curto");
    return {
      name,
      slug: slugify(data.slug || data.name),
      brand_name: data.brand_name?.trim() || name,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure slug uniqueness by appending suffix if taken
    let candidate = data.slug || "equipe";
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(candidate)) candidate = "equipe";
    for (let i = 0; i < 10; i++) {
      const trial = i === 0 ? candidate : `${candidate}-${i + 1}`;
      const { data: existing } = await supabaseAdmin
        .from("organizations").select("id").eq("slug", trial).maybeSingle();
      if (!existing) { candidate = trial; break; }
    }

    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name,
        slug: candidate,
        brand_name: data.brand_name,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return org;
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    organization_id: string;
    name?: string;
    brand_name?: string | null;
    logo_url?: string | null;
    member_limit?: number;
  }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", {
      _user: context.userId, _org: data.organization_id,
    });
    if (!isAdmin) throw new Error("Apenas admins da equipe podem alterar.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.brand_name !== undefined) patch.brand_name = data.brand_name;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    if (data.member_limit !== undefined) patch.member_limit = data.member_limit;
    const { error } = await supabaseAdmin
      .from("organizations").update(patch).eq("id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

export const setOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    organization_id: string; user_id: string; role: "owner" | "admin" | "member";
  }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", {
      _user: context.userId, _org: data.organization_id,
    });
    if (!isAdmin) throw new Error("Apenas admins podem alterar papéis.");
    if (data.user_id === context.userId && data.role === "member") {
      throw new Error("Você não pode rebaixar a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ role: data.role })
      .eq("organization_id", data.organization_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const removeOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organization_id: string; user_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_org_admin", {
      _user: context.userId, _org: data.organization_id,
    });
    if (!isAdmin) throw new Error("Apenas admins podem remover membros.");
    if (data.user_id === context.userId) {
      throw new Error("Use 'Sair da equipe' para remover a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove das áreas dessa org
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

export const leaveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organization_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Se for o único owner, impede
    const { data: owners } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id)
      .eq("role", "owner");
    if (owners?.length === 1 && owners[0].user_id === context.userId) {
      throw new Error("Você é o único dono. Promova outro admin a dono antes de sair.");
    }
    const { error } = await supabaseAdmin
      .from("organization_members")
      .delete()
      .eq("organization_id", data.organization_id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
