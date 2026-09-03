export const PONTO_NOTIFICATION_TAG = "ponto-em-andamento";

export function fmtHMS(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const base = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return d > 0 ? `${d}d ${base}` : base;
}

async function getWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/ponto-notification-sw.js");
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/** Notificação fixa: só some quando o ponto é encerrado. */
export async function showPontoNotification(seconds: number) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const registration = await getWorker();
  if (!registration) return;
  await registration.showNotification("Ponto em andamento", {
    body: `Tempo trabalhado: ${fmtHMS(seconds)}`,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: PONTO_NOTIFICATION_TAG,
    requireInteraction: true,
    silent: true,
    data: { url: "/ponto" },
    actions: [{ action: "stop", title: "Encerrar ponto" }],
  } as NotificationOptions & { actions?: { action: string; title: string }[] });
}

export async function clearPontoNotification() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const list = await registration.getNotifications({ tag: PONTO_NOTIFICATION_TAG });
    list.forEach((n) => n.close());
  } catch {
    /* noop */
  }
}

/** Lembretes de eventos e prazos do calendário. */
export async function showReminderNotification(id: string, title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const registration = await getWorker();
  if (!registration) return;
  await registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: `calendario-${id}`,
    data: { url: "/calendario" },
  });
}
