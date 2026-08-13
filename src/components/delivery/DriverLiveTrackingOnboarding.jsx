import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  MapPin,
  Smartphone,
  CheckCircle2,
  Settings,
  Radio,
  Download,
  Battery,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { unlockDriverAudio } from '../../utils/orderAlertSound';
import {
  evaluateDriverLiveTrackingReady,
  completeDriverLiveTrackingSetup,
  markDriverOnboardingComplete,
} from '../../services/driverOnboardingService';
import { ensureNativePushRegistration, markNativeNotifOk, kickoffNativePushRegistration } from '../../services/fcmService';
import {
  openNativeLocationSettings,
  openNativeAppSettings,
  requestAlwaysLocationPermission,
  checkLocationPermissionSnapshot,
  isNativeDriverApp,
} from '../../services/backgroundGpsService';
import { isDriverRole } from '../../services/authService';
import {
  DRIVER_APP_VERSION_NAME,
  DRIVER_APP_VERSION_CODE,
  getDriverApkDownloadUrl,
  openNativeDriverApp,
  shouldSkipNativeAutoOpen,
} from '../../utils/driverNativeConstants';
import '../../styles/driver-native.css';

/**
 * Onboarding / NativeGate obligatorio para repartidores.
 * Sin APK Capacitor → bloqueo + descarga. Con APK → notifs + GPS Always.
 */
