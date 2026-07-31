import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ensureMyDriverProfile } from './driverService';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export function isPushConfigured() {
  return Boolean(VAPID_PUBLIC && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window);
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
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function getGeolocationPermission() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  try {
    if (navigator.permissions?.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      return st.state; // granted | prompt | denied
    }
  } catch {
    /* Safari / algunos Android no soportan permissions.query geolocation */
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
  if (!isPushConfigured()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) || null;
  } catch {
    return null;
  }
}

/**
 * Pide permiso de notificaciones, crea suscripción Web Push y la guarda en Supabase.
 */
export async function ensureDriverPushSubscription() {
  if (!isPushConfigured()) {
    throw new Error('Push no configurado. Falta VITE_VAPID_PUBLIC_KEY en el deploy.');
  }
  if (!isSupabaseConfigured()) {
    return { ok: true, demo: true };
  }

  if (typeof Notification === 'undefined') {
    throw new Error('Este navegador no soporta notificaciones del sistema.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Debes permitir las notificaciones para recibir nuevos pedidos.');
  }

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
    throw new Error('No se pudo crear la suscripción push.');
  }

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

  return { ok: true, endpoint };
}

export async function checkDriverReadyPermissions() {
  const notif = getNotificationPermission();
  const geo = await getGeolocationPermission();
  const pushOk = isPushConfigured();
  let hasSub = false;
  if (pushOk && notif === 'granted') {
    hasSub = Boolean(await getExistingPushSubscription());
  }

  return {
    notificationsGranted: notif === 'granted',
    notificationsState: notif,
    geoState: geo,
    geoGranted: geo === 'granted',
    pushConfigured: pushOk,
    hasPushSubscription: hasSub,
    readyForOnline: notif === 'granted' && (geo === 'granted' || geo === 'prompt'),
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
