/**
 * Push nativo FCM (Capacitor) para repartidores.
 * Importante: nunca bloquear la UI — Firebase register/getToken a veces no responde.
 */
import { Capacitor } from '@capacitor/core';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { isNativeDriverApp } from './backgroundGpsService';
import { DRIVER_APP_VERSION_NAME } from '../utils/driverNativeConstants';

let listenersBound = false;
let lastToken = null;
const OFFER_CHANNEL_ID = 'pollon_driver_offers';

function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markNotifOk() {
  try {
    localStorage.setItem('pollon_native_notif_ok', '1');
  } catch {
    /* ignore */
  }
}

export function isNativePushAvailable() {
  return isNativeDriverApp() && Capacitor.isPluginAvailable('PushNotifications');
}

async function getPushPlugin() {
  if (!isNativePushAvailable()) return null;
  try {
    const mod = await import('@capacitor/push-notifications');
    return mod.PushNotifications;
  } catch (err) {
    console.warn('[Pollón][DriverNative] push plugin:', err?.message || err);
    return null;
  }
}

export async function upsertMyFcmToken(token) {
  if (!token || !isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('ep_upsert_my_fcm_token', {
    p_token: String(token),
    p_platform: Capacitor.getPlatform?.() || 'android',
    p_app_version: DRIVER_APP_VERSION_NAME,
    p_device_info: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
  });
  if (error) {
    console.warn('[Pollón][DriverNative] FCM upsert:', error.message);
    try {
      localStorage.setItem('pollon_fcm_token_pending', String(token));
    } catch {
      /* ignore */
    }
    return null;
  }
  lastToken = String(token);
  try {
    localStorage.setItem('pollon_fcm_token', String(token));
    markNotifOk();
  } catch {
    /* ignore */
  }
  return data;
}

async function ensureOfferNotificationChannel(PushNotifications) {
  if (!PushNotifications?.createChannel) return;
  try {
    await withTimeout(
      PushNotifications.createChannel({
        id: OFFER_CHANNEL_ID,
        name: 'Ofertas El Pollón',
        description: 'Pedidos nuevos para repartidores',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
      }),
      3000,
      undefined,
    );
  } catch (err) {
    console.warn('[Pollón][DriverNative] createChannel:', err?.message || err);
  }
}

export async function registerNativePushHandlers({ onOffer } = {}) {
  const PushNotifications = await withTimeout(getPushPlugin(), 4000, null);
  if (!PushNotifications) return { ok: false, reason: 'no_plugin' };

  await ensureOfferNotificationChannel(PushNotifications);

  if (!listenersBound) {
    listenersBound = true;

    await withTimeout(
      PushNotifications.addListener('registration', (token) => {
        const value = token?.value || token?.token || null;
        if (value) {
          upsertMyFcmToken(value).catch((err) => {
            console.warn('[Pollón][DriverNative] upsert token:', err?.message || err);
          });
        }
      }),
      3000,
      null,
    );

    await withTimeout(
      PushNotifications.addListener('registrationError', (err) => {
        console.warn('[Pollón][DriverNative] FCM registrationError:', err);
      }),
      3000,
      null,
    );

    await withTimeout(
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification?.data || {};
        if (data.type === 'driver_offer' || data.offerId) onOffer?.(data);
        try {
          window.dispatchEvent(new CustomEvent('pollon-driver-push', { detail: data }));
        } catch {
          /* ignore */
        }
      }),
      3000,
      null,
    );

    await withTimeout(
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action?.notification?.data || {};
        try {
          window.dispatchEvent(new CustomEvent('pollon-driver-push-action', { detail: data }));
        } catch {
          /* ignore */
        }
        const path = String(data.deepLink || data.url || '');
        if (path.startsWith('/')) {
          window.history.pushState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }),
      3000,
      null,
    );
  }

  return { ok: true };
}

/**
 * Pide permiso + registra FCM sin colgar la UI.
 * Si Firebase tarda/falla, con permiso concedido igual marcamos el paso OK.
 */
export async function ensureNativePushRegistration(opts = {}) {
  const PushNotifications = await withTimeout(getPushPlugin(), 4000, null);
  if (!PushNotifications) {
    return { ok: false, reason: 'web_or_missing_plugin' };
  }

  await withTimeout(registerNativePushHandlers(opts), 8000, { ok: false, reason: 'handlers_timeout' });

  let perm = await withTimeout(
    PushNotifications.checkPermissions(),
    4000,
    { receive: 'prompt' },
  );

  if (perm?.receive !== 'granted') {
    // El usuario puede tardar en tocar Permitir; tope duro para no dejar “Espera…” eterno
    perm = await withTimeout(
      PushNotifications.requestPermissions(),
      15000,
      perm || { receive: 'prompt' },
    );
  }

  if (perm?.receive !== 'granted') {
    return { ok: false, reason: 'denied', permission: perm };
  }

  // Permiso OK → desbloquear onboarding YA (el token puede llegar después)
  markNotifOk();

  // register() / getToken de FCM a menudo se cuelga en algunos OEM — no bloquear
  const registered = await withTimeout(
    PushNotifications.register().then(() => true),
    6000,
    false,
  );

  if (!registered) {
    console.warn('[Pollón][DriverNative] FCM register timeout — reintento en background');
    PushNotifications.register().catch((err) => {
      console.warn('[Pollón][DriverNative] FCM register bg:', err?.message || err);
    });
  }

  // Esperar un instante al evento registration (no crítico)
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline && !(lastToken || getCachedFcmToken())) {
    await sleep(200);
  }

  try {
    const pending = localStorage.getItem('pollon_fcm_token_pending') || localStorage.getItem('pollon_fcm_token');
    if (pending) {
      await withTimeout(upsertMyFcmToken(pending), 4000, null);
    }
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    permission: perm,
    token: lastToken || getCachedFcmToken() || null,
    registerOk: Boolean(registered),
  };
}

export async function getNativeNotificationPermissionState() {
  const PushNotifications = await withTimeout(getPushPlugin(), 4000, null);
  if (!PushNotifications) return 'unsupported';
  try {
    const perm = await withTimeout(PushNotifications.checkPermissions(), 4000, null);
    if (!perm) return 'prompt';
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

export function getCachedFcmToken() {
  try {
    return localStorage.getItem('pollon_fcm_token') || lastToken;
  } catch {
    return lastToken;
  }
}
