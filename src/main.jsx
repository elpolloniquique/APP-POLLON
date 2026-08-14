import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { ensurePwaInstallListeners } from './utils/pwaInstallBridge';
import './index.css';
import App from './App.jsx';

ensurePwaInstallListeners();

const isNativeCapacitor = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

// El SW de la PWA rompe/cuelga el WebView Capacitor (permisos, caché vieja, ready infinito).
if (import.meta.env.PROD && !isNativeCapacitor) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
    onOfflineReady() {
      /* PWA lista */
    },
  });
}

if (isNativeCapacitor) {
  import('@capacitor/splash-screen')
    .then(({ SplashScreen }) => SplashScreen.hide().catch(() => {}))
    .catch(() => {});
  // Limpiar SW viejos si alguna build anterior los dejó registrados en el WebView
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations?.()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
