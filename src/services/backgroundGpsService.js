/**
 * GPS en segundo plano para repartidores (Capacitor nativo).
 * - App nativa: foreground service + notificación → pantalla apagada / otra app.
 * - Web/PWA: watchPosition (limitado).
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { upsertMyLocation, startGpsWatch } from './trackingService';

let webStop = null;
let nativeRunning = false;
let lastPublishAt = 0;

export function isNativeDriverApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform() {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

function isBgLocationOk(status) {
  const bg = status?.backgroundLocation;
  return bg === 'granted' || bg === 'always';
}

/** Solo lectura del estado de permisos (sin prompts). */
export async function checkLocationPermissionSnapshot() {
  if (!isNativeDriverApp()) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, locationOk: false, alwaysOk: false, mode: 'web' });
        return;
      }
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'geolocation' })
          .then((st) => {
            const locationOk = st.state === 'granted';
            resolve({
              ok: locationOk,
              locationOk,
              alwaysOk: locationOk,
              mode: 'web',
              needsSettings: st.state === 'denied',
              canOpenSettings: st.state === 'denied',
            });
          })
          .catch(() => {
            resolve({ ok: false, locationOk: false, alwaysOk: false, mode: 'web' });
          });
        return;
      }
      resolve({ ok: false, locationOk: false, alwaysOk: false, mode: 'web' });
    });
  }

  try {
    const status = await BackgroundGeolocation.checkPermissions();
    const locationOk = status.location === 'granted';
    const alwaysOk = isBgLocationOk(status);
    return {
      ok: locationOk && alwaysOk,
      locationOk,
      alwaysOk,
      status,
      mode: 'native',
      needsSettings: locationOk && !alwaysOk,
      canOpenSettings: !locationOk || !alwaysOk,
    };
  } catch (err) {
    return {
      ok: false,
      locationOk: false,
      alwaysOk: false,
      error: err?.message,
      canOpenSettings: true,
    };
  }
}

/**
 * Solicita ubicación (When In Use) y, en nativo, “Siempre” / background.
 */
export async function requestAlwaysLocationPermission() {
  if (!isNativeDriverApp()) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, error: 'Sin GPS en este dispositivo' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve({ ok: true, mode: 'web', locationOk: true, alwaysOk: true }),
        (err) => resolve({ ok: false, error: err.message || 'GPS denegado' }),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
  }

  try {
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* ignore */
    }

    let status = await BackgroundGeolocation.checkPermissions();
    if (status.location !== 'granted') {
      status = await BackgroundGeolocation.requestPermissions({
        permissions: ['location', 'notification'],
      });
    }

    if (status.location !== 'granted') {
      return {
        ok: false,
        error: 'Debes permitir la ubicación para entregas.',
        status,
        locationOk: false,
        alwaysOk: false,
        canOpenSettings: true,
      };
    }

    if (!isBgLocationOk(status)) {
      status = await BackgroundGeolocation.requestPermissions({
        permissions: ['backgroundLocation', 'notification'],
      });
    }

    try {
      status = await BackgroundGeolocation.checkPermissions();
    } catch {
      /* keep */
    }

    const alwaysOk = isBgLocationOk(status);
    return {
      ok: true,
      mode: 'native',
      status,
      locationOk: true,
      alwaysOk,
      needsSettings: !alwaysOk,
      canOpenSettings: !alwaysOk,
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo pedir permiso GPS' };
  }
}

export async function openNativeLocationSettings() {
  if (!isNativeDriverApp()) return;
  try {
    await BackgroundGeolocation.openSettings();
  } catch {
    /* ignore */
  }
}

async function publishNativeFix(location) {
  if (!location) return;
  const now = Date.now();
  if (now - lastPublishAt < 4000) return;
  lastPublishAt = now;
  try {
    await upsertMyLocation({
      lat: location.latitude,
      lng: location.longitude,
      heading: location.bearing ?? null,
      speed: location.speed ?? null,
      accuracy: location.accuracy ?? null,
    });
  } catch (err) {
    console.warn('[Pollón] GPS background publish:', err?.message || err);
  }
}

/**
 * Inicia seguimiento continuo en vivo (publica a Supabase).
 * Nativo: FGS + notificación → pantalla apagada / otra app.
 */
export async function startDriverBackgroundGps({ onUpdate } = {}) {
  await stopDriverBackgroundGps();

  if (!isNativeDriverApp()) {
    const publishRef = { current: true };
    webStop = startGpsWatch(
      (pos, err) => {
        onUpdate?.(pos, err);
      },
      { intervalMs: 5000, publishRef }
    );
    return { ok: true, mode: 'web' };
  }

  const perm = await requestAlwaysLocationPermission();
  if (!perm.ok) {
    return perm;
  }

  try {
    await BackgroundGeolocation.start(
      {
        backgroundMessage: 'El Pollón · Compartiendo ubicación en vivo con el local',
        backgroundTitle: 'El Pollón · GPS activo',
        requestPermissions: true,
        stale: false,
        distanceFilter: 18,
      },
      (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            onUpdate?.(null, new Error('Permiso de ubicación denegado'));
          } else {
            onUpdate?.(null, new Error(error.message || 'Error GPS nativo'));
          }
          return;
        }
        if (!location) return;
        const payload = {
          lat: location.latitude,
          lng: location.longitude,
          heading: location.bearing,
          speed: location.speed,
          accuracy: location.accuracy,
        };
        onUpdate?.(payload, null);
        void publishNativeFix(location);
      }
    );
    nativeRunning = true;
    return {
      ok: true,
      mode: 'native',
      alwaysOk: perm.alwaysOk !== false,
      needsSettings: Boolean(perm.needsSettings),
      canOpenSettings: Boolean(perm.canOpenSettings),
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo iniciar GPS en segundo plano' };
  }
}

export async function stopDriverBackgroundGps() {
  if (webStop) {
    try { webStop(); } catch { /* ignore */ }
    webStop = null;
  }
  if (nativeRunning || isNativeDriverApp()) {
    try {
      await BackgroundGeolocation.stop();
    } catch {
      /* ignore */
    }
    nativeRunning = false;
  }
}

export function isDriverBackgroundGpsRunning() {
  return nativeRunning || Boolean(webStop);
}
