/** Constantes app nativa repartidor El Pollón */
export const DRIVER_APK_PUBLIC_PATH = '/DESCARGAR-APK/El-Pollon-repartidor.apk';
export const DRIVER_APK_FILE_NAME = 'El-Pollon-repartidor.apk';
export const DRIVER_APP_VERSION_NAME = '1.2.7';
export const DRIVER_APP_VERSION_CODE = 10;
export const DRIVER_APP_ID = 'cl.elpollon.app';
export const DRIVER_SITE_ORIGIN = 'https://www.el-pollon.cl';

export function getDriverApkDownloadUrl() {
  if (typeof window !== 'undefined' && window.location?.origin && !/localhost|capacitor/i.test(window.location.origin)) {
    return `${window.location.origin}${DRIVER_APK_PUBLIC_PATH}`;
  }
  return `${DRIVER_SITE_ORIGIN}${DRIVER_APK_PUBLIC_PATH}`;
}

/** URL absoluta: el POST nativo NO puede ir a capacitor://localhost */
export function getDriverGpsPingUrl(token) {
  return `${DRIVER_SITE_ORIGIN}/api/driver-gps-ping?k=${encodeURIComponent(token)}`;
}
