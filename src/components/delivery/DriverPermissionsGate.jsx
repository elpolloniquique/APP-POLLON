import { useCallback, useEffect, useState } from 'react';
import { Bell, MapPin, Smartphone, Share, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  isStandaloneDisplayMode,
  isIosSafari,
  isAndroidChrome,
} from '../../utils/pwa';
import {
  checkDriverReadyPermissions,
  ensureDriverPushSubscription,
  isPushConfigured,
  requestGpsFix,
} from '../../services/pushService';

/**
 * Onboarding obligatorio: instalar PWA + notificaciones + GPS.
 * Sin esto el repartidor no puede ponerse Disponible.
 */
export function DriverPermissionsGate({ onReadyChange }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [gpsOk, setGpsOk] = useState(false);
  const installed = isStandaloneDisplayMode();
  const ios = isIosSafari();
  const android = isAndroidChrome();

  const refresh = useCallback(async () => {
    const s = await checkDriverReadyPermissions();
    setStatus(s);
    // Si el SO ya otorgó GPS, marcar listo sin volver a pedir
    if (s.geoGranted) setGpsOk(true);
    return s;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Si ya hay permiso de notificaciones pero falta suscripción, intentar en silencio
  useEffect(() => {
    if (status?.notificationsGranted && !status?.hasPushSubscription && isPushConfigured()) {
      ensureDriverPushSubscription()
        .then(() => refresh())
        .catch(() => {});
    }
  }, [status?.notificationsGranted, status?.hasPushSubscription, refresh]);

  const enableNotifications = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (!isPushConfigured()) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        throw new Error('Falta configurar VITE_VAPID_PUBLIC_KEY en Vercel. Avisa al administrador.');
      }
      await ensureDriverPushSubscription();
      setMsg('Notificaciones activadas.');
      await refresh();
    } catch (err) {
      setMsg(err.message || 'No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  };

  const enableGps = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await requestGpsFix();
      if (!res.ok) throw new Error(res.error || 'GPS denegado');
      setGpsOk(true);
      setMsg('GPS activado correctamente.');
      await refresh();
    } catch (err) {
      setGpsOk(false);
      setMsg(err.message || 'Activa la ubicación del celular');
    } finally {
      setBusy(false);
    }
  };

  const notifOk = status?.notificationsGranted && (status?.hasPushSubscription || !status?.pushConfigured);
  const installOk = installed || (!ios && !android);
  const mustInstall = (ios || android) && !installed;
  const allReady = Boolean(notifOk && gpsOk && !mustInstall);

  useEffect(() => {
    onReadyChange?.(allReady);
  }, [allReady, onReadyChange]);

  if (allReady) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-bold">Listo para trabajar</p>
          <p className="text-xs opacity-90">Notificaciones y GPS activos. Ya puedes pulsar Disponible.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b border-amber-100 bg-amber-50 px-3.5 py-3">
        <p className="text-sm font-bold text-amber-900">Activa permisos obligatorios</p>
        <p className="mt-0.5 text-xs text-amber-800/90">
          Sin esto no puedes ponerte Disponible ni recibir pedidos con la pantalla apagada.
        </p>
      </div>

      <ol className="space-y-3 px-3.5 py-3.5">
        {/* Paso 1 — Instalar */}
        <li className="flex gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${installOk ? 'bg-emerald-500 text-white' : 'bg-pollon-red text-white'}`}>
            <Smartphone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">1. Instalar la app</p>
            {installed ? (
              <p className="text-xs text-emerald-700">App instalada ✓</p>
            ) : ios ? (
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                En iPhone: toca <Share className="inline h-3.5 w-3.5" /> Compartir → <strong>Agregar a pantalla de inicio</strong>.
                Luego ábrela desde el ícono (no desde Safari).
              </p>
            ) : android ? (
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                En Android: menú ⋮ del navegador → <strong>Instalar app</strong> / Agregar a inicio. Ábrela desde el ícono.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-600">En PC puedes continuar; en el celular del repartidor sí debes instalarla.</p>
            )}
          </div>
        </li>

        {/* Paso 2 — Notificaciones */}
        <li className="flex gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notifOk ? 'bg-emerald-500 text-white' : 'bg-pollon-red text-white'}`}>
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">2. Notificaciones del sistema</p>
            <p className="mt-0.5 text-xs text-gray-600">
              Como WhatsApp: llegan a la bandeja aunque la pantalla esté apagada.
            </p>
            {!notifOk && (
              <button
                type="button"
                disabled={busy}
                onClick={enableNotifications}
                className="mt-2 rounded-xl bg-pollon-red px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Activar notificaciones
              </button>
            )}
            {notifOk && <p className="mt-1 text-xs font-semibold text-emerald-700">Activadas ✓</p>}
          </div>
        </li>

        {/* Paso 3 — GPS */}
        <li className="flex gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${gpsOk ? 'bg-emerald-500 text-white' : 'bg-pollon-red text-white'}`}>
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">3. GPS / ubicación en vivo</p>
            <p className="mt-0.5 text-xs text-gray-600">
              Obligatoria para que el local vea tu ubicación al llevar pedidos.
            </p>
            {!gpsOk && (
              <button
                type="button"
                disabled={busy}
                onClick={enableGps}
                className="mt-2 rounded-xl bg-pollon-red px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Activar GPS
              </button>
            )}
            {gpsOk && <p className="mt-1 text-xs font-semibold text-emerald-700">GPS listo ✓</p>}
          </div>
        </li>
      </ol>

      {msg && (
        <div className={`mx-3.5 mb-3.5 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${msg.includes('correctamente') || msg.includes('activadas') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}
