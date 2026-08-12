/**
 * Onboarding obligatorio repartidores — NATIVE-ONLY (APK Capacitor).
 * En Chrome/PWA: bloqueo + descarga APK. Sin operar en web.
 */
import {
  isNativeDriverApp,
  getNativePlatform,
  requestAlwaysLocationPermission,
  checkLocationPermissionSnapshot,
} from './backgroundGpsService';
import {
  getNotificationPermission,
  ensureDriverPushSubscription,
  hasWebPushSupport,
  getExistingPushSubscription,
} from './pushService';
import { getNativeNotificationPermissionState } from './fcmService';
import { isIosSafari, isAndroidChrome } from '../utils/pwa';
import {
  DRIVER_APP_VERSION_CODE,
  DRIVER_APP_VERSION_NAME,
  getDriverApkDownloadUrl,
} from '../utils/driverNativeConstants';

const STORAGE_KEY = 'pollon_driver_live_tracking_v2';

function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Solo cuenta como instalada la app nativa Capacitor (no PWA). */
export function isDriverAppInstalled() {
  return isNativeDriverApp();
}

/** En cualquier navegador/PWA: debe instalar APK. */
export function driverNeedsInstall() {
  return !isNativeDriverApp();
}

export function getDriverOnboardingRecord(userId) {
  if (!userId) return null;
  return readStore()[userId] || null;
}

export function markDriverOnboardingComplete(userId, extra = {}) {
  if (!userId) return;
  const all = readStore();
  all[userId] = {
    completedAt: new Date().toISOString(),
    platform: getNativePlatform(),
    native: isNativeDriverApp(),
    versionName: DRIVER_APP_VERSION_NAME,
    versionCode: DRIVER_APP_VERSION_CODE,
    ...extra,
  };
  writeStore(all);
}

export function clearDriverOnboarding(userId) {
  if (!userId) return;
  const all = readStore();
  delete all[userId];
  writeStore(all);
}

export async function evaluateDriverLiveTrackingReady(userId) {
  const native = isNativeDriverApp();
  const needsInstall = !native;
  const installed = native;
  const apkUrl = getDriverApkDownloadUrl();

  // Gate web: no listo hasta APK
  if (!native) {
    return {
      native: false,
      platform: getNativePlatform(),
      needsInstall: true,
      mustNative: true,
      installed: false,
      notifOk: false,
      hasPushSub: false,
      pushDeferred: false,
      notifState: 'unsupported',
      gpsOk: false,
      locationOk: false,
      alwaysOk: false,
      needsSettings: false,
      canOpenSettings: false,
      isIos: isIosSafari(),
      isAndroid: isAndroidChrome(),
      savedCompletedAt: getDriverOnboardingRecord(userId)?.completedAt || null,
      ready: false,
      apkUrl,
      versionName: DRIVER_APP_VERSION_NAME,
      versionCode: DRIVER_APP_VERSION_CODE,
    };
  }

  const base = {
    native: true,
    platform: getNativePlatform(),
    needsInstall: false,
    mustNative: true,
    installed: true,
    apkUrl,
    versionName: DRIVER_APP_VERSION_NAME,
    versionCode: DRIVER_APP_VERSION_CODE,
    isIos: isIosSafari(),
    isAndroid: isAndroidChrome(),
    savedCompletedAt: getDriverOnboardingRecord(userId)?.completedAt || null,
  };

  // Cap duro: nunca dejar la UI en “Verificando…” infinito (plugins nativos a veces no responden)
  const evaluated = await withTimeout(
    (async () => {
      let notifState = getNotificationPermission();
      try {
        const nativeNotif = await getNativeNotificationPermissionState();
        if (nativeNotif === 'granted' || nativeNotif === 'denied' || nativeNotif === 'prompt') {
          notifState = nativeNotif;
        }
      } catch {
        /* ignore */
      }

      let notifOk = notifState === 'granted';
      if (!notifOk) {
        try {
          notifOk = localStorage.getItem('pollon_native_notif_ok') === '1';
        } catch {
          /* ignore */
        }
      }

      // En nativo el push real es FCM; no esperar Service Worker / Web Push
      let hasPushSub = false;
      try {
        if (localStorage.getItem('pollon_fcm_token')) hasPushSub = true;
      } catch {
        /* ignore */
      }
      if (!hasPushSub && !native && notifState === 'granted' && hasWebPushSupport()) {
        try {
          hasPushSub = Boolean(await getExistingPushSubscription());
        } catch {
          hasPushSub = false;
        }
      }

      let location = { ok: false, alwaysOk: false, locationOk: false };
      try {
        location = await checkLocationPermissionSnapshot();
      } catch {
        location = { ok: false, alwaysOk: false, locationOk: false };
      }

      let userConfirmedAlways = false;
      try {
        userConfirmedAlways = localStorage.getItem(`pollon_driver_always_confirmed_${userId}`) === '1';
      } catch {
        /* ignore */
      }

      const gpsOk = Boolean(location.locationOk && (location.alwaysOk || userConfirmedAlways));
      const ready = Boolean(native && notifOk && gpsOk);

      return {
        ...base,
        notifOk,
        hasPushSub,
        pushDeferred: false,
        notifState,
        gpsOk,
        locationOk: Boolean(location.locationOk),
        alwaysOk: Boolean(location.alwaysOk || userConfirmedAlways),
        needsSettings: Boolean(location.needsSettings && !userConfirmedAlways),
        canOpenSettings: Boolean(location.canOpenSettings) || native,
        ready,
      };
    })(),
    7000,
    null,
  );

  if (evaluated) return evaluated;

  return {
    ...base,
    notifOk: false,
    hasPushSub: false,
    pushDeferred: false,
    notifState: 'prompt',
    gpsOk: false,
    locationOk: false,
    alwaysOk: false,
    needsSettings: false,
    canOpenSettings: true,
    ready: false,
    evaluateTimedOut: true,
  };
}

