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
import { playDriverOrderAlarm } from '../../utils/orderAlertSound';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';

export function DriverHome() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsPos, setGpsPos] = useState(null);
  const [error, setError] = useState('');
  const [stopGps, setStopGps] = useState(null);
  const [branch, setBranch] = useState(null);
  const [permsReady, setPermsReady] = useState(false);

  const publishRef = useRef(false);
  const seenOffersRef = useRef(new Set());
  const alertReadyRef = useRef(false);
  const stopAlarmRef = useRef(null);

  const load = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeDispatch(() => load());
    const t = setInterval(load, 8000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  useEffect(() => () => {
    stopGps?.();
    stopAlarmRef.current?.();
  }, [stopGps]);

  // Refrescar suscripción push si ya hay permiso (tras actualizar SW)
  useEffect(() => {
    if (getNotificationPermission() === 'granted') {
      ensureDriverPushSubscription().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const offers = summary?.pendingOffers || [];
    if (!alertReadyRef.current) {
      offers.forEach((o) => seenOffersRef.current.add(o.id));
      alertReadyRef.current = true;
      return undefined;
    }

    let hasNew = false;
    for (const o of offers) {
      if (!seenOffersRef.current.has(o.id)) {
        seenOffersRef.current.add(o.id);
        hasNew = true;
      }
    }
    const live = new Set(offers.map((o) => o.id));
    for (const id of [...seenOffersRef.current]) {
      if (!live.has(id)) seenOffersRef.current.delete(id);
    }

    if (hasNew && offers.length) {
      stopAlarmRef.current?.();
      stopAlarmRef.current = playDriverOrderAlarm({ loops: 4 });
      try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch { /* ignore */ }
    }

    if (!offers.length) {
      stopAlarmRef.current?.();
      stopAlarmRef.current = null;
    }

    return undefined;
  }, [summary?.pendingOffers]);

  const goOffline = useCallback(async (reason) => {
    try {
      await setMyOperationalStatus('offline');
    } catch {
      /* ignore */
    }
    stopGps?.();
    setStopGps(null);
    setGpsOn(false);
    setGpsPos(null);
    publishRef.current = false;
    if (reason) setError(reason);
    await load();
  }, [load, stopGps]);

  // Si revoca notificaciones o GPS mientras está en línea → offline
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

  const startGps = (publish) => {
    publishRef.current = !!publish;
    stopGps?.();
    const stop = startGpsWatch(
      (pos, err) => {
        if (pos) setGpsPos(pos);
        if (err) {
          setError(err.message || 'Error GPS');
          if (err?.code === 1) {
            goOffline('Permiso de ubicación denegado. Activa el GPS para trabajar.');
          }
        }
      },
      { publishRef }
    );
    setStopGps(() => stop);
    setGpsOn(true);
  };

  const toggleOnline = async () => {
    const currentlyOnline = ['available', 'heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(
      summary?.driver?.operational_status
    );
    const next = currentlyOnline ? 'offline' : 'available';
    setBusy(true);
    setError('');
    try {
      if (next === 'available') {
        if (!permsReady) {
          throw new Error('Primero completa: instalar app, notificaciones y GPS.');
        }
        if (getNotificationPermission() !== 'granted') {
          throw new Error('Debes permitir las notificaciones del sistema.');
        }
        await ensureDriverPushSubscription();
        const gps = await requestGpsFix();
        if (!gps.ok) throw new Error(gps.error || 'GPS obligatorio');
      }

      await setMyOperationalStatus(next);
      if (next === 'available') {
        const hasActive = (summary?.activeAssignments || []).length > 0;
        startGps(hasActive);
      } else {
        stopGps?.();
        setStopGps(null);
        setGpsOn(false);
        setGpsPos(null);
        publishRef.current = false;
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
      await acceptOffer(offer.id);
      publishRef.current = true;
      if (!gpsOn) startGps(true);
      else publishRef.current = true;
      await load();
    } catch (err) {
      setError(err.message);
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
      if ((summary?.activeAssignments || []).length <= 1) publishRef.current = false;
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
  const maxOrders = summary?.driver?.max_orders || 3;
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
            GPS: {gpsOn ? (gpsPos ? 'Encendido' : 'Buscando…') : 'Apagado'}
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {offers.map((offer) => (
          <DriverOfferCard
            key={offer.id}
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
            ? 'Esperando pedidos… Llegarán a la bandeja de notificaciones aunque la pantalla esté apagada.'
            : permsReady
              ? 'Pulsa Conectarme para recibir pedidos.'
              : 'Completa los permisos de arriba (app, notificaciones y GPS).'}
        </div>
      )}
    </div>
  );
}
