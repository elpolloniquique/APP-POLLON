import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

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

async function readNativePosition() {
  const perm = await Geolocation.requestPermissions();
  const granted = perm?.location === 'granted' || perm?.coarseLocation === 'granted';
  if (!granted) {
    const err = new Error('Ubicación bloqueada.');
    err.code = 1;
    err.denied = true;
    throw err;
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 18000,
    maximumAge: 4000,
  });
  return toWebPosition(pos);
}

function readWebPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Este dispositivo no tiene GPS / geolocalización.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 18000,
        maximumAge: 8000,
      },
    );
  });
}

/**
 * Un solo disparo GPS: este llamado ES el diálogo de permiso del navegador.
 * No usar timeouts cortos en paralelo (cortan el prompt y el fix).
 */
export async function readGpsPosition() {
  let native = false;
  try {
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }

  const pos = native ? await readNativePosition() : await readWebPosition();
  const lat = pos?.coords?.latitude;
  const lng = pos?.coords?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error('No se pudo leer el GPS.');
    err.code = 2;
    throw err;
  }
  if (Number(pos.coords.accuracy) > 220) {
    const err = new Error('La señal GPS es muy imprecisa. Activa la ubicación del celular y toca de nuevo.');
    err.code = 2;
    throw err;
  }
  return pos;
}