export async function completeDriverLiveTrackingSetup(userId) {
  if (!isNativeDriverApp()) {
    return {
      ok: false,
      error: 'Debes instalar y abrir la app nativa El Pollón Repartidor (APK).',
      needsInstall: true,
      mustNative: true,
      apkUrl: getDriverApkDownloadUrl(),
    };
  }

  await ensureDriverPushSubscription().catch(() => {});

  let notifGranted = getNotificationPermission() === 'granted';
  if (!notifGranted) {
    try {
      const nativeNotif = await getNativeNotificationPermissionState();
      notifGranted = nativeNotif === 'granted' || localStorage.getItem('pollon_native_notif_ok') === '1';
    } catch {
      try {
        notifGranted = localStorage.getItem('pollon_native_notif_ok') === '1';
      } catch {
        notifGranted = false;
      }
    }
  }
  if (!notifGranted) {
    return {
      ok: false,
      error: 'Activa las notificaciones para recibir pedidos con la pantalla apagada.',
      needsNotif: true,
    };
  }

  const gps = await requestAlwaysLocationPermission();
  if (!gps.ok) {
    return { ok: false, error: gps.error || 'GPS denegado', canOpenSettings: true };
  }

  let userConfirmedAlways = false;
  try {
    userConfirmedAlways = localStorage.getItem(`pollon_driver_always_confirmed_${userId}`) === '1';
  } catch {
    /* ignore */
  }

  if (!gps.alwaysOk && !userConfirmedAlways) {
    return {
      ok: false,
      error: 'En Ajustes elige ubicación “Permitir todo el tiempo” / “Siempre”.',
      needsSettings: true,
      canOpenSettings: true,
    };
  }

  markDriverOnboardingComplete(userId, {
    alwaysOk: gps.alwaysOk !== false || userConfirmedAlways,
    mode: gps.mode,
  });

  return { ok: true, gps };
}

/** True si el flujo exige APK (siempre en este producto). */
export function driverMustUseNativeApp() {
  return true;
}
