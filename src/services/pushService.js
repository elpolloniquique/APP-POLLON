import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ensureMyDriverProfile } from './driverService';
import { isNativeDriverApp } from './backgroundGpsService';

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
const NATIVE_NOTIF_FLAG = 'pollon_native_notif_ok';
const PUSH_OK_FLAG = 'pollon_push_subscribed_ok';
const PUSH_DEFERRED_FLAG = 'pollon_push_deferred_ok';
const PUSH_RELOAD_FLAG = 'pollon_push_reload_once';

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

/** Chrome a veces falla si el buffer tiene byteOffset != 0 */
function toApplicationServerKey(base64String) {
  const u8 = urlBase64ToUint8Array(base64String);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
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

async function ensureServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    /* puede ya estar registrado */
  }

  let reg = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      reg = await navigator.serviceWorker.ready;
      if (reg?.active) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  for (let i = 0; i < 20; i += 1) {
    if (navigator.serviceWorker.controller) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  return reg;
}

async function hardResetServiceWorkers() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try {
        const sub = await reg.pushManager?.getSubscription?.();
        if (sub) await sub.unsubscribe().catch(() => {});
      } catch {
        /* ignore */
      }
      await reg.unregister().catch(() => false);
    }
  } catch {
    /* ignore */
  }
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
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
    if (n <= 0 && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      reg?.active?.postMessage({ type: 'DRIVER_CLEAR_BADGE' });
    }
  } catch {
    /* ignore */
  }
}

export async function clearDriverAppBadge() {
  await setDriverAppBadge(0);
}

async function saveSubscriptionToSupabase(sub) {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('No se pudo crear la suscripción push.');
  }
  if (!isSupabaseConfigured()) return { endpoint };
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
  return { endpoint };
}

function keysMatch(existingKey, wantedKey) {
  try {
    const existing = new Uint8Array(existingKey);
    const wanted = new Uint8Array(wantedKey);
    return existing.byteLength === wanted.byteLength
      && existing.every((b, i) => b === wanted[i]);
  } catch {
    return false;
  }
}

async function subscribeWithKey(reg, appServerKey) {
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const opts = sub.options?.applicationServerKey;
    if (opts && !keysMatch(opts, appServerKey)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  if (!sub) {
    // 1) ArrayBuffer (recomendado Chrome reciente)
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    } catch (err) {
      // 2) Uint8Array fallback (algunos WebViews)
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('push service') || msg.includes('registration failed') || msg.includes('applicationServerKey')) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: new Uint8Array(appServerKey),
        });
      } else {
        throw err;
      }
    }
  }
  return sub;
}

function markDeferred() {
  try { localStorage.setItem(PUSH_DEFERRED_FLAG, '1'); } catch { /* ignore */ }
}

