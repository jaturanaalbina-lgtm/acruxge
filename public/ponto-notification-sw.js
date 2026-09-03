self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  const isStop = event.action === "stop";
  const target = isStop ? "/ponto?stop=1" : event.notification.data?.url || "/ponto";

  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => new URL(client.url).pathname.startsWith("/ponto"));

      if (existing) {
        if (isStop && "navigate" in existing) existing.navigate(target);
        return existing.focus();
      }

      return clients.openWindow(target);
    }),
  );
});
