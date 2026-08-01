import { useCallback, useEffect, useRef, useState } from 'react';
import { DriverOfferCard } from '../../components/delivery/DriverOfferCard';
import { DriverActiveOrderCard } from '../../components/delivery/DriverActiveOrderCard';
import { DriverPermissionsGate } from '../../components/delivery/DriverPermissionsGate';
import {
  ensureMyDriverProfile,
  getMyDriverSummary,
  setMyOperationalStatus,
} from '../../services/driverService';
import {
  acceptOffer,
  rejectOffer,
  confirmPickup,
  confirmDelivery,
  subscribeDispatch,
} from '../../services/dispatchService';
import { startGpsWatch } from '../../services/trackingService';
import {
  ensureDriverPushSubscription,
  getNotificationPermission,
  requestGpsFix,
} from '../../services/pushService';
import {
  startDriverBackgroundGps,
  stopDriverBackgroundGps,
  isNativeDriverApp,
  requestAlwaysLocationPermission,
  openNativeLocationSettings,
} from '../../services/backgroundGpsService';
import { playDriverOrderAlarm, unlockDriverAudio } from '../../utils/orderAlertSound';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';

function offerAlarmKey(o) {
  return `${o.id}|${o.expires_at || ''}`;
}

export function DriverHome() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsPos, setGpsPos] = useState(null);
  const [error, setError] = useState('');
  const [branch, setBranch] = useState(null);
  const [permsReady, setPermsReady] = useState(false);

  const publishRef = useRef(false);
  const alarmedKeysRef = useRef(new Set());
  const alertReadyRef = useRef(false);
  const stopAlarmRef = useRef(null);
  const loadTimerRef = useRef(null);
  const loadingRef = useRef(false);
  /** null | 'idle' | 'active' — evita reiniciar GPS en cada poll */
  const gpsModeRef = useRef(null);
  const stopGpsFnRef = useRef(null);

  const playOfferAlarmOnce = useCallback((keys) => {
    const fresh = keys.filter((k) => k && !alarmedKeysRef.current.has(k));
    if (!fresh.length) return;
    fresh.forEach((k) => alarmedKeysRef.current.add(k));
    if (alarmedKeysRef.current.size > 80) {
      alarmedKeysRef.current = new Set([...alarmedKeysRef.current].slice(-40));
    }
    stopAlarmRef.current?.();
    unlockDriverAudio().then(() => {
      stopAlarmRef.current?.();
      // Una sola campanada por ronda (aunque lleguen varios a la vez)
      stopAlarmRef.current = playDriverOrderAlarm({ loops: 1 });
    });
    try { navigator.vibrate?.([200, 100, 400]); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      await ensureMyDriverProfile();
      const s = await getMyDriverSummary();
      setSummary(s);
      setError('');

      const hasActive = (s?.activeAssignments || []).length > 0;
      publishRef.current = hasActive;

      if (isSupabaseConfigured()) {
        const sb = getSupabase();
        const branchId =
          s?.driver?.preferred_branch_id
          || s?.activeAssignments?.[0]?.ep_delivery_jobs?.branch_id;
        if (branchId) {
          const { data } = await sb
            .from('branches')
            .select('lat,lng,name,address,city')
            .eq('id', branchId)
            .maybeSingle();
          if (data) {
            setBranch({
              lat: data.lat != null ? Number(data.lat) : null,
              lng: data.lng != null ? Number(data.lng) : null,
              name: data.name,
              address: data.address,
              city: data.city || 'Iquique',
            });
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Error al cargar. ¿Ejecutaste la migración SQL?');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const scheduleLoad = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => { load(); }, 450);
  }, [load]);

  useEffect(() => {
    load();
    const unsub = subscribeDispatch(() => scheduleLoad());
    const pollMs = () => (document.visibilityState === 'visible' ? 4000 : 12000);
    let t = setInterval(scheduleLoad, pollMs());
    const onVis = () => {
      clearInterval(t);
      if (document.visibilityState === 'visible') {
        unlockDriverAudio();
        scheduleLoad();
      }
      t = setInterval(scheduleLoad, pollMs());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      unsub();
      clearInterval(t);
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, scheduleLoad]);

  // Push: solo refrescar lista; la alarma in-app la dispara el efecto de ofertas (1 vez)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (event) => {
      const data = event.data;
      if (!data || data.type !== 'DRIVER_NEW_OFFER') return;
      scheduleLoad();
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [scheduleLoad]);

  useEffect(() => () => {
    stopGpsFnRef.current?.();
    void stopDriverBackgroundGps();
    stopAlarmRef.current?.();
  }, []);

  useEffect(() => {
    if (getNotificationPermission() === 'granted') {
      ensureDriverPushSubscription().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const offers = summary?.pendingOffers || [];
    if (!alertReadyRef.current) {
      offers.forEach((o) => alarmedKeysRef.current.add(offerAlarmKey(o)));
      alertReadyRef.current = true;
      return undefined;
    }

    const newKeys = [];
    for (const o of offers) {
      const key = offerAlarmKey(o);
      if (!alarmedKeysRef.current.has(key)) newKeys.push(key);
    }

    if (newKeys.length) {
      playOfferAlarmOnce(newKeys);
    }

    if (!offers.length) {
      stopAlarmRef.current?.();
      stopAlarmRef.current = null;
    }

    return undefined;
  }, [summary?.pendingOffers, playOfferAlarmOnce]);

  const clearGps = useCallback(async () => {
    stopGpsFnRef.current?.();
    stopGpsFnRef.current = null;
    await stopDriverBackgroundGps();
    setGpsOn(false);
    setGpsPos(null);
    publishRef.current = false;
    gpsModeRef.current = null;
  }, []);

  const goOffline = useCallback(async (reason) => {
    try {
      await setMyOperationalStatus('offline');
    } catch {
      /* ignore */
    }
    await clearGps();
    if (reason) setError(reason);
    await load();
  }, [load, clearGps]);

  useEffect(() => {
    const onlineStatuses = ['available', 'heading_to_branch', 'delivering', 'carrying_orders', 'offered'];
    const isOnlineNow = onlineStatuses.includes(summary?.driver?.operational_status);
    if (!isOnlineNow) return undefined;

    const check = async () => {
      if (getNotificationPermission() !== 'granted') {
        await goOffline('Se desactivaron las notificaciones. Vuelve a autorizarlas para trabajar.');
        return;
      }
      try {
        if (navigator.permissions?.query) {
          const st = await navigator.permissions.query({ name: 'geolocation' });
          if (st.state === 'denied') {
            await goOffline('Se desactivó el GPS. Activa la ubicación para seguir en línea.');
          }
        }
      } catch {
        /* ignore */
      }
    };

    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [summary?.driver?.operational_status, goOffline]);

  const startGps = useCallback(async (publish) => {
    publishRef.current = !!publish;
    stopGpsFnRef.current?.();
    stopGpsFnRef.current = null;
    await stopDriverBackgroundGps();

    // Pedidos activos en app nativa → GPS segundo plano (pantalla apagada)
    if (publish && isNativeDriverApp()) {
      const res = await startDriverBackgroundGps({
        onUpdate: (pos, err) => {
          if (pos) setGpsPos(pos);
          if (err) setError(err.message || 'Error GPS');
        },
      });
      if (!res.ok) {
        setError(res.error || 'No se pudo activar GPS en segundo plano');
        if (res.canOpenSettings) {
          setError(
            `${res.error || 'GPS en segundo plano'} Abre ajustes y elige “Permitir todo el tiempo”.`
          );
        }
        const stop = startGpsWatch(
          (pos, err) => {
            if (pos) setGpsPos(pos);
            if (err) setError(err.message || 'Error GPS');
          },
          { publishRef, intervalMs: 5000 }
        );
        stopGpsFnRef.current = stop;
        setGpsOn(true);
        gpsModeRef.current = 'active';
        return res;
      }
      if (res.needsSettings) {
        setError(
          'GPS activo. Para no perderte con pantalla apagada: Ajustes → Ubicación → Permitir todo el tiempo.'
        );
      }
      const stopNative = () => { void stopDriverBackgroundGps(); };
      stopGpsFnRef.current = stopNative;
      setGpsOn(true);
      gpsModeRef.current = 'active';
      return res;
    }

    const stop = startGpsWatch(
      (pos, err) => {
        if (pos) setGpsPos(pos);
        if (err) {
          setError(err.message || 'Error GPS');
          if (err?.code === 1) {
            void goOffline('Permiso de ubicación denegado. Activa el GPS para trabajar.');
          }
        }
      },
      { publishRef, intervalMs: 5000 }
    );
    stopGpsFnRef.current = stop;
    setGpsOn(true);
    gpsModeRef.current = publish ? 'active' : 'idle';
    return { ok: true, mode: 'web' };
  }, [goOffline]);

  // Activos → background; sin activos (pero en línea) → GPS liviano sin publicar
  useEffect(() => {
    const activesCount = summary?.activeAssignments?.length ?? 0;
    const onlineStatuses = ['available', 'heading_to_branch', 'delivering', 'carrying_orders', 'offered'];
    const isOnlineNow = onlineStatuses.includes(summary?.driver?.operational_status);

    if (!isOnlineNow) {
      if (gpsModeRef.current) void clearGps();
      return undefined;
    }

    if (activesCount > 0) {
      if (gpsModeRef.current !== 'active') void startGps(true);
    } else if (gpsModeRef.current !== 'idle') {
      void startGps(false);
    }
    return undefined;
  }, [
    summary?.activeAssignments?.length,
    summary?.driver?.operational_status,
    startGps,
    clearGps,
  ]);

  const toggleOnline = async () => {
    const currentlyOnline = ['available', 'heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(
      summary?.driver?.operational_status
    );
    const next = currentlyOnline ? 'offline' : 'available';
    setBusy(true);
    setError('');
    try {
      await unlockDriverAudio();
      if (next === 'available') {
        if (!permsReady) {
          throw new Error('Primero completa: instalar app, notificaciones y GPS.');
        }
        if (getNotificationPermission() !== 'granted') {
          throw new Error('Debes permitir las notificaciones del sistema.');
        }
        await ensureDriverPushSubscription();
        if (isNativeDriverApp()) {
          const gps = await requestAlwaysLocationPermission();
          if (!gps.ok) throw new Error(gps.error || 'GPS obligatorio');
        } else {
          const gps = await requestGpsFix();
          if (!gps.ok) throw new Error(gps.error || 'GPS obligatorio');
        }
      }

      await setMyOperationalStatus(next);
      if (next === 'available') {
        const hasActive = (summary?.activeAssignments || []).length > 0;
        await startGps(hasActive);
      } else {
        await clearGps();
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async (offer) => {
    setBusy(true);
    try {
      stopAlarmRef.current?.();
      stopAlarmRef.current = null;
      // Al primer accept: pedir “Siempre” y arrancar background
      if (isNativeDriverApp()) {
        const perm = await requestAlwaysLocationPermission();
        if (perm.needsSettings) {
          setError(
            'Elige ubicación “Permitir todo el tiempo” para que el mapa te vea con la pantalla apagada.'
          );
        }
      }
      await acceptOffer(offer.id);
      publishRef.current = true;
      await startGps(true);
      await load();
    } catch (err) {
      const msg = err.message || '';
      if (/tomado por otro|ya no disponible|expirad/i.test(msg)) {
        setError('Ese pedido ya no está disponible.');
        await load();
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onReject = async (offer) => {
    setBusy(true);
    try {
      await rejectOffer(offer.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onPickup = async (assignment) => {
    setBusy(true);
    try {
      await confirmPickup(assignment.id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelivered = async (assignment) => {
    setBusy(true);
    try {
      await confirmDelivery(assignment.id);
      await load();
      // El efecto de actives baja GPS background → idle / stop
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const actives = summary?.activeAssignments || [];
  const offers = summary?.pendingOffers || [];
  const isOnline = summary?.driver?.operational_status === 'available'
    || ['heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(summary?.driver?.operational_status);
  const maxOrders = summary?.driver?.max_orders || 2;
  const driverName =
    summary?.driver?.profiles?.full_name
    || summary?.driver?.profiles?.nombre
    || 'repartidor';
  const branchCity = branch?.city || 'Iquique';
  const canGoOnline = permsReady && !busy && !loading;

  return (
    <div className="mx-auto max-w-lg space-y-3 p-3 sm:p-4">
      <DriverPermissionsGate onReadyChange={setPermsReady} />

      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Estado</p>
          <p className="text-lg font-bold text-gray-900">{isOnline ? 'En línea' : 'Desconectado'}</p>
          <p className={`text-sm font-semibold ${gpsOn ? 'text-emerald-600' : 'text-gray-400'}`}>
            GPS: {!gpsOn
              ? 'Apagado'
              : !gpsPos
                ? 'Buscando…'
                : (actives.length > 0 && isNativeDriverApp()
                  ? 'Segundo plano · En vivo'
                  : 'Encendido')}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-pollon-orange">
            Pedidos activos: {actives.length}/{maxOrders}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading || (!isOnline && !canGoOnline)}
          onClick={toggleOnline}
          title={!isOnline && !permsReady ? 'Completa permisos arriba primero' : undefined}
          className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 ${
            isOnline ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          {isOnline ? 'Disponible' : 'Conectarme'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error}</p>
          {isNativeDriverApp() && /ajustes|siempre|todo el tiempo/i.test(error) && (
            <button
              type="button"
              onClick={() => openNativeLocationSettings()}
              className="mt-2 text-xs font-bold underline"
            >
              Abrir ajustes de ubicación
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {offers.map((offer) => (
          <DriverOfferCard
            key={`${offer.id}-${offer.expires_at || ''}`}
            offer={offer}
            onAccept={onAccept}
            onReject={onReject}
            loading={busy}
            driverName={driverName}
            branchCity={branchCity}
          />
        ))}
      </div>

      <div className="space-y-3">
        {actives.map((active) => (
          <DriverActiveOrderCard
            key={active.id}
            assignment={active}
            branch={branch}
            driverName={driverName}
            branchCity={branchCity}
            loading={busy}
            onPickup={onPickup}
            onDelivered={onDelivered}
          />
        ))}
      </div>

      {!loading && offers.length === 0 && actives.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {isOnline
            ? 'Esperando pedidos… Oferta 2 min; si nadie acepta y sigue en Nuevo, reaparece a los 3 min. Máx. 2 pedidos activos.'
            : permsReady
              ? 'Pulsa Conectarme para recibir pedidos.'
              : 'Completa los permisos de arriba (app, notificaciones y GPS).'}
        </div>
      )}
    </div>
  );
}