export function DriverLiveTrackingOnboarding({ onReadyChange }) {
  const { user, profile, role } = useAuth();
  const userId = user?.id || profile?.id || 'anon';
  const driverRole = isDriverRole(role || profile?.rol || profile?.role);

  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [stepBusy, setStepBusy] = useState('');

  const refresh = useCallback(async () => {
    try {
      const s = await evaluateDriverLiveTrackingReady(userId);
      setState(s);
      onReadyChange?.(s.ready);
      if (s.ready) {
        markDriverOnboardingComplete(userId, { alwaysOk: s.alwaysOk, pushOk: s.notifOk });
      }
      return s;
    } catch (err) {
      console.warn('[Pollón][DriverNative] onboarding evaluate:', err);
      setState({
        ready: false,
        installed: false,
        needsInstall: true,
        mustNative: true,
        notifOk: false,
        gpsOk: false,
        apkUrl: getDriverApkDownloadUrl(),
        versionName: DRIVER_APP_VERSION_NAME,
        versionCode: DRIVER_APP_VERSION_CODE,
      });
      onReadyChange?.(false);
      return null;
    }
  }, [userId, onReadyChange]);

  useEffect(() => {
    if (!driverRole) {
      onReadyChange?.(true);
      return undefined;
    }
    let cancelled = false;
    refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh, driverRole, onReadyChange]);

  useEffect(() => {
    if (!driverRole || isNativeDriverApp()) return undefined;
    if (shouldSkipNativeAutoOpen()) return undefined;
    const key = 'pollon_tried_native_open';
    try {
      if (sessionStorage.getItem(key) === '1') return undefined;
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    setMsg('Abriendo tu app nativa de repartidor…');
    const t = setTimeout(() => openNativeDriverApp(), 250);
    return () => clearTimeout(t);
  }, [driverRole]);

  if (!driverRole) return null;

  const apkUrl = state?.apkUrl || getDriverApkDownloadUrl();

  const runOpenNative = () => {
    setMsg('Abriendo tu app nativa…');
    openNativeDriverApp();
  };

  const runDownloadApk = () => {
    setMsg('Si ya tienes la app nativa, pulsa “Abrir panel”. Si no, permitiendo la descarga…');
    try {
      const w = window.open(apkUrl, '_blank', 'noopener');
      if (!w) window.location.assign(apkUrl);
    } catch {
      window.location.assign(apkUrl);
    }
  };

  const runNotif = async () => {
    setStepBusy('notif');
    setMsg('Si Android muestra el diálogo, toca Permitir…');
    // Auto-liberar el botón sí o sí (evita “Espera…” eterno en v1.2.2 y OEM rotos)
    const unlockBtn = setTimeout(() => setStepBusy(''), 3500);
    try {
      const res = await Promise.race([
        ensureNativePushRegistration(),
        new Promise((resolve) => setTimeout(() => resolve({ softTimeout: true }), 3000)),
      ]);

      // Desbloquear onboarding aunque FCM no responda: el token sigue en background
      markNativeNotifOk();
      kickoffNativePushRegistration();

      if (res?.reason === 'denied' && !res?.softTimeout && res?.permission?.receive === 'denied') {
        setMsg('Notificaciones bloqueadas. Ábrelas en Ajustes o pulsa “Ya las activé”.');
      } else if (res?.ok || res?.permissionGranted) {
        setMsg(
          res.token
            ? 'Notificaciones listas.'
            : 'Permiso OK. Puedes entrar al panel; el aviso push se completa en segundo plano.'
        );
      } else {
        setMsg('Si no viste el diálogo: Ajustes → El Pollón → Notificaciones → Activar, luego “Ya las activé”.');
      }
      await refresh();
    } catch (err) {
      markNativeNotifOk();
      setMsg(err.message || 'Revisa notificaciones en Ajustes y pulsa “Ya las activé”.');
      await refresh();
    } finally {
      clearTimeout(unlockBtn);
      setStepBusy('');
    }
  };

  const confirmNotifManual = async () => {
    try {
      localStorage.setItem(`pollon_driver_notif_confirmed_${userId}`, '1');
    } catch {
      /* ignore */
    }
    markNativeNotifOk();
    kickoffNativePushRegistration();
    setMsg('Notificaciones confirmadas. Puedes entrar al panel.');
    await refresh();
  };

  const runGps = async () => {
    setStepBusy('gps');
    setMsg('');
    try {
      await unlockDriverAudio();
      const res = await requestAlwaysLocationPermission();
      if (!res.ok) throw new Error(res.error || 'GPS denegado');
      if (!res.alwaysOk) {
        setMsg('Casi listo: Ajustes → El Pollón → Ubicación → “Permitir todo el tiempo”.');
      } else {
        setMsg('Ubicación “Siempre” autorizada.');
      }
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Activa la ubicación del celular');
    } finally {
      setStepBusy('');
    }
  };

  const confirmAlwaysManual = async () => {
    try {
      localStorage.setItem(`pollon_driver_always_confirmed_${userId}`, '1');
    } catch {
      /* ignore */
    }
    setMsg('Confirmado. Verificando…');
    await refresh();
  };

  const verifyAfterSettings = async () => {
    setStepBusy('verify');
    setMsg('');
    try {
      const snap = await checkLocationPermissionSnapshot();
      if (isNativeDriverApp() && !snap.alwaysOk) {
        setMsg('Aún no está en “Siempre”. Ábrelo en Ajustes o confirma si ya lo cambiaste.');
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
      if (!done.ok) setMsg(done.error || 'Completa los pasos');
      else setMsg('Configuración completa.');
      await refresh();
    } catch (err) {
      setMsg(err.message || 'Error al completar');
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="driver-native-gate">
        <p className="driver-native-gate__loading">Verificando cuenta de repartidor…</p>
        <button
          type="button"
          className="driver-native-gate__cta"
          style={{ marginTop: 16, maxWidth: 280 }}
          onClick={() => refresh()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (state.ready) return null;

  const email = user?.email || profile?.email || '';
  const name = profile?.fullName || profile?.full_name || 'Repartidor';
  const needsApk = state.needsInstall || !state.native;

  // ─── GATE: sin APK nativa ───
  if (needsApk) {
    return (
      <div className="driver-native-gate">
        <div className="driver-native-gate__card">
          <img src="/img/logo pollon.png" alt="El Pollón" className="driver-native-gate__logo" />
          <p className="driver-native-gate__brand">EL POLLÓN</p>
          <p className="driver-native-gate__badge">App nativa repartidor</p>
          <h1 className="driver-native-gate__title">Abre tu panel de repartidor</h1>
          <p className="driver-native-gate__lead">
            Hola <strong>{name}</strong>
            {email ? <> (<span>{email}</span>)</> : null}.
            Esta es la app de <strong>clientes</strong>. Si ya tienes instalada la APK nativa
            en este teléfono, ábrela: ahí está tu panel (GPS y pedidos).
          </p>

          <ul className="driver-native-gate__benefits">
            <li>Si ya la instalaste, no vuelvas a descargar: ábrela</li>
            <li>GPS y alertas de pedido viven en la app nativa</li>
            <li>Entra con el mismo correo de repartidor</li>
          </ul>

          <button type="button" className="driver-native-gate__cta" onClick={runOpenNative}>
            <ExternalLink className="h-5 w-5" />
            Abrir panel de repartidor
          </button>
          <button type="button" className="driver-native-gate__cta driver-native-gate__cta--ghost" onClick={runDownloadApk}>
            <Download className="h-5 w-5" />
            Descargar APK (solo si no la tienes)
          </button>

          <ol className="driver-native-gate__howto">
            <li>Pulsa <strong>Abrir panel de repartidor</strong> si la app nativa ya está instalada.</li>
            <li>Si Android pregunta, elige <strong>El Pollón</strong> (app nativa, no el navegador).</li>
            <li>Solo si no la tienes: descarga la APK, instálala y entra con este correo.</li>
          </ol>

          <p className="driver-native-gate__meta">
            v{DRIVER_APP_VERSION_NAME} ({DRIVER_APP_VERSION_CODE}) · Android
          </p>
          {msg && <p className="driver-native-gate__msg">{msg}</p>}
        </div>
      </div>
    );
  }

  // ─── ONBOARDING nativo ───
  const steps = [
    {
      id: 'notif',
      ok: state.notifOk,
      icon: Bell,
      title: 'Notificaciones',
      body: 'Permiso del sistema para avisos de pedido nuevo (bandeja, con pantalla apagada).',
      action: runNotif,
      actionLabel: 'Activar notificaciones',
    },
    {
      id: 'gps',
      ok: state.gpsOk,
      icon: MapPin,
      title: 'Ubicación · Permitir todo el tiempo',
      body: 'Obligatorio “Siempre”. Acepta también “Sin restricciones de batería” para no perder el GPS al apagar la pantalla o abrir otra app.',
      action: runGps,
      actionLabel: 'Autorizar ubicación',
    },
  ];

  return (
    <div className="driver-native-gate driver-native-gate--onboard">
      <div className="driver-native-gate__card">
        <img src="/img/logo pollon.png" alt="" className="driver-native-gate__logo driver-native-gate__logo--sm" />
        <p className="driver-native-gate__brand">EL POLLÓN</p>
        <p className="driver-native-gate__badge">Configuración obligatoria</p>
        <h1 className="driver-native-gate__title">Listo para salir a ruta</h1>
        <p className="driver-native-gate__lead">
          App nativa detectada · v{state.versionName || DRIVER_APP_VERSION_NAME}
          {state.evaluateTimedOut ? ' · (reintento de permisos disponible)' : ''}
        </p>

        <div className="driver-native-gate__hint">
          <Radio className="h-4 w-4 shrink-0" />
          <p>
            Al conectar <strong>Disponible</strong>, el local verá tu GPS en vivo.
            Completa notificaciones y ubicación “Siempre”.
          </p>
        </div>

        <ol className="driver-native-steps">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <li key={s.id} className={`driver-native-step ${s.ok ? 'is-ok' : ''}`}>
                <span className="driver-native-step__icon">
                  {s.ok ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="driver-native-step__title">{idx + 1}. {s.title}</p>
                  <p className="driver-native-step__body">{s.body}</p>
                  {!s.ok && s.id === 'notif' && (
                    <>
                      <button
                        type="button"
                        className="driver-native-step__btn"
                        disabled={stepBusy === 'notif' || busy}
                        onClick={s.action}
                      >
                        {stepBusy === s.id ? 'Espera…' : s.actionLabel}
                      </button>
                      <div className="driver-native-gate__oem-actions" style={{ marginTop: 10 }}>
                        <button type="button" onClick={() => openNativeAppSettings()}>
                          Abrir ajustes
                        </button>
                        <button type="button" onClick={confirmNotifManual}>
                          Ya las activé
                        </button>
                      </div>
                    </>
                  )}
                  {!s.ok && s.id !== 'notif' && (
                    <button
                      type="button"
                      className="driver-native-step__btn"
                      disabled={Boolean(stepBusy) || busy}
                      onClick={s.action}
                    >
                      {stepBusy === s.id ? 'Espera…' : s.actionLabel}
                    </button>
                  )}
                  {s.ok && <p className="driver-native-step__done">Completado</p>}
                </div>
              </li>
            );
          })}
        </ol>

        {state.locationOk && !state.alwaysOk && (
          <div className="driver-native-gate__oem">
            <Settings className="h-4 w-4" />
            <div>
              <p>Ajustes → El Pollón → Ubicación → <strong>Permitir todo el tiempo</strong></p>
              <div className="driver-native-gate__oem-actions">
                <button type="button" onClick={() => openNativeLocationSettings()}>
                  Abrir ajustes
                </button>
                <button type="button" onClick={confirmAlwaysManual}>
                  Ya lo cambié
                </button>
                <button type="button" disabled={stepBusy === 'verify'} onClick={verifyAfterSettings}>
                  Verificar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="driver-native-gate__oem driver-native-gate__oem--battery">
          <Battery className="h-4 w-4" />
          <p>
            Xiaomi / Huawei / Samsung: desactiva la optimización de batería para El Pollón
            (si no, el GPS puede pausarse).
          </p>
        </div>

        <button
          type="button"
          className="driver-native-gate__cta"
          disabled={busy || !state.notifOk || !state.gpsOk}
          onClick={finishAll}
        >
          <ShieldCheck className="h-5 w-5" />
          {busy ? 'Guardando…' : 'Entrar al panel repartidor'}
        </button>

        {msg && <p className="driver-native-gate__msg">{msg}</p>}
      </div>
    </div>
  );
}
