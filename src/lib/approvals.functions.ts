import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

async function sendWhatsApp(to: string, body: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  const FROM = process.env.TWILIO_WHATSAPP_FROM;
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !FROM) {
    console.warn("WhatsApp not configured", { hasKey: !!LOVABLE_API_KEY, hasTwilio: !!TWILIO_API_KEY, hasFrom: !!FROM });
    return { ok: false, reason: "not_configured" as const };
  }
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${FROM}`,
      Body: body,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Twilio error", res.status, text);
    return { ok: false, reason: "twilio_error" as const, status: res.status };
  }
  return { ok: true as const };
}

export const notifyAdminOfSignup = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; fullName: string }) => d)
  .handler(async ({ data }) => {
    const admin = process.env.ADMIN_WHATSAPP_NUMBER;
    if (!admin) return { ok: false, reason: "no_admin_number" };
    const msg = `🤖 Acrux ROBOCEP\nNova solicitação de cadastro:\n• ${data.fullName}\n• ${data.email}\nAcesse o painel admin para aprovar ou rejeitar.`;
    return await sendWhatsApp(admin, msg);
  });

export const reviewSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; approve: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("profiles")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
