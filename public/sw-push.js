/**
 * Handlers Web Push — bandeja del sistema aunque la app esté cerrada / pantalla apagada.
 * Estilo WhatsApp: notificación insistente + badge de pedidos nuevos.
 * La PWA solo avisa; aceptar es en la app nativa.
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
    body: 'Tienes un nuevo pedido de delivery. Ábrelo en la app nativa para aceptar.',
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

    let badgeN = Number(payload.badgeCount) || 1;
    try {
      const existing = await self.registration.getNotifications({ tag: undefined });
      const offers = (existing || []).filter((n) => String(n.tag || '').startsWith('pollon-offer') || n.tag === 'pollon-driver-offer');
      badgeN = Math.max(badgeN, offers.length + 1);
    } catch {
      /* ignore */
    }
    await updateAppBadge(badgeN);

    const detailBits = [
      payload.body,
      payload.address || payload.customerAddress || null,
    ].filter(Boolean);
    const bodyText = detailBits.length
      ? detailBits.join('\n')
      : 'Nuevo pedido · Ábrelo en la app nativa para aceptar';

    await self.registration.showNotification(payload.title || 'El Pollón · Nuevo pedido', {
      body: bodyText,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [280, 120, 280, 120, 400],
      tag: payload.tag || `pollon-offer-${payload.offerId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      actions: [
        { action: 'open', title: 'Ver aviso' },
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
  event.waitUntil(Promise.resolve());
});
