import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ensureMyDriverProfile } from './driverService';
import { isNativeDriverApp } from './backgroundGpsService';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const NATIVE_NOTIF_FLAG = 'pollon_native_notif_ok';

export function isPushConfigured() {
  return hasWebPushSupport();
}

export function hasWebPushSupport() {
  return Boolean(
    VAPID_PUBLIC
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function getNotificationPermission() {
  if (typeof Notification === 'undefined') {
    if (isNativeDriverApp() && typeof localStorage !== 'undefined' && localStorage.getItem(NATIVE_NOTIF_FLAG) === '1') {
      return 'granted';
    }
    return isNativeDriverApp() ? 'prompt' : 'unsupported';
  }
  return Notification.permission;
}

export async function getGeolocationPermission() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  try {
    if (navigator.permissions?.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      return st.state;
    }
  } catch {
    /* ignore */
  }
  return 'prompt';
}

/** Prueba GPS con timeout; resuelve { ok, position?, error? } */
export function requestGpsFix(timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, error: 'Este celular no soporta GPS' });
      return;
    }
    const tid = setTimeout(() => {
      resolve({ ok: false, error: 'GPS sin señal. Activa la ubicación e inténtalo de nuevo.' });
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(tid);
        resolve({
          ok: true,
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
      },
      (err) => {
        clearTimeout(tid);
        const msg =
          err?.code === 1
            ? 'Debes permitir el acceso a la ubicación (GPS).'
            : err?.message || 'No se pudo obtener el GPS';
        resolve({ ok: false, error: msg });
      },
      { enableHighAccuracy: true, timeout: timeoutMs - 500, maximumAge: 5000 }
    );
  });
}

export async function getExistingPushSubscription() {
  if (!hasWebPushSupport()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) || null;
  } catch {
    return null;
  }
}

export async function setDriverAppBadge(count) {
  try {
    const n = Math.max(0, Number(count) || 0);
    if (navigator.setAppBadge) {
      if (n > 0) await navigator.setAppBadge(n);
      else if (navigator.clearAppBadge) await navigator.clearAppBadge();
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      reg?.active?.postMessage({ type: 'DRIVER_CLEAR_BADGE' });
      if (n > 0) {
        // SW setAppBadge se actualiza en el próximo push; aquí limpiamos si 0
      }
    }
  } catch {
    /* ignore */
  }
}

export async function clearDriverAppBadge() {
  await setDriverAppBadge(0);
  try {
    const reg = await navigator.serviceWorker.ready;
    reg?.active?.postMessage({ type: 'DRIVER_CLEAR_BADGE' });
  } catch {
    /* ignore */
  }
}

/**
 * Pide permiso + suscripción Web Push (obligatoria para bandeja tipo WhatsApp).
 */
