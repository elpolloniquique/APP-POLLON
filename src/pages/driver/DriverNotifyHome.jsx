import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, ExternalLink, Smartphone, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ensureDriverPushSubscription, setDriverAppBadge, clearDriverAppBadge } from '../../services/pushService';
import { getMyDriverSummary, ensureMyDriverProfile } from '../../services/driverService';
import { subscribeDispatch } from '../../services/dispatchService';
import { openNativeDriverApp, getDriverApkDownloadUrl, DRIVER_APP_VERSION_NAME } from '../../utils/driverNativeConstants';
import { unlockDriverAudio } from '../../utils/orderAlertSound';

/**
 * App de clientes (PWA): solo avisos tipo WhatsApp.
 * No muestra ni acepta pedidos — eso es solo la APK nativa.
 */
export function DriverNotifyHome() {
  const { profile, signOut } = useAuth();
  const [pending, setPending] = useState(0);
  const [pushOk, setPushOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      await ensureMyDriverProfile().catch(() => {});
      const s = await getMyDriverSummary();
      const n = (s?.pendingOffers || []).length;
      setPending(n);
      if (n > 0) await setDriverAppBadge(n);
      else await clearDriverAppBadge();
    } catch {
      /* ignore */
    }
    try {
      setPushOk(Notification.permission === 'granted');
    } catch {
      setPushOk(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeDispatch(() => refresh());
    const t = setInterval(refresh, 8000);
    const onMsg = (event) => {
      if (event.data?.type === 'DRIVER_NEW_OFFER') {
        refresh();
        if (event.data?.fromClick) {
          setMsg('Abre la app nativa del repartidor para aceptar el pedido.');
        }
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMsg);
    }
    return () => {
      unsub();
      clearInterval(t);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onMsg);
      }
    };
  }, [refresh]);

  const enablePush = async () => {
    setBusy(true);
    setMsg('');
    try {
      await unlockDriverAudio();
      await ensureDriverPushSubscription();
      setPushOk(true);
      setMsg('Notificaciones activadas. Los pedidos nuevos llegarán a la bandeja.');
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Activa las notificaciones en Ajustes del celular.');
    } finally {
      setBusy(false);
    }
  };

  const name = profile?.fullName || profile?.full_name || 'Repartidor';

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-10">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="bg-black px-4 py-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Avisos repartidor</p>
          <h1 className="mt-1 text-xl font-black">Notificaciones tipo WhatsApp</h1>
          <p className="mt-1.5 text-sm text-white/70">
            Hola {name}. Esta app solo te avisa pedidos nuevos en la bandeja.
            Para aceptar y GPS usa la app nativa.
          </p>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className={`flex gap-3 rounded-xl border px-3 py-3 ${pushOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${pushOk ? 'bg-emerald-500' : 'bg-pollon-red'} text-white`}>
              {pushOk ? <CheckCircle2 className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">
                {pushOk ? 'Avisos activos' : 'Activa las notificaciones'}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {pushOk
                  ? 'Con pantalla apagada también llega el aviso a la bandeja, con detalle del pedido y número en el ícono.'
                  : 'Permite notificaciones para recibir cada pedido nuevo como un mensaje de WhatsApp.'}
              </p>
              {!pushOk && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={enablePush}
                  className="mt-2 rounded-xl bg-pollon-red px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? 'Activando…' : 'Activar notificaciones'}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">Pedidos nuevos avisados</p>
              <span className="rounded-full bg-pollon-red px-2.5 py-1 text-xs font-bold text-white">
                {pending}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              El contador del ícono se actualiza como WhatsApp. Aquí no se aceptan pedidos.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 px-3 py-3">
            <div className="flex items-start gap-2.5">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-pollon-red" />
              <div>
                <p className="text-sm font-bold text-gray-900">Aceptar solo en la app nativa</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                  La tarjeta Aceptar / Rechazar, la alarma y el GPS en vivo estánen en la APK del repartidor
                  (v{DRIVER_APP_VERSION_NAME}), aunque apagues la pantalla o abras otra app.
                </p>
                <button
                  type="button"
                  onClick={() => openNativeDriverApp()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-black px-3.5 py-2.5 text-sm font-bold text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir app nativa
                </button>
                <a
                  href={getDriverApkDownloadUrl()}
                  className="mt-2 block text-xs font-semibold text-pollon-red underline"
                >
                  Si no la tienes: descargar APK
                </a>
              </div>
            </div>
          </div>

          {msg && (
            <p className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">{msg}</p>
          )}

          <button
            type="button"
            onClick={async () => {
              await clearDriverAppBadge();
              await signOut();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 py-3 text-sm font-bold text-gray-700"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
