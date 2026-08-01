import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ensureMyDriverProfile } from './driverService';
import { isNativeDriverApp } from './backgroundGpsService';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const NATIVE_NOTIF_FLAG = 'pollon_native_notif_ok';

export function isPushConfigured() {
  if (typeof window === 'undefined') return false;
  // App APK: se puede trabajar sin VAPID (pedidos por polling + alarma en app)
  if (isNativeDriverApp()) return true;
  return Boolean(VAPID_PUBLIC && 'serviceWorker' in navigator && 'PushManager' in window);
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

/**
 * Pide permiso de notificaciones.
 * En APK: si no hay Web Push / VAPID, igual marca listo (pedidos llegan en la app).
 * En web: requiere VAPID + suscripción.
 */
export async function ensureDriverPushSubscription() {
  if (!isSupabaseConfigured() && !isNativeDriverApp()) {
    return { ok: true, demo: true };
  }

  // 1) Permiso de notificaciones del sistema (si existe)
  if (typeof Notification !== 'undefined') {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      throw new Error('Debes permitir las notificaciones para recibir nuevos pedidos.');
    }
  } else if (isNativeDriverApp()) {
    // WebView sin Notification API: marcar OK localmente
    try { localStorage.setItem(NATIVE_NOTIF_FLAG, '1'); } catch { /* ignore */ }
    return { ok: true, nativeLocal: true };
  } else {
    throw new Error('Este navegador no soporta notificaciones del sistema.');
  }

  try { localStorage.setItem(NATIVE_NOTIF_FLAG, '1'); } catch { /* ignore */ }

  // 2) Web Push (solo si hay clave VAPID + PushManager)
  if (!hasWebPushSupport()) {
    return { ok: true, localOnly: true };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      if (isNativeDriverApp()) return { ok: true, localOnly: true };
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
  } catch (err) {
    if (isNativeDriverApp()) {
      return { ok: true, localOnly: true, warn: err?.message };
    }
    throw err;
  }
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
    pushConfigured: isPushConfigured(),
    hasPushSubscription: hasSub || (isNativeDriverApp() && (notif === 'granted' || nativeOk)),
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
      return { ok: false, status: res.status };
    }
    return await res.json().catch(() => ({ ok: true }));
  } catch (err) {
    console.warn('[Pollón] notify-driver-offers:', err?.message || err);
    return { ok: false, error: err?.message };
  }
}