export async function ensureDriverPushSubscription() {
  if (!isSupabaseConfigured() && !isNativeDriverApp()) {
    return { ok: true, demo: true };
  }

  if (!VAPID_PUBLIC) {
    throw new Error(
      'Falta configurar notificaciones push (VITE_VAPID_PUBLIC_KEY). Avisa al administrador para activarlas en Vercel.'
    );
  }

  if (typeof Notification === 'undefined') {
    if (isNativeDriverApp()) {
      try { localStorage.setItem(NATIVE_NOTIF_FLAG, '1'); } catch { /* ignore */ }
      return { ok: true, nativeLocal: true };
    }
    throw new Error('Este navegador no soporta notificaciones del sistema.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Debes permitir las notificaciones para recibir pedidos con la pantalla apagada.');
  }

  try { localStorage.setItem(NATIVE_NOTIF_FLAG, '1'); } catch { /* ignore */ }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error(
      'Instala la app El Pollón y ábrela desde el ícono para recibir notificaciones en la bandeja.'
    );
  }

  // Esperar SW activo (controller)
  let reg = null;
  for (let i = 0; i < 30; i += 1) {
    try {
      reg = await navigator.serviceWorker.ready;
      if (reg?.active) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!reg) {
    throw new Error('No se pudo activar el servicio de notificaciones. Cierra y vuelve a abrir la app.');
  }

  const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC);
  if (appServerKey.byteLength !== 65) {
    throw new Error('Clave de notificaciones inválida. Avisa al administrador.');
  }

  let sub = null;
  try {
    sub = await reg.pushManager.getSubscription();
  } catch {
    sub = null;
  }

  // Si hay sub vieja con otra clave, desuscribir; si no, reutilizar
  if (sub) {
    try {
      // Reusar si sigue válida; si falla al enviar luego se limpia en servidor
      // Tras rotar VAPID, Chrome exige unsubscribe
      let sameKey = true;
      try {
        const opts = sub.options?.applicationServerKey;
        if (opts) {
          const existing = new Uint8Array(opts);
          sameKey = existing.byteLength === appServerKey.byteLength
            && existing.every((b, i) => b === appServerKey[i]);
        } else {
          sameKey = false;
        }
      } catch {
        sameKey = false;
      }
      if (!sameKey) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    } catch {
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    } catch (err) {
      const raw = String(err?.message || err || '');
      const lower = raw.toLowerCase();
      if (lower.includes('push service error') || lower.includes('registration failed')) {
        throw new Error(
          'Chrome/Google no pudo registrar el push (Push service error). '
          + 'Haz esto: 1) Abre El Pollón desde el ÍCONO instalado (no el navegador). '
          + '2) Ajustes del celular → Apps → El Pollón (o Chrome) → Notificaciones → Permitir. '
          + '3) En la app: menú del candado/sitio → Borrar datos del sitio / restablecer permisos, vuelve a abrir y reintenta. '
          + '4) Revisa que el celular tenga Google Play Services y conexión a internet. '
          + 'Si usas Huawei sin GMS o Brave con Google bloqueado, el push no funciona.'
        );
      }
      if (lower.includes('different application server key') || lower.includes('gcm_sender')) {
        try {
          const old = await reg.pushManager.getSubscription();
          await old?.unsubscribe();
        } catch {
          /* ignore */
        }
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
          });
        } catch (err2) {
          throw new Error(
            `No se pudo reactivar push. Borra los datos del sitio el-pollon.cl y vuelve a intentar. (${err2?.message || err2})`
          );
        }
      } else if (lower.includes('notallowed') || lower.includes('denied') || lower.includes('permission')) {
        throw new Error('Debes permitir las notificaciones en Ajustes del celular.');
      } else {
        throw new Error(raw || 'No se pudo activar la suscripción push.');
      }
    }
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('No se pudo crear la suscripción push.');
  }

  if (isSupabaseConfigured()) {
    const driver = await ensureMyDriverProfile();
    const sb = getSupabase();
    const { error } = await sb.from('ep_driver_push_subscriptions').upsert(
      {
        driver_id: driver.id,
        endpoint,
        p256dh,
        auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw new Error(error.message || 'No se pudo guardar la suscripción push');
  }

  return { ok: true, endpoint };
}

export async function checkDriverReadyPermissions() {
  const notif = getNotificationPermission();
  const geo = await getGeolocationPermission();
  const webPush = hasWebPushSupport();
  let hasSub = false;
  if (webPush && notif === 'granted') {
    hasSub = Boolean(await getExistingPushSubscription());
  }

  const nativeOk = isNativeDriverApp() && (
    notif === 'granted'
    || (typeof localStorage !== 'undefined' && localStorage.getItem(NATIVE_NOTIF_FLAG) === '1')
  );

  return {
    notificationsGranted: notif === 'granted' || nativeOk,
    notificationsState: notif,
    geoState: geo,
    geoGranted: geo === 'granted',
    pushConfigured: webPush,
    hasPushSubscription: hasSub || (isNativeDriverApp() && nativeOk && !webPush),
    readyForOnline: (notif === 'granted' || nativeOk) && (geo === 'granted' || geo === 'prompt' || isNativeDriverApp()),
  };
}

/** Avisa al backend que envíe push a repartidores ofertados de un job */
export async function notifyDriversForJob(jobId) {
  if (!jobId || !isSupabaseConfigured()) return { skipped: true };
  try {
    const sb = getSupabase();
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { skipped: true, reason: 'no-session' };

    const res = await fetch('/api/notify-driver-offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jobId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Pollón] notify-driver-offers:', res.status, text);
      return { ok: false, status: res.status, body: text };
    }
    return await res.json().catch(() => ({ ok: true }));
  } catch (err) {
    console.warn('[Pollón] notify-driver-offers:', err?.message || err);
    return { ok: false, error: err?.message };
  }
}
