self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find(
        (client) => new URL(client.url).pathname === "/ponto",
      );

      if (existing) return existing.focus();

      return clients.openWindow(event.notification.data?.url || "/ponto");
    }),
  );
});
