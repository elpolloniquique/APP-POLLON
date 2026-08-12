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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { unlockDriverAudio } from '../../utils/orderAlertSound';
import {
  evaluateDriverLiveTrackingReady,
  completeDriverLiveTrackingSetup,
  markDriverOnboardingComplete,
} from '../../services/driverOnboardingService';
import { ensureNativePushRegistration } from '../../services/fcmService';
import {
  openNativeLocationSettings,
  requestAlwaysLocationPermission,
  checkLocationPermissionSnapshot,
  isNativeDriverApp,
} from '../../services/backgroundGpsService';
import { isDriverRole } from '../../services/authService';
import {
  DRIVER_APP_VERSION_NAME,
  DRIVER_APP_VERSION_CODE,
  getDriverApkDownloadUrl,
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

  if (!driverRole) return null;

  const apkUrl = state?.apkUrl || getDriverApkDownloadUrl();

  const runDownloadApk = () => {
    setMsg('Descargando APK… Si Android bloquea, permite “Instalar apps desconocidas”.');
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = 'El-Pollon-repartidor.apk';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const runNotif = async () => {
    setStepBusy('notif');
    setMsg('');
    try {
      await unlockDriverAudio();
      const res = await ensureNativePushRegistration();
      if (res.reason === 'denied') {
        setMsg('Debes permitir notificaciones en Ajustes del celular.');
      } else if (res.ok && res.token) {
        try { localStorage.setItem('pollon_native_notif_ok', '1'); } catch { /* ignore */ }
        setMsg('Notificaciones listas. Te avisaremos aunque la pantalla esté apagada.');
      } else if (res.ok) {
        setMsg('Permiso OK. Espera unos segundos a que Firebase registre el token, o reintenta.');
      } else if (res.permissionGranted) {
        setMsg(
          'Permiso OK. Si no llega el token FCM, reinstala la APK con google-services.json. Puedes seguir con GPS.'
        );
      } else {
        setMsg(res.error || 'No se pudo registrar push. Revisa permisos e inténtalo de nuevo.');
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
          <h1 className="driver-native-gate__title">Instala la app oficial</h1>
          <p className="driver-native-gate__lead">
            Hola <strong>{name}</strong>
            {email ? <> (<span>{email}</span>)</> : null}.
            Los repartidores deben usar la <strong>APK nativa</strong> para GPS con pantalla apagada
            y notificaciones tipo WhatsApp. La PWA de clientes no alcanza.
          </p>

          <ul className="driver-native-gate__benefits">
            <li>GPS en vivo aunque apagues la pantalla</li>
            <li>Avisos de pedido a la bandeja del celular</li>
            <li>El local te ve en el mapa En vivo</li>
          </ul>

          <button type="button" className="driver-native-gate__cta" onClick={runDownloadApk}>
            <Download className="h-5 w-5" />
            Descargar El-Pollon-repartidor.apk
          </button>

          <ol className="driver-native-gate__howto">
            <li>Descarga e instala la APK (permite apps desconocidas si Android lo pide).</li>
            <li>Abre <strong>El Pollón</strong> desde el ícono de la app.</li>
            <li>Inicia sesión con este mismo correo de repartidor.</li>
            <li>Activa notificaciones + ubicación “Permitir todo el tiempo”.</li>
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
      body: 'Obligatorio “Siempre” para que caja y admin te vean con la pantalla apagada.',
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
                  {!s.ok && (
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
