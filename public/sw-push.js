/**
 * Handlers Web Push — bandeja del sistema aunque la app esté cerrada / pantalla apagada.
 * Estilo WhatsApp: notificación insistente + badge de pedidos nuevos.
 */
/* eslint-disable no-undef */

async function updateAppBadge(count) {
  try {
    if (typeof self.navigator?.setAppBadge === 'function') {
      const n = Number(count);
      if (n > 0) await self.navigator.setAppBadge(n);
      else if (typeof self.navigator.clearAppBadge === 'function') await self.navigator.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'El Pollón · Nuevo pedido',
    body: 'Tienes un nuevo pedido de delivery. Ábrelo ahora.',
    url: '/repartidor',
    tag: 'pollon-driver-offer',
    badgeCount: 1,
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
          badgeCount: payload.badgeCount || 1,
        });
      } catch {
        /* ignore */
      }
    }

    // Contar notificaciones visibles del mismo tipo para badge
    let badgeN = Number(payload.badgeCount) || 1;
    try {
      const existing = await self.registration.getNotifications({ tag: undefined });
      const offers = (existing || []).filter((n) => String(n.tag || '').startsWith('pollon-offer') || n.tag === 'pollon-driver-offer');
      badgeN = Math.max(badgeN, offers.length + 1);
    } catch {
      /* ignore */
    }
    await updateAppBadge(badgeN);

    await self.registration.showNotification(payload.title || 'El Pollón · Nuevo pedido', {
      body: payload.body || 'Tienes un nuevo pedido',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      image: undefined,
      vibrate: [280, 120, 280, 120, 400],
      tag: payload.tag || `pollon-offer-${payload.offerId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      actions: [
        { action: 'open', title: 'Ver pedido' },
        { action: 'dismiss', title: 'Cerrar' },
      ],
      data: {
        url: payload.url || '/repartidor',
        offerId: payload.offerId || null,
        jobId: payload.jobId || null,
        badgeCount: badgeN,
      },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  if (action === 'dismiss') {
    event.notification.close();
    return;
  }
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

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'DRIVER_CLEAR_BADGE') return;
  event.waitUntil(updateAppBadge(0));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // El cliente re-suscribe al abrir la app; aquí solo logueamos
  event.waitUntil(Promise.resolve());
});
