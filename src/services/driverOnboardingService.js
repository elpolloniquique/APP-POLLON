/**
 * Onboarding obligatorio SOLO repartidores (mismo app El Pollón que clientes).
 * Detecta rol delivery → exige: app instalada + notificaciones + GPS.
 * No requiere APK aparte.
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
} from './pushService';
import { isStandaloneDisplayMode, isIosSafari, isAndroidChrome } from '../utils/pwa';

const STORAGE_KEY = 'pollon_driver_live_tracking_v2';

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

/** App instalada = PWA standalone (como clientes) o Capacitor nativo. */
export function isDriverAppInstalled() {
  if (isNativeDriverApp()) return true;
  return isStandaloneDisplayMode();
}

/** En móvil, si aún no instaló la PWA, debe instalar (misma ventana que clientes). */
export function driverNeedsInstall() {
  if (isDriverAppInstalled()) return false;
  // Escritorio/dev: no bloquear
  if (!isAndroidChrome() && !isIosSafari()) return false;
  return true;
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
    standalone: isStandaloneDisplayMode(),
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
  const needsInstall = driverNeedsInstall();
  const installed = isDriverAppInstalled();
  const notif = getNotificationPermission();

  let notifOk = notif === 'granted';
  if (!notifOk && native) {
    try {
      notifOk = localStorage.getItem('pollon_native_notif_ok') === '1';
    } catch {
      /* ignore */
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

  // PWA: location granted = listo. Nativo: Always o confirmación OEM.
  const gpsOk = native
    ? Boolean(location.locationOk && (location.alwaysOk || userConfirmedAlways))
    : Boolean(location.locationOk);

  const saved = getDriverOnboardingRecord(userId);
  // En móvil: must be standalone. En escritorio/dev: no exigir install.
  const installOk = !needsInstall;
  const ready = Boolean(installOk && notifOk && gpsOk);

  return {
    native,
    platform: getNativePlatform(),
    needsInstall,
    mustNative: false,
    installed,
    notifOk,
    notifState: notif,
    gpsOk,
    locationOk: Boolean(location.locationOk),
    alwaysOk: Boolean(
      native
        ? (location.alwaysOk || userConfirmedAlways)
        : location.locationOk
    ),
    needsSettings: Boolean(native && location.needsSettings && !userConfirmedAlways),
    canOpenSettings: Boolean(location.canOpenSettings) || native,
    isIos: isIosSafari(),
    isAndroid: isAndroidChrome(),
    savedCompletedAt: saved?.completedAt || null,
    ready,
  };
}

export async function completeDriverLiveTrackingSetup(userId) {
  if (driverNeedsInstall()) {
    return {
      ok: false,
      error: 'Primero instala la app El Pollón (como hacen los clientes) y ábrela desde el ícono.',
      needsInstall: true,
    };
  }

  await ensureDriverPushSubscription().catch(() => {});
  const notif = getNotificationPermission();
  if (notif !== 'granted') {
    if (isNativeDriverApp()) {
      try { localStorage.setItem('pollon_native_notif_ok', '1'); } catch { /* ignore */ }
    } else {
      return { ok: false, error: 'Activa las notificaciones del sistema.' };
    }
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

  if (isNativeDriverApp() && !gps.alwaysOk && !userConfirmedAlways) {
    return {
      ok: false,
      error: 'En Ajustes elige ubicación “Permitir todo el tiempo” / “Siempre”.',
      needsSettings: true,
      canOpenSettings: true,
    };
  }

  markDriverOnboardingComplete(userId, {
    alwaysOk: gps.alwaysOk !== false || userConfirmedAlways || !isNativeDriverApp(),
    mode: gps.mode,
  });

  return { ok: true, gps };
}

/** @deprecated use driverNeedsInstall */
export function driverMustUseNativeApp() {
  return false;
}
