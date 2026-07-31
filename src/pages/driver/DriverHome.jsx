import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { DriverOfferCard } from '../../components/delivery/DriverOfferCard';
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
import { openExternalNavigation } from '../../utils/osrm';
import { playDriverOrderAlarm } from '../../utils/orderAlertSound';
import { money } from '../../utils/format';
import { getSupabase, isSupabaseConfigured } from '../../services/supabaseClient';

export function DriverHome() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsPos, setGpsPos] = useState(null);
  const [error, setError] = useState('');
  const [stopGps, setStopGps] = useState(null);
  const [branchCoords, setBranchCoords] = useState(null);

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
          const { data } = await sb.from('branches').select('lat,lng,name,address').eq('id', branchId).maybeSingle();
          if (data?.lat != null && data?.lng != null) {
            setBranchCoords({ lat: Number(data.lat), lng: Number(data.lng), name: data.name, address: data.address });
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

  // Alarma a máximo volumen cuando llega oferta nueva (se repite mientras haya pendientes)
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

  const startGps = (publish) => {
    publishRef.current = !!publish;
    stopGps?.();
    const stop = startGpsWatch(
      (pos, err) => {
        if (pos) setGpsPos(pos);
        if (err) setError(err.message || 'Error GPS');
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

  const actives = summary?.activeAssignments || [];
  const offers = summary?.pendingOffers || [];
  const isOnline = summary?.driver?.operational_status === 'available'
    || ['heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(summary?.driver?.operational_status);
  const maxOrders = summary?.driver?.max_orders || 3;

  return (
    <div className="mx-auto max-w-lg space-y-3 p-3 sm:p-4">
      {/* Card estado — como en la foto */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Estado</p>
          <p className="text-lg font-bold text-gray-900">{isOnline ? 'En línea' : 'Desconectado'}</p>
          <p className={`text-sm font-semibold ${gpsOn ? 'text-pollon-red' : 'text-gray-400'}`}>
            GPS: {gpsOn ? (gpsPos ? 'Encendido' : 'Buscando…') : 'Apagado'}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-pollon-orange">
            Pedidos activos: {actives.length}/{maxOrders}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={toggleOnline}
          className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-50 ${
            isOnline
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {isOnline ? 'Disponible' : 'Conectarme'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Lista de nuevos pedidos */}
      <div className="space-y-3">
        {offers.map((offer) => (
          <DriverOfferCard
            key={offer.id}
            offer={offer}
            onAccept={onAccept}
            onReject={onReject}
            loading={busy}
          />
        ))}
      </div>

      {/* Pedidos aceptados / en curso */}
      {actives.map((active) => {
        const job = active.ep_delivery_jobs;
        if (!job) return null;
        const toStore = active.phase === 'to_store' || active.phase === 'at_store';
        return (
          <div key={active.id} className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-pollon-orange">
              {toStore ? 'Hacia sucursal · recojo' : 'Hacia cliente · entrega'}
            </p>
            <p className="mt-1 text-base font-bold text-gray-900">
              #{job.ticket_code} · {job.customer_name}
            </p>
            <p className="text-sm text-gray-600">{job.customer_address}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              Cobrar: {money((job.order_total || 0) + (job.delivery_fee || 0))}
            </p>
            <div className="mt-3 grid gap-2">
              {toStore && branchCoords && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white"
                  onClick={() => openExternalNavigation(branchCoords.lat, branchCoords.lng, branchCoords.name || 'Sucursal')}
                >
                  <Navigation className="h-4 w-4" />
                  Navegar a sucursal
                </button>
              )}
              {!toStore && job.customer_lat && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white"
                  onClick={() => openExternalNavigation(job.customer_lat, job.customer_lng, job.customer_name)}
                >
                  <Navigation className="h-4 w-4" />
                  Navegar al cliente
                </button>
              )}
              {toStore ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-pollon-red py-3 text-sm font-bold text-white disabled:opacity-50"
                  onClick={async () => {
                    setBusy(true);
                    try { await confirmPickup(active.id); await load(); }
                    catch (e) { setError(e.message); }
                    finally { setBusy(false); }
                  }}
                >
                  Pedido recogido
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await confirmDelivery(active.id);
                      await load();
                      if ((summary?.activeAssignments || []).length <= 1) publishRef.current = false;
                    } catch (e) { setError(e.message); }
                    finally { setBusy(false); }
                  }}
                >
                  Entregado
                </button>
              )}
            </div>
          </div>
        );
      })}

      {!loading && offers.length === 0 && actives.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {isOnline
            ? 'Esperando nuevos pedidos… La alarma sonará al llegar uno.'
            : 'Pulsa Disponible para recibir pedidos.'}
        </div>
      )}
    </div>
  );
}
