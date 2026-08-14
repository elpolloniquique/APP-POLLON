import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Download, Share, Smartphone, X } from 'lucide-react';
import {
  dismissInstallPrompt,
  isAndroidChrome,
  isDesktopInstallableBrowser,
  isIosSafari,
  isMobileBrowser,
  isPwaAlreadyInstalled,
  isStandaloneDisplayMode,
  wasInstallPromptDismissed,
} from '../../utils/pwa';
import {
  ensurePwaInstallListeners,
  promptPwaInstall,
  subscribeDeferredInstallPrompt,
} from '../../utils/pwaInstallBridge';

/**
 * Aviso “Instalar app” en el sitio (Chrome Android / iOS).
 * - Si YA está instalada (pollito) → no se muestra.
 * - Si NO está instalada → mensaje + botón Instalar.
 * No se muestra dentro de la APK nativa, ni en /admin, ni en modo standalone.
 */
export function InstallAppPrompt() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mode, setMode] = useState('native');
  const [installing, setInstalling] = useState(false);
  const [hint, setHint] = useState('');

  const isNative = (() => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
  })();
  const isAdmin = pathname.startsWith('/admin');

  useEffect(() => {
    ensurePwaInstallListeners();
  }, []);

  useEffect(() => {
    if (isNative || isAdmin || isStandaloneDisplayMode() || wasInstallPromptDismissed()) {
      setVisible(false);
      return undefined;
    }

    let cancelled = false;

    const hideIfInstalled = async () => {
      const installed = await isPwaAlreadyInstalled();
      if (cancelled) return installed;
      if (installed) {
        setVisible(false);
        return true;
      }
      return false;
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    if (isIosSafari()) {
      setMode('ios');
      const timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (!(await hideIfInstalled())) setVisible(true);
      }, 1600);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    const unsub = subscribeDeferredInstallPrompt(async (p) => {
      if (cancelled) return;
      if (await hideIfInstalled()) return;
      if (p) {
        setDeferredPrompt(p);
        setMode('native');
        setVisible(true);
      }
    });

    // Fallback: Chrome a veces no dispara beforeinstallprompt a tiempo.
    // Si la PWA no está instalada, igual mostramos el aviso con botón.
    const fallback = window.setTimeout(async () => {
      if (cancelled) return;
      if (await hideIfInstalled()) return;
      if (isStandaloneDisplayMode() || wasInstallPromptDismissed()) return;
      if (isAndroidChrome() || isMobileBrowser() || isDesktopInstallableBrowser()) {
        setMode(isIosSafari() ? 'ios' : 'native');
        setVisible(true);
      }
    }, 1800);

    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(fallback);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isAdmin, isNative, pathname]);

  const handleDismiss = useCallback(() => {
    dismissInstallPrompt();
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  const handleInstall = useCallback(async () => {
    if (mode === 'ios') {
      handleDismiss();
      return;
    }
    setInstalling(true);
    setHint('');
    try {
      const r = await promptPwaInstall();
      if (r?.outcome === 'accepted') {
        setVisible(false);
        return;
      }
      if (!r?.ok) {
        setHint('Si no aparece el diálogo: menú de Chrome (⋮) → Instalar aplicación.');
      }
    } catch {
      setHint('Menú de Chrome (⋮) → Instalar aplicación.');
    } finally {
      setInstalling(false);
    }
  }, [mode, handleDismiss]);

  if (!visible || isNative || isAdmin || isStandaloneDisplayMode()) return null;

  const platformHint = isIosSafari()
    ? 'iPhone / iPad'
    : isAndroidChrome()
      ? 'Android'
      : isDesktopInstallableBrowser()
        ? 'Escritorio'
        : 'Tu celular';

  return (
    <div className="install-prompt" role="dialog" aria-labelledby="install-prompt-title" aria-live="polite">
      <div className="install-prompt__card">
        <button
          type="button"
          className="install-prompt__close"
          onClick={handleDismiss}
          aria-label="Cerrar aviso de instalación"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="install-prompt__brand">
          <span className="install-prompt__logo" aria-hidden>
            <img src="/icons/icon-192.png" alt="" width={48} height={48} />
          </span>
          <div>
            <p className="install-prompt__eyebrow">App gratuita · {platformHint}</p>
            <h2 id="install-prompt-title" className="install-prompt__title">
              Instalar App El Pollón
            </h2>
          </div>
        </div>

        {mode === 'ios' ? (
          <div className="install-prompt__ios-guide">
            <p className="install-prompt__text">
              Para instalar en iPhone: toca <strong>Compartir</strong> y luego{' '}
              <strong>Agregar a pantalla de inicio</strong>.
            </p>
            <div className="install-prompt__ios-steps">
              <span className="install-prompt__ios-step">
                <Share className="h-4 w-4" aria-hidden />
                Compartir
              </span>
              <span className="install-prompt__ios-arrow" aria-hidden>→</span>
              <span className="install-prompt__ios-step">
                <Smartphone className="h-4 w-4" aria-hidden />
                Agregar a inicio
              </span>
            </div>
          </div>
        ) : (
          <p className="install-prompt__text">
            Instala El Pollón en tu celular (ícono del pollito) para pedir más rápido y recibir avisos.
          </p>
        )}

        <div className="install-prompt__actions">
          {mode === 'native' && (
            <button
              type="button"
              className="install-prompt__btn install-prompt__btn--primary"
              onClick={handleInstall}
              disabled={installing}
            >
              <Download className="h-4 w-4" aria-hidden />
              {installing ? 'Instalando…' : 'Instalar aplicación'}
            </button>
          )}
          {mode === 'ios' && (
            <button
              type="button"
              className="install-prompt__btn install-prompt__btn--primary"
              onClick={handleDismiss}
            >
              Entendido
            </button>
          )}
          <button type="button" className="install-prompt__btn install-prompt__btn--ghost" onClick={handleDismiss}>
            Ahora no
          </button>
        </div>
        {hint ? <p className="install-prompt__text" style={{ marginTop: 8 }}>{hint}</p> : null}
      </div>
    </div>
  );
}
