import { supabase } from "@/integrations/supabase/client";
import { ensureNotificationPermission, showReminderNotification } from "@/lib/ponto-notification";

export type AppNotification = {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications(orgId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markRead(id: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllRead(orgId: string) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .is("read_at", null);
}

/** Cria um aviso na caixa de entrada de uma pessoa (sem duplicar o mesmo lembrete). */
export async function pushNotification(n: {
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entity_id?: string | null;
}) {
  const { error } = await supabase.from("notifications").insert({
    organization_id: n.organization_id,
    user_id: n.user_id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    entity_id: n.entity_id ?? null,
  });
  if (error) throw error;
}

const seen = (key: string) => {
  try {
    if (localStorage.getItem(key)) return true;
    localStorage.setItem(key, "1");
    return false;
  } catch {
    return false;
  }
};

/** Dispara a notificação do navegador uma única vez por aviso. */
export async function notifyBrowserOnce(n: AppNotification) {
  if (seen(`notif-shown:${n.id}`)) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  await showReminderNotification(n.id, n.title, n.body ?? "");
}

export type ReminderItem = {
  key: string;
  type: string;
  title: string;
  body: string;
  link: string;
  entity_id: string | null;
};

/** Cria os avisos de lembrete que ainda não foram criados neste dispositivo. */
export async function pushReminders(orgId: string, userId: string, items: ReminderItem[]) {
  for (const i of items) {
    if (seen(`reminder-sent:${i.key}`)) continue;
    try {
      await pushNotification({
        organization_id: orgId,
        user_id: userId,
        type: i.type,
        title: i.title,
        body: i.body,
        link: i.link,
        entity_id: i.entity_id,
      });
    } catch {
      /* ignora falhas de lembrete */
    }
  }
}
