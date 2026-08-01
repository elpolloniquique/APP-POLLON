import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Share, Smartphone, X } from 'lucide-react';
import {
  dismissInstallPrompt,
  isAndroidChrome,
  isDesktopInstallableBrowser,
  isIosSafari,
  isStandaloneDisplayMode,
  wasInstallPromptDismissed,
} from '../../utils/pwa';
import {
  ensurePwaInstallListeners,
  promptPwaInstall,
  subscribeDeferredInstallPrompt,
} from '../../utils/pwaInstallBridge';
import { useAuth } from '../../context/AuthContext';
import { isDriverRole } from '../../services/authService';

/**
 * Aviso de instalación PWA para clientes.
 * No se muestra en standalone, /admin, ni /repartidor (los repartidores tienen onboarding propio).
 */
export function InstallAppPrompt() {
  const { pathname } = useLocation();
  const { role, profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mode, setMode] = useState('native');
  const [installing, setInstalling] = useState(false);

  const isAdmin = pathname.startsWith('/admin');
  const isDriverArea = pathname.startsWith('/repartidor');
  const isDriver = isDriverRole(role || profile?.rol || profile?.role);

  useEffect(() => {
    ensurePwaInstallListeners();
  }, []);

  useEffect(() => {
    if (isAdmin || isDriverArea || isDriver || isStandaloneDisplayMode() || wasInstallPromptDismissed()) {
      setVisible(false);
      return undefined;
    }

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    if (isIosSafari()) {
      const timer = window.setTimeout(() => setVisible(true), 2400);
      setMode('ios');
      window.addEventListener('appinstalled', onInstalled);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    const unsub = subscribeDeferredInstallPrompt((p) => {
      if (p) {
        setDeferredPrompt(p);
        setMode('native');
        setVisible(true);
      }
    });
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      unsub();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isAdmin, isDriverArea, isDriver, pathname]);

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
    try {
      await promptPwaInstall();
    } catch {
      /* ignore */
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
      setVisible(false);
    }
  }, [mode, handleDismiss]);

  if (!visible || isAdmin || isDriverArea || isDriver || isStandaloneDisplayMode()) return null;

  const platformHint = isIosSafari()
    ? 'iPhone / iPad'
    : isAndroidChrome()
      ? 'Android'
      : isDesktopInstallableBrowser()
        ? 'Escritorio'
        : 'Tu dispositivo';

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
            Accede más rápido a la carta, delivery y tus pedidos. Instala El Pollón como app en tu pantalla de inicio.
          </p>
        )}

        <div className="install-prompt__actions">
          {mode === 'native' && deferredPrompt && (
            <button
              type="button"
              className="install-prompt__btn install-prompt__btn--primary"
              onClick={handleInstall}
              disabled={installing}
            >
              <Download className="h-4 w-4" aria-hidden />
              {installing ? 'Instalando…' : 'Instalar ahora'}
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
      </div>
    </div>
  );
}
