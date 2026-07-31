/**
 * Handlers Web Push para el Service Worker (importScripts desde Workbox).
 * Muestra notificación en la bandeja del sistema aunque la app esté cerrada.
 * Si la PWA está abierta, avisa a la página para sonar la alarma in-app.
 */
/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Nuevo pedido — El Pollón',
    body: 'Tienes un nuevo pedido de delivery',
    url: '/repartidor',
    tag: 'pollon-driver-offer',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    try {
      const text = event.data?.text?.();
      if (text) payload.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try {
        client.postMessage({
          type: 'DRIVER_NEW_OFFER',
          offerId: payload.offerId || null,
          jobId: payload.jobId || null,
          title: payload.title,
          body: payload.body,
        });
      } catch {
        /* ignore */
      }
    }

    await self.registration.showNotification(payload.title || 'El Pollón', {
      body: payload.body || 'Nuevo pedido',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 400],
      tag: payload.tag || 'pollon-driver-offer',
      renotify: true,
      requireInteraction: true,
      data: {
        url: payload.url || '/repartidor',
        offerId: payload.offerId || null,
        jobId: payload.jobId || null,
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/repartidor';
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          try {
            client.postMessage({ type: 'DRIVER_NEW_OFFER', fromClick: true });
          } catch {
            /* ignore */
          }
          if ('navigate' in client) {
            try {
              await client.navigate(absolute);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(absolute);
      }
    })()
  );
});
