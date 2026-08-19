import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Precisión objetivo: ≤ 20 m = fix de satélite real (no wifi/celular).
 * Si en 18 s no se alcanza, usa el mejor fix disponible.
 */
const TARGET_ACCURACY_M = 20;
const WATCH_TIMEOUT_MS = 18000;
const WATCH_POLL_MS = 200;

export const ADDRESS_LIST_HINT =
  'Si no está exacto, escribe calle y número y elige de la lista.';

export function gpsErrorMessage(err) {
  const code = err?.code;
  if (err?.coarseOnly) {
    return `Ubicación aproximada. ${ADDRESS_LIST_HINT}`;
  }
  if (code === 1 || err?.denied) {
    return `Ubicación bloqueada. ${ADDRESS_LIST_HINT}`;
  }
  if (code === 2) {
    return `Sin señal GPS. ${ADDRESS_LIST_HINT}`;
  }
  if (code === 3) {
    return `El GPS tardó demasiado. ${ADDRESS_LIST_HINT}`;
  }
  return `${err?.message || 'No se pudo usar el GPS.'} ${ADDRESS_LIST_HINT}`;
}

function toWebPosition(pos) {
  const coords = pos?.coords || pos;
  return {
    coords: {
      latitude: Number(coords.latitude),
      longitude: Number(coords.longitude),
      accuracy: Number(coords.accuracy || 0),
    },
    timestamp: pos?.timestamp || Date.now(),
  };
}

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function denyError(message, extra = {}) {
  const err = new Error(message);
  err.code = 1;
  err.denied = true;
  Object.assign(err, extra);
  return err;
}

function assertUsable(pos) {
  const lat = pos?.coords?.latitude;
  const lng = pos?.coords?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error('No se pudo leer el GPS.');
    err.code = 2;
    throw err;
  }
  return toWebPosition(pos);
}

/**
 * Usa watchPosition para obtener el fix más preciso posible.
 * Resuelve cuando accuracy ≤ TARGET_ACCURACY_M o cuando vence el timeout.
 * onImprove se llama cada vez que llega un fix mejor (para actualizar la UI).
 */
function webWatchFix(onImprove) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Este dispositivo no tiene GPS / geolocalización.'));
  }
  return new Promise((resolve, reject) => {
    let watchId = null;
    let best = null;
    let settled = false;

    const finish = (pos) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) {
        try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
      }
      resolve(assertUsable(pos));
    };

    const timer = setTimeout(() => {
      if (best) finish(best);
      else {
        settled = true;
        if (watchId !== null) {
          try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
        }
        const err = new Error('GPS tardó demasiado. Inténtalo de nuevo al aire libre.');
        err.code = 3;
        reject(err);
      }
    }, WATCH_TIMEOUT_MS);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos?.coords?.accuracy ?? Infinity;
        const prevAcc = best?.coords?.accuracy ?? Infinity;
        if (acc < prevAcc) {
          best = pos;
          try { onImprove?.(toWebPosition(pos)); } catch { /* ignore */ }
        }
        if (acc <= TARGET_ACCURACY_M) {
          clearTimeout(timer);
          finish(pos);
        }
      },
      (err) => {
        clearTimeout(timer);
        settled = true;
        if (watchId !== null) {
          try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
        }
        if (err?.code === 1) reject(denyError('Debes permitir la ubicación precisa del teléfono.'));
        else reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: WATCH_TIMEOUT_MS },
    );
  });
}

async function nativePreciseFix(onImprove) {
  const perm = await Geolocation.requestPermissions();
  if (perm?.location !== 'granted') {
    if (perm?.coarseLocation === 'granted') {
      throw denyError(
        'Activa ubicación precisa (no aproximada) en Ajustes del celular y toca de nuevo.',
        { coarseOnly: true },
      );
    }
    throw denyError('Debes permitir la ubicación precisa del teléfono.');
  }
  // Capacitor no expone watchPosition con la misma API; hacemos polling
  let best = null;
  const deadline = Date.now() + WATCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 6000,
      maximumAge: 0,
    }).catch(() => null);
    if (!pos) break;
    const acc = pos?.coords?.accuracy ?? Infinity;
    const prevAcc = best?.coords?.accuracy ?? Infinity;
    if (acc < prevAcc) {
      best = pos;
      try { onImprove?.(toWebPosition(pos)); } catch { /* ignore */ }
    }
    if (acc <= TARGET_ACCURACY_M) break;
    await new Promise((r) => setTimeout(r, WATCH_POLL_MS));
  }
  if (!best) {
    const err = new Error('GPS tardó demasiado. Inténtalo de nuevo al aire libre.');
    err.code = 3;
    throw err;
  }
  return assertUsable(best);
}

/**
 * Pide permiso de ubicación precisa y espera el fix de satélite real.
 * onImprove se llama con cada mejora intermedia para actualizar la UI.
 */
export async function locateWithPrecisePermission(opts = {}) {
  const pos = isNativeApp()
    ? await nativePreciseFix(opts.onImprove)
    : await webWatchFix(opts.onImprove);
  opts.onProgress?.(pos);
  return pos;
}
