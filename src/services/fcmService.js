/**
 * Push nativo FCM (Capacitor) para repartidores.
 */
import { Capacitor } from '@capacitor/core';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { isNativeDriverApp } from './backgroundGpsService';
import { DRIVER_APP_VERSION_NAME } from '../utils/driverNativeConstants';

let listenersBound = false;
let lastToken = null;

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
    localStorage.setItem('pollon_native_notif_ok', '1');
  } catch {
    /* ignore */
  }
  return data;
}

const OFFER_CHANNEL_ID = 'pollon_driver_offers';

async function ensureOfferNotificationChannel(PushNotifications) {
  if (!PushNotifications?.createChannel) return;
  try {
    await PushNotifications.createChannel({
      id: OFFER_CHANNEL_ID,
      name: 'Ofertas El Pollón',
      description: 'Pedidos nuevos para repartidores',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
    });
  } catch (err) {
    console.warn('[Pollón][DriverNative] createChannel:', err?.message || err);
  }
}

export async function registerNativePushHandlers({ onOffer } = {}) {
  const PushNotifications = await getPushPlugin();
  if (!PushNotifications) return { ok: false, reason: 'no_plugin' };

  await ensureOfferNotificationChannel(PushNotifications);

  if (!listenersBound) {
    listenersBound = true;

    await PushNotifications.addListener('registration', async (token) => {
      const value = token?.value || token?.token || null;
      if (value) await upsertMyFcmToken(value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[Pollón][DriverNative] FCM registrationError:', err);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification?.data || {};
      if (data.type === 'driver_offer' || data.offerId) onOffer?.(data);
      try {
        window.dispatchEvent(new CustomEvent('pollon-driver-push', { detail: data }));
      } catch {
        /* ignore */
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
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
    });
  }

  return { ok: true };
}

export async function ensureNativePushRegistration(opts = {}) {
  const PushNotifications = await getPushPlugin();
  if (!PushNotifications) {
    return { ok: false, reason: 'web_or_missing_plugin' };
  }

  await registerNativePushHandlers(opts);

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    return { ok: false, reason: 'denied', permission: perm };
  }

  try {
    await PushNotifications.register();
  } catch (err) {
    console.warn('[Pollón][DriverNative] FCM register:', err?.message || err);
    return {
      ok: false,
      reason: 'register_failed',
      error: err?.message || 'FCM no disponible (falta google-services.json)',
      permissionGranted: true,
    };
  }

  try {
    const pending = localStorage.getItem('pollon_fcm_token_pending') || localStorage.getItem('pollon_fcm_token');
    if (pending) await upsertMyFcmToken(pending);
  } catch {
    /* ignore */
  }

  // Solo marcar OK si ya hay token FCM (registration async puede llegar después)
  const tokenNow = lastToken || getCachedFcmToken();
  if (tokenNow) {
    try {
      localStorage.setItem('pollon_native_notif_ok', '1');
    } catch {
      /* ignore */
    }
  }

  return { ok: true, permission: perm, token: tokenNow || null };
}

export async function getNativeNotificationPermissionState() {
  const PushNotifications = await getPushPlugin();
  if (!PushNotifications) return 'unsupported';
  try {
    const perm = await PushNotifications.checkPermissions();
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
