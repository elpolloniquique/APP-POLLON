import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Crosshair, Navigation, Clock, Route } from 'lucide-react';
import { DriverOfferCard } from '../../components/delivery/DriverOfferCard';
import { LiveMap } from '../../components/delivery/LiveMap';
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
import { openExternalNavigation, fetchOsrmRoute } from '../../utils/osrm';
import { playNewOrderAlert } from '../../utils/orderAlertSound';
import { money } from '../../utils/format';
import { DEFAULT_MAP_CENTER } from '../../utils/geo';
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
  const [styleId, setStyleId] = useState('streets');
  const [tripMeta, setTripMeta] = useState(null); // { durationMin, distanceKm }
  const [followMe, setFollowMe] = useState(true);

  const publishRef = useRef(false);
  const seenOffersRef = useRef(new Set());
  const alertReadyRef = useRef(false);

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

  useEffect(() => () => { stopGps?.(); }, [stopGps]);

  // Timbre al llegar oferta nueva
  useEffect(() => {
    const offers = summary?.pendingOffers || [];
    if (!alertReadyRef.current) {
      offers.forEach((o) => seenOffersRef.current.add(o.id));
      alertReadyRef.current = true;
      return;
    }
    let played = false;
    for (const o of offers) {
      if (!seenOffersRef.current.has(o.id)) {
        seenOffersRef.current.add(o.id);
        if (!played) {
          playNewOrderAlert();
          try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
          played = true;
        }
      }
    }
    // limpia ids viejos
    const live = new Set(offers.map((o) => o.id));
    for (const id of [...seenOffersRef.current]) {
      if (!live.has(id)) seenOffersRef.current.delete(id);
    }
  }, [summary?.pendingOffers]);

  const ensureGps = useCallback((publish) => {
    publishRef.current = !!publish;
    if (gpsOn) return;
    const stop = startGpsWatch(
      (pos, err) => {
        if (pos) setGpsPos(pos);
        if (err) setError(err.message || 'Error GPS');
      },
      { publishRef }
    );
    setStopGps(() => stop);
    setGpsOn(true);
  }, [gpsOn]);

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
        // Disponible: GPS local para el mapa; publicar solo si ya tiene pedidos activos
        const hasActive = (summary?.activeAssignments || []).length > 0;
        stopGps?.();
        publishRef.current = hasActive;
        const stop = startGpsWatch(
          (pos, err) => {
            if (pos) setGpsPos(pos);
            if (err) setError(err.message || 'Error GPS');
          },
          { publishRef }
        );
        setStopGps(() => stop);
        setGpsOn(true);
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
      await acceptOffer(offer.id);
      // Tras aceptar: publicar GPS → visible en En vivo (admin/cajera/despacho)
      publishRef.current = true;
      ensureGps(true);
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

  const primary = actives[0] || null;
  const primaryJob = primary?.ep_delivery_jobs || null;
  const toStore = primary && (primary.phase === 'to_store' || primary.phase === 'at_store');

  const driverName = (summary?.driver?.profiles?.full_name || 'Tú').split(/\s+/)[0];

  const markers = useMemo(() => {
    const list = [];
    if (gpsPos) {
      list.push({
        id: 'me',
        lat: gpsPos.lat,
        lng: gpsPos.lng,
        label: driverName,
        color: '#2563eb',
        kind: 'driver',
      });
    }
    if (primaryJob?.customer_lat != null) {
      list.push({
        id: 'customer',
        lat: primaryJob.customer_lat,
        lng: primaryJob.customer_lng,
        label: (primaryJob.customer_address || primaryJob.customer_name || 'Cliente').slice(0, 42),
        color: '#c00000',
        kind: 'customer',
      });
    }
    // Destino de ofertas pendientes (preview)
    if (!primaryJob && offers[0]?.ep_delivery_jobs?.customer_lat != null) {
      const j = offers[0].ep_delivery_jobs;
      list.push({
        id: 'offer-dest',
        lat: j.customer_lat,
        lng: j.customer_lng,
        label: (j.customer_address || j.customer_name || 'Destino').slice(0, 42),
        color: '#c00000',
        kind: 'customer',
      });
    }
    return list;
  }, [gpsPos, primaryJob, offers, driverName]);

  const store = branchCoords
    ? { lat: branchCoords.lat, lng: branchCoords.lng, label: 'El Pollon' }
    : null;

  const routes = useMemo(() => {
    if (!gpsPos) return [];
    if (primary && toStore && store) {
      return [{
        id: 'to-store',
        from: { lat: gpsPos.lat, lng: gpsPos.lng },
        to: { lat: store.lat, lng: store.lng },
        color: '#c00000',
      }];
    }
    if (primary && !toStore && primaryJob?.customer_lat != null) {
      return [{
        id: 'to-customer',
        from: { lat: gpsPos.lat, lng: gpsPos.lng },
        to: { lat: primaryJob.customer_lat, lng: primaryJob.customer_lng },
        color: '#c00000',
      }];
    }
    return [];
  }, [gpsPos, primary, toStore, store, primaryJob]);

  // ETA / distancia de la ruta activa
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!routes[0]) {
        setTripMeta(null);
        return;
      }
      const r = await fetchOsrmRoute(routes[0].from, routes[0].to);
      if (cancelled) return;
      if (r) {
        setTripMeta({
          durationMin: Math.max(1, Math.round(r.durationMin)),
          distanceKm: Math.round(r.distanceKm * 10) / 10,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [routes]);

  const navTarget = toStore && store
    ? { lat: store.lat, lng: store.lng, label: store.label || 'Sucursal' }
    : primaryJob?.customer_lat != null
      ? { lat: primaryJob.customer_lat, lng: primaryJob.customer_lng, label: primaryJob.customer_name || 'Cliente' }
      : null;

  const center = gpsPos
    ? { lat: gpsPos.lat, lng: gpsPos.lng }
    : store
      ? { lat: store.lat, lng: store.lng }
      : DEFAULT_MAP_CENTER;

  return (
    <div className="relative h-[calc(100dvh-7.25rem)] w-full overflow-hidden bg-[#0B0F14]">
      <LiveMap
        className="absolute inset-0 h-full min-h-0 rounded-none border-0"
        center={center}
        zoom={14}
        markers={markers}
        routes={routes}
        store={store}
        styleId={styleId}
        onStyleChange={setStyleId}
        followId={followMe && gpsPos ? 'me' : null}
        showLegend={false}
      />

      {/* Controles superiores */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-md"
          onClick={() => {
            if (!gpsOn) ensureGps(publishRef.current);
            else setFollowMe(true);
          }}
        >
          <Share2 className="h-3.5 w-3.5 text-pollon-red" />
          Compartir GPS
        </button>
        <button
          type="button"
          disabled={busy || loading}
          onClick={toggleOnline}
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold shadow-md ${
            isOnline ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-white' : 'bg-gray-400'}`} />
          {isOnline ? 'Disponible' : 'Conectarme'}
        </button>
      </div>

      {/* Ofertas nuevas */}
      <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex max-h-[48%] flex-col gap-2 overflow-y-auto px-3">
        {offers.map((offer) => (
          <div key={offer.id} className="pointer-events-auto">
            <DriverOfferCard offer={offer} onAccept={onAccept} onReject={onReject} loading={busy} />
          </div>
        ))}
      </div>

      {/* Botón centrar */}
      <button
        type="button"
        className="absolute bottom-36 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg"
        onClick={() => {
          setFollowMe(true);
          if (!gpsOn) ensureGps(publishRef.current);
        }}
        aria-label="Centrar en mí"
      >
        <Crosshair className="h-5 w-5" />
      </button>

      {/* Card navegación / pedido activo */}
      {primary && primaryJob && (
        <div className="absolute bottom-3 left-3 right-16 z-20 overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="flex gap-4 px-3 pt-3">
            <div className="flex items-center gap-1.5 text-sm">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <p className="font-bold text-gray-900">{tripMeta?.durationMin ?? '—'} min</p>
                <p className="text-[10px] text-gray-400">Tiempo estimado</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Route className="h-4 w-4 text-gray-500" />
              <div>
                <p className="font-bold text-gray-900">{tripMeta?.distanceKm ?? '—'} km</p>
                <p className="text-[10px] text-gray-400">Distancia</p>
              </div>
            </div>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-pollon-orange">
              {toStore ? 'Hacia sucursal · recojo' : 'Hacia cliente · entrega'}
            </p>
            <p className="truncate text-sm font-semibold text-gray-900">
              #{primaryJob.ticket_code} · {primaryJob.customer_name}
            </p>
            <p className="text-xs text-gray-500">
              Cobrar {money((primaryJob.order_total || 0) + (primaryJob.delivery_fee || 0))}
            </p>
          </div>
          {navTarget && (
            <button
              type="button"
              className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white"
              onClick={() => openExternalNavigation(navTarget.lat, navTarget.lng, navTarget.label)}
            >
              <Navigation className="h-4 w-4" />
              Navegar
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {toStore ? (
              <button
                type="button"
                disabled={busy}
                className="col-span-2 rounded-xl bg-pollon-red py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try { await confirmPickup(primary.id); await load(); }
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
                className="col-span-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await confirmDelivery(primary.id);
                    await load();
                    if (!(summary?.activeAssignments?.length > 1)) publishRef.current = false;
                  } catch (e) { setError(e.message); }
                  finally { setBusy(false); }
                }}
              >
                Entregado
              </button>
            )}
          </div>
          {actives.length > 1 && (
            <p className="px-3 pb-2 text-center text-[10px] text-gray-400">
              +{actives.length - 1} pedido{actives.length > 2 ? 's' : ''} más activo{actives.length > 2 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {!isOnline && !loading && (
        <div className="absolute bottom-24 left-3 right-3 z-20 rounded-2xl bg-black/75 px-4 py-3 text-center text-sm text-white backdrop-blur">
          Pulsa <strong>Conectarme</strong> para recibir pedidos en vivo.
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-3 right-3 z-40 rounded-xl bg-red-600/95 px-3 py-2 text-xs text-white shadow">
          {error}
        </div>
      )}
    </div>
  );
}
