/** Utilidades PWA — detección de plataforma e instalación */

export const PWA_INSTALL_DISMISS_KEY = 'pollon_pwa_install_dismissed_v1';
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
  );
}

export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod/.test(ua);
  const isMacTouch = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (isApple || isMacTouch) && !window.MSStream;
}

export function isAndroidChrome() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent);
}

export function isDesktopInstallableBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isDesktop = !/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return isDesktop && (/Chrome|Edg|Chromium/i.test(ua));
}

export function wasInstallPromptDismissed() {
  try {
    const raw = localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PWA_DISMISS_MS;
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearInstallPromptDismiss() {
  try {
    localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
