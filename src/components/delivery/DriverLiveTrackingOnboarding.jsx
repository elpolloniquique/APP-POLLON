import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  MapPin,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Settings,
  Radio,
  Download,
  Share,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { unlockDriverAudio } from '../../utils/orderAlertSound';
import {
  evaluateDriverLiveTrackingReady,
  completeDriverLiveTrackingSetup,
  markDriverOnboardingComplete,
} from '../../services/driverOnboardingService';
import { ensureDriverPushSubscription } from '../../services/pushService';
import {
  openNativeLocationSettings,
  requestAlwaysLocationPermission,
  checkLocationPermissionSnapshot,
  isNativeDriverApp,
} from '../../services/backgroundGpsService';
import {
  getDeferredInstallPrompt,
  promptPwaInstall,
  subscribeDeferredInstallPrompt,
} from '../../utils/pwaInstallBridge';
import { isIosSafari, isStandaloneDisplayMode } from '../../utils/pwa';
import { isDriverRole } from '../../services/authService';

/**
 * Pantalla completa SOLO si la cuenta es repartidor (role delivery).
 * Misma app El Pollón que clientes: instalar PWA → notifs → GPS.
 */
export function DriverLiveTrackingOnboarding({ onReadyChange }) {
  const { user, profile, role } = useAuth();
  const userId = user?.id || profile?.id || 'anon';
  const driverRole = isDriverRole(role || profile?.rol || profile?.role);

  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [stepBusy, setStepBusy] = useState('');
  const [canNativeInstall, setCanNativeInstall] = useState(Boolean(getDeferredInstallPrompt()));

  const refresh = useCallback(async () => {
    const s = await evaluateDriverLiveTrackingReady(userId);
    setState(s);
    onReadyChange?.(s.ready);
    if (s.ready) {
      markDriverOnboardingComplete(userId, { alwaysOk: s.alwaysOk });
    }
    return s;
  }, [userId, onReadyChange]);

  useEffect(() => {
    if (!driverRole) {
      onReadyChange?.(true);
      return undefined;
    }
    refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    const unsub = subscribeDeferredInstallPrompt((p) => setCanNativeInstall(Boolean(p)));
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      unsub();
    };
  }, [refresh, driverRole, onReadyChange]);

  // Si no es repartidor, no mostrar nunca
  if (!driverRole) return null;

  const runInstall = async () => {
    setStepBusy('install');
    setMsg('');
    try {
      if (isIosSafari()) {
        setMsg('En iPhone: Compartir → Agregar a pantalla de inicio. Luego abre El Pollón desde el ícono.');
        return;
      }
      const res = await promptPwaInstall();
      if (res.ok) {
        setMsg('App instalada. Ábrela desde el ícono de El Pollón e inicia sesión de nuevo.');
      } else if (!getDeferredInstallPrompt()) {
        setMsg(
          'Usa el menú ⋮ del navegador → “Instalar app” / “Agregar a pantalla de inicio”. Luego ábrela desde el ícono.'
        );
      } else {
        setMsg('Instalación cancelada. Debes instalar El Pollón para recibir pedidos.');
      }
      await refresh();
    } finally {
      setStepBusy('');
    }
  };

  const runNotif = async () => {
    setStepBusy('notif');
    setMsg('');
    try {
      await unlockDriverAudio();
      const res = await ensureDriverPushSubscription();
      if (res?.reloading) {
        setMsg('Reiniciando notificaciones…');
        return;
      }
      if (res?.deferred) {
        setMsg(
          res.warn
          || 'Permiso OK. Si no llegan a la bandeja, borra datos de el-pollon.cl en Chrome y reabre desde el ícono.'
        );
      } else {
        setMsg('Notificaciones listas. Te llegarán a la bandeja aunque la pantalla esté apagada.');
      }
      await refresh();
    } catch (err) {
      setMsg(err.message || 'No se pudieron activar las notificaciones');
    } finally {
      setStepBusy('');
    }
  };

  const runGps = async () => {
    setStepBusy('gps');
    setMsg('');
    try {
      await unlockDriverAudio();
      const res = await requestAlwaysLocationPermission();
      if (!res.ok) throw new Error(res.error || 'GPS denegado');
      if (isNativeDriverApp() && !res.alwaysOk) {
        setMsg(
          'Casi listo: en Ajustes del celular → El Pollón → Ubicación → “Permitir todo el tiempo”.'
        );
      } else {
        setMsg('Ubicación autorizada. El local te verá en vivo al conectarte.');
      }
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Activa la ubicación del celular');
    } finally {
      setStepBusy('');
    }
  };

  const verifyAfterSettings = async () => {
    setStepBusy('verify');
    setMsg('');
    try {
      const snap = await checkLocationPermissionSnapshot();
      if (state?.native && !snap.alwaysOk) {
        setMsg('Aún no está en “Siempre”. Ajustes → Apps → El Pollón → Ubicación → Permitir todo el tiempo.');
        await refresh();
        return;
      }
      const done = await completeDriverLiveTrackingSetup(userId);
      if (!done.ok) throw new Error(done.error || 'No completado');
      setMsg('Listo. Ya puedes recibir pedidos.');
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Verifica el permiso e inténtalo de nuevo');
    } finally {
      setStepBusy('');
    }
  };

  const finishAll = async () => {
    setBusy(true);
    setMsg('');
    try {
      await unlockDriverAudio();
      const done = await completeDriverLiveTrackingSetup(userId);
      if (!done.ok) {
        setMsg(done.error || 'Completa los pasos');
      } else {
        setMsg('Configuración completa.');
      }
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Error al completar');
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="flex min-h-[70dvh] items-center justify-center bg-[#1a1210] px-6 text-white">
        <p className="text-sm text-white/70">Verificando cuenta de repartidor…</p>
      </div>
    );
  }

  if (state.ready) return null;

  const email = user?.email || profile?.email || '';
  const name = profile?.fullName || profile?.full_name || 'Repartidor';

  const steps = [
    {
      id: 'install',
      ok: state.installed && !state.needsInstall,
      icon: Smartphone,
      title: 'Instalar app El Pollón',
      body: state.needsInstall
        ? 'Igual que los clientes: instala El Pollón en tu pantalla de inicio y ábrela desde el ícono (no desde el navegador).'
        : state.native || isStandaloneDisplayMode()
          ? 'App El Pollón detectada. Correcto.'
          : 'App lista.',
      action: state.needsInstall ? runInstall : null,
      actionLabel: isIosSafari()
        ? 'Ver cómo instalar'
        : canNativeInstall
          ? 'Instalar ahora'
          : 'Instrucciones de instalación',
    },
    {
      id: 'notif',
      ok: state.notifOk,
      icon: Bell,
      title: 'Notificaciones (bandeja)',
      body: state.pushDeferred
        ? 'Permiso concedido. El registro con Google se reintentará solo; si no llegan, borra datos del sitio y vuelve a activar.'
        : state.hasPushSub
          ? 'Push activo: te llegarán a la bandeja aunque la app esté cerrada o la pantalla apagada.'
          : 'Como WhatsApp: llegan a la bandeja aunque la app esté cerrada o la pantalla apagada.',
      action: runNotif,
      actionLabel: state.notifOk && !state.hasPushSub ? 'Reintentar push' : 'Activar notificaciones',
      disabled: state.needsInstall,
    },
    {
      id: 'gps',
      ok: state.gpsOk,
      icon: MapPin,
      title: state.native ? 'Ubicación · Permitir todo el tiempo' : 'Ubicación en tiempo real',
      body: state.native
        ? 'Obligatorio “Permitir todo el tiempo” para que caja, admin y despacho te vean con pantalla apagada.'
        : 'Obligatoria. Mientras estés Disponible, El Pollón compartirá tu posición en vivo con el local.',
      action: runGps,
      actionLabel: 'Autorizar ubicación',
      disabled: state.needsInstall,
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#1a1210] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(232,93,26,0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(180,30,30,0.25), transparent 50%)',
        }}
      />

      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-8 pt-10">
        <div className="mb-6 text-center">
          <img
            src="/img/logo pollon.png"
            alt="El Pollón"
            className="mx-auto h-20 w-20 rounded-full border-2 border-white/20 bg-white object-contain shadow-lg"
          />
          <p className="font-display mt-4 text-3xl tracking-tight text-[#f59a3d]">El Pollón</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
            Cuenta repartidor
          </p>
          <h1 className="mt-5 text-xl font-bold leading-snug text-white">
            Configuración obligatoria
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Detectamos que <strong className="text-white">{name}</strong>
            {email ? (
              <>
                {' '}(<span className="text-[#f59a3d]">{email}</span>)
              </>
            ) : null}
            {' '}es repartidor — no cliente ni caja ni admin.
            Debes usar la misma app El Pollón instalada y compartir ubicación en vivo.
          </p>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <Radio className="mt-0.5 h-5 w-5 shrink-0 text-[#f59a3d]" />
          <p className="text-xs leading-relaxed text-white/75">
            Al pulsar <strong className="text-white">Conectarme / Disponible</strong>, el local
            verá tu posición en el mapa. Mantén la app instalada y la sesión iniciada.
          </p>
        </div>

        <ol className="space-y-3">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <li
                key={s.id}
                className={`rounded-2xl border px-4 py-3.5 transition ${
                  s.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="flex gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      s.ok ? 'bg-emerald-500 text-white' : 'bg-[#e85d1a] text-white'
                    }`}
                  >
                    {s.ok ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">
              {idx + 1}. {s.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">{s.body}</p>

                    {s.id === 'install' && state.needsInstall && isIosSafari() && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1">
                          <Share className="h-3.5 w-3.5" /> Compartir
                        </span>
                        <span>→</span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1">
                          <Smartphone className="h-3.5 w-3.5" /> Agregar a inicio
                        </span>
                      </div>
                    )}

                    {!s.ok && s.action && (
                      <button
                        type="button"
                        disabled={Boolean(stepBusy) || busy || s.disabled}
                        onClick={s.action}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#e85d1a] px-4 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {s.id === 'install' && <Download className="h-3.5 w-3.5" />}
                        {stepBusy === s.id ? 'Espera…' : s.actionLabel}
                      </button>
                    )}
                    {s.ok && (
                      <p className="mt-2 text-xs font-semibold text-emerald-400">Completado</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {state.native && state.locationOk && !state.alwaysOk && (
          <div className="mt-4 space-y-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-amber-200">Ajustes del celular</p>
            <p className="text-[11px] leading-relaxed text-amber-100/80">
              Apps → El Pollón → Ubicación → <strong>Permitir todo el tiempo</strong>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={Boolean(stepBusy)}
                onClick={() => openNativeLocationSettings()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white"
              >
                <Settings className="h-3.5 w-3.5" />
                Abrir ajustes
              </button>
              <button
                type="button"
                disabled={Boolean(stepBusy)}
                onClick={verifyAfterSettings}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f59a3d] px-3 py-2 text-xs font-bold text-[#1a1210]"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {stepBusy === 'verify' ? 'Verificando…' : 'Ya lo configuré — Verificar'}
              </button>
            </div>
            <button
              type="button"
              disabled={Boolean(stepBusy) || busy}
              onClick={async () => {
                setStepBusy('confirm');
                try {
                  const snap = await checkLocationPermissionSnapshot();
                  if (!snap.locationOk) {
                    setMsg('Primero permite la ubicación de la app.');
                    return;
                  }
                  try {
                    localStorage.setItem(`pollon_driver_always_confirmed_${userId}`, '1');
                  } catch { /* ignore */ }
                  markDriverOnboardingComplete(userId, {
                    alwaysOk: true,
                    userConfirmedAlways: true,
                  });
                  setMsg('Confirmado.');
                  await refresh();
                } finally {
                  setStepBusy('');
                }
              }}
              className="w-full pt-1 text-left text-[11px] font-semibold text-amber-100/90 underline"
            >
              Ya elegí “Permitir todo el tiempo” — continuar
            </button>
          </div>
        )}

        {msg && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${
              /listo|completa|autorizada|Confirmado|App instalada|Verifica|Casi|Instrucciones|iPhone|menú/i.test(msg)
                ? 'bg-white/10 text-white/90'
                : 'bg-red-500/20 text-red-100'
            }`}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={busy || Boolean(stepBusy) || state.needsInstall}
          onClick={finishAll}
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#e85d1a] to-[#c62828] py-3.5 text-sm font-bold text-white shadow-lg transition active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? 'Validando…' : 'Confirmar y continuar'}
        </button>

        <p className="mt-4 text-center text-[10px] text-white/40">
          Solo cuentas con rol repartidor. Clientes, cajeras y administradores no ven esta pantalla.
        </p>
      </div>
    </div>
  );
}
