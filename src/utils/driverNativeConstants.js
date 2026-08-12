/** Constantes app nativa repartidor El Pollón */
export const DRIVER_APK_PUBLIC_PATH = '/DESCARGAR-APK/El-Pollon-repartidor.apk';
export const DRIVER_APK_FILE_NAME = 'El-Pollon-repartidor.apk';
export const DRIVER_APP_VERSION_NAME = '1.2.1';
export const DRIVER_APP_VERSION_CODE = 4;
export const DRIVER_APP_ID = 'cl.elpollon.app';

export function getDriverApkDownloadUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${DRIVER_APK_PUBLIC_PATH}`;
  }
  return `https://www.el-pollon.cl${DRIVER_APK_PUBLIC_PATH}`;
}
