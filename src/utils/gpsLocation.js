import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const TARGET_ACCURACY_M = 16;
const ACCEPTABLE_ACCURACY_M = 30;
const MAX_ACCURACY_M = 65;
const WAIT_FOR_GOOD_MS = 12000;
const HARD_TIMEOUT_MS = 20000;

export function gpsErrorMessage(err) {
  const code = err?.code;
  if (code === 1 || err?.denied) {
    return 'Ubicación bloqueada. En el candado del navegador permite Ubicación y toca de nuevo el ícono GPS.';
  }
  if (code === 2) {
    return 'Activa el GPS / ubicación de tu celular y toca de nuevo el ícono.';
  }
  if (code === 3) {
    return 'El GPS tardó demasiado. Activa la ubicación, sal un momento al aire libre y toca de nuevo.';
  }
  return err?.message || 'No se pudo obtener tu ubicación.';
}

export async function getGeoPermissionState() {
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      return st.state;
    }
  } catch {
    /* Safari / WebView a veces no soporta permissions API */
  }
  return 'prompt';
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

async function requestNativePermission() {
  const perm = await Geolocation.requestPermissions();
  const granted = perm?.location === 'granted' || perm?.coarseLocation === 'granted';
  if (!granted) {
    const err = new Error('Ubicación bloqueada.');
    err.code = 1;
    err.denied = true;
    throw err;
  }
}

/**
 * GPS real del teléfono: pide permiso, ignora WiFi/caché y espera señal precisa.
 * @param {{ onProgress?: (pos: GeolocationPosition) => void }} [opts]
 */
export async function readGpsPosition(opts = {}) {
  const native = isNativeApp();
  if (native) await requestNativePermission();

  if (!native && (typeof navigator === 'undefined' || !navigator.geolocation)) {
    throw new Error('Este dispositivo no tiene GPS / geolocalización.');
  }

  return new Promise((resolve, reject) => {
    let best = null;
    let watchId = null;
    let settled = false;
    let goodTimer = 0;
    let hardTimer = 0;
    const started = Date.now();

    const cleanup = () => {
      window.clearTimeout(goodTimer);
      window.clearTimeout(hardTimer);
      if (watchId == null) return;
      if (native) {
        Geolocation.clearWatch({ id: String(watchId) }).catch(() => {});
      } else {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
    };

    const finish = (pos, err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (pos) resolve(toWebPosition(pos));
      else reject(err || new Error('No se pudo obtener tu ubicación.'));
    };

    const onFix = (raw) => {
      if (settled || !raw) return;
      const pos = toWebPosition(raw);
      if (!Number.isFinite(pos.coords.latitude) || !Number.isFinite(pos.coords.longitude)) return;
      const acc = pos.coords.accuracy || 9999;
      if (!best || acc < best.coords.accuracy) best = pos;
      opts.onProgress?.(best);

      const elapsed = Date.now() - started;
      if (acc <= TARGET_ACCURACY_M) {
        finish(pos);
        return;
      }
      if (elapsed >= WAIT_FOR_GOOD_MS && acc <= ACCEPTABLE_ACCURACY_M) {
        finish(best);
      }
    };

    const onErr = (err) => {
      if (best && best.coords.accuracy <= MAX_ACCURACY_M) finish(best);
      else finish(null, err);
    };

    goodTimer = window.setTimeout(() => {
      if (best && best.coords.accuracy <= ACCEPTABLE_ACCURACY_M) finish(best);
    }, WAIT_FOR_GOOD_MS);

    hardTimer = window.setTimeout(() => {
      if (best && best.coords.accuracy <= MAX_ACCURACY_M) finish(best);
      else {
        const e = new Error('El GPS tardó demasiado.');
        e.code = 3;
        finish(null, e);
      }
    }, HARD_TIMEOUT_MS);

    const watchOpts = {
      enableHighAccuracy: true,
      timeout: HARD_TIMEOUT_MS,
      maximumAge: 0,
    };

    if (native) {
      Geolocation.watchPosition(watchOpts, (pos, err) => {
        if (err) onErr(err);
        else onFix(pos);
      }).then((id) => {
        watchId = id;
      }).catch(onErr);
    } else {
      watchId = navigator.geolocation.watchPosition(onFix, onErr, watchOpts);
    }
  });
}
