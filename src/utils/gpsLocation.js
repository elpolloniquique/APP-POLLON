import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const FIX_TIMEOUT_MS = 7000;

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

async function nativePreciseFix() {
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
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: FIX_TIMEOUT_MS,
    maximumAge: 800,
  });
  return assertUsable(pos);
}

function webPreciseFix() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Este dispositivo no tiene GPS / geolocalización.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          resolve(assertUsable(pos));
        } catch (err) {
          reject(err);
        }
      },
      (err) => {
        if (err?.code === 1) reject(denyError('Debes permitir la ubicación precisa del teléfono.'));
        else reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: FIX_TIMEOUT_MS,
        maximumAge: 800,
      },
    );
  });
}

/**
 * Siempre pide permiso de ubicación precisa y, al aceptar, lee el GPS al instante.
 * Un solo getCurrentPosition (sin esperar 10–20 s de refinamiento).
 */
export async function locateWithPrecisePermission(opts = {}) {
  const pos = isNativeApp() ? await nativePreciseFix() : await webPreciseFix();
  opts.onProgress?.(pos);
  return pos;
}
