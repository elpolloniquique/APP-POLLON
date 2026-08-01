/**
 * GPS en segundo plano para repartidores (Capacitor nativo).
 * - App nativa: foreground service + notificación → sigue con pantalla apagada.
 * - Web/PWA: watchPosition (limitado al salir de la app).
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
  // Android: granted | iOS: always | when_in_use (insuficiente para Always)
  return bg === 'granted' || bg === 'always';
}

/**
 * Solicita ubicación (When In Use) y, en nativo, “Siempre” / background + notificaciones.
 */
export async function requestAlwaysLocationPermission() {
  if (!isNativeDriverApp()) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, error: 'Sin GPS en este dispositivo' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve({ ok: true, mode: 'web' }),
        (err) => resolve({ ok: false, error: err.message || 'GPS denegado' }),
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
  }

  try {
    // 1) Foreground (While using)
    try {
      await Geolocation.requestPermissions();
    } catch {
      /* algunos dispositivos no exponen este plugin igual */
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
        canOpenSettings: true,
      };
    }

    // 2) Background / “Siempre” (Android 10+ puede pedir paso a Ajustes)
    if (!isBgLocationOk(status)) {
      status = await BackgroundGeolocation.requestPermissions({
        permissions: ['backgroundLocation', 'notification'],
      });
    }

    // Con foreground service (notificación persistente) ya se puede rastrear
    // con pantalla apagada aunque “Siempre” quede pendiente en algunos OEM.
    // Si background quedó denegado, avisamos pero permitimos arrancar el FGS.
    const alwaysOk = isBgLocationOk(status);
    return {
      ok: true,
      mode: 'native',
      status,
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
 * Inicia seguimiento continuo.
 * Nativo: foreground service + notificación → pantalla apagada OK.
 * Web: watchPosition clásico.
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
        backgroundMessage: 'El Pollón rastrea tu ubicación hasta marcar Entregado.',
        backgroundTitle: 'El Pollón · Entrega en curso',
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,
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