function markPushOk() {
  try {
    localStorage.setItem(PUSH_OK_FLAG, '1');
    localStorage.removeItem(PUSH_DEFERRED_FLAG);
    sessionStorage.removeItem(PUSH_RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

function isPushInfraError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return m.includes('push service')
    || m.includes('registration failed')
    || m.includes('abort')
    || m.includes('pushmanager')
    || m.includes('service worker no activo');
}

/**
 * Pide permiso + intenta Web Push (bandeja tipo WhatsApp).
 * Si Google/FCM falla: resetea SW, recarga UNA vez, y si sigue fallando
 * NO bloquea el onboarding (deferred) — reintenta al conectarse.
 */
export async function ensureDriverPushSubscription() {
  if (!isSupabaseConfigured() && !isNativeDriverApp()) {
    return { ok: true, demo: true };
  }

  if (!VAPID_PUBLIC) {
    throw new Error(
      'Falta configurar notificaciones push (VITE_VAPID_PUBLIC_KEY). Avisa al administrador.'
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

  try {
    localStorage.setItem(NATIVE_NOTIF_FLAG, '1');
  } catch {
    /* ignore */
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    markDeferred();
    return {
      ok: true,
      deferred: true,
      warn: 'Este navegador no soporta push en bandeja. Usa Chrome e instala la app El Pollón.',
    };
  }

  const appServerKey = toApplicationServerKey(VAPID_PUBLIC);
  if (new Uint8Array(appServerKey).byteLength !== 65) {
    throw new Error('Clave de notificaciones inválida. Avisa al administrador.');
  }

  const tryOnce = async () => {
    const reg = await ensureServiceWorkerRegistration();
    if (!reg?.active) throw new Error('Service Worker no activo');
    const sub = await subscribeWithKey(reg, appServerKey);
    const saved = await saveSubscriptionToSupabase(sub);
    markPushOk();
    return { ok: true, endpoint: saved.endpoint };
  };

  try {
    return await tryOnce();
  } catch (err1) {
    console.warn('[Pollón] push subscribe attempt 1:', err1);
    if (!isPushInfraError(err1)) {
      // Error de guardado / perfil: reintentar una vez sin reset
      try {
        return await tryOnce();
      } catch (errSave) {
        console.warn('[Pollón] push save retry failed:', errSave);
        throw errSave;
      }
    }
  }

  // Recuperación: reset SW/caches. Si aún no recargamos en esta sesión → reload.
  let alreadyReloaded = false;
  try {
    alreadyReloaded = sessionStorage.getItem(PUSH_RELOAD_FLAG) === '1';
  } catch {
    /* ignore */
  }

  try {
    await hardResetServiceWorkers();
    await new Promise((r) => setTimeout(r, 600));
  } catch {
    /* ignore */
  }

  if (!alreadyReloaded) {
    try {
      sessionStorage.setItem(PUSH_RELOAD_FLAG, '1');
    } catch {
      /* ignore */
    }
    // Recarga limpia: Chrome suele arreglar “Push service error” tras unregister
    setTimeout(() => {
      window.location.reload();
    }, 120);
    return { ok: true, reloading: true };
  }

  try {
    return await tryOnce();
  } catch (err2) {
    console.warn('[Pollón] push subscribe after reload failed:', err2);
  }

  markDeferred();
  return {
    ok: true,
    deferred: true,
    warn:
      'Permiso de notificaciones OK. Google Push falló en este intento; '
      + 'se reintentará al conectarte. Si quieres forzar: Chrome → datos del sitio el-pollon.cl → borrar, '
      + 'reinstala desde el ícono y vuelve a Activar notificaciones.',
  };
}

/** Reintento silencioso al abrir panel / volverse visible (si quedó deferred). */
export async function retryDriverPushInBackground() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  let needs = false;
  try {
    needs = localStorage.getItem(PUSH_DEFERRED_FLAG) === '1'
      || sessionStorage.getItem(PUSH_RELOAD_FLAG) === '1'
      || localStorage.getItem(PUSH_OK_FLAG) !== '1';
  } catch {
    needs = true;
  }
  if (!needs) {
    const existing = await getExistingPushSubscription();
    if (existing) return { ok: true, existing: true };
  }
  try {
    return await ensureDriverPushSubscription();
  } catch {
    return null;
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
  let deferred = false;
  try {
    deferred = localStorage.getItem(PUSH_DEFERRED_FLAG) === '1';
  } catch {
    /* ignore */
  }

  const nativeOk = isNativeDriverApp() && (
    notif === 'granted'
    || (typeof localStorage !== 'undefined' && localStorage.getItem(NATIVE_NOTIF_FLAG) === '1')
  );

  return {
    notificationsGranted: notif === 'granted' || nativeOk || deferred,
    notificationsState: notif,
    geoState: geo,
    geoGranted: geo === 'granted',
    pushConfigured: webPush,
    hasPushSubscription: hasSub,
    pushDeferred: deferred && !hasSub,
    readyForOnline: (notif === 'granted' || nativeOk || deferred) && (geo === 'granted' || geo === 'prompt' || isNativeDriverApp()),
  };
}

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
