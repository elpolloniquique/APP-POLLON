import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import {
  dismissSiteAlert,
  emptySiteAlert,
  fetchSiteAlert,
  wasSiteAlertDismissed,
} from '../../services/siteAlertService';

function shouldHideOnPath(pathname) {
  return pathname.startsWith('/admin') || pathname.startsWith('/repartidor');
}

export function SiteAlertOverlay() {
  const { pathname } = useLocation();
  const [alert, setAlert] = useState(emptySiteAlert);
  const [open, setOpen] = useState(false);

  const applyAlert = useCallback((next) => {
    setAlert(next);
    const hide = shouldHideOnPath(window.location.pathname);
    setOpen(Boolean(next.enabled && next.message && !hide && !wasSiteAlertDismissed(next)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchSiteAlert();
      if (!cancelled) applyAlert(next);
    };
    load();
    const timer = window.setInterval(load, 40000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyAlert]);

  useEffect(() => {
    if (shouldHideOnPath(pathname)) {
      setOpen(false);
      return;
    }
    setOpen(Boolean(alert.enabled && alert.message && !wasSiteAlertDismissed(alert)));
  }, [pathname, alert]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') {
        dismissSiteAlert(alert);
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, alert]);

  const close = () => {
    dismissSiteAlert(alert);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="site-alert" role="alertdialog" aria-modal="true" aria-labelledby="site-alert-title">
      <div className="site-alert__panel">
        <button type="button" className="site-alert__close" onClick={close} aria-label="Cerrar aviso">
          <X size={20} strokeWidth={2.4} />
        </button>
        <div className="site-alert__icon" aria-hidden>
          <AlertTriangle size={34} strokeWidth={2.15} />
        </div>
        <p className="site-alert__kicker">Aviso</p>
        <h2 id="site-alert-title" className="site-alert__title">{alert.title}</h2>
        <p className="site-alert__message">{alert.message}</p>
        <button type="button" className="site-alert__ok" onClick={close}>
          Entendido
        </button>
      </div>
    </div>
  );
}
