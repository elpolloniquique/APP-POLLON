import { useCallback, useEffect, useState } from 'react';
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

  const load = useCallback(async () => {
    try {
      await ensureMyDriverProfile();
      const s = await getMyDriverSummary();
      setSummary(s);
      setError('');

      // coords sucursal preferida / primera del job
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
    const t = setInterval(load, 10000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  useEffect(() => () => { stopGps?.(); }, [stopGps]);

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
        stopGps?.();
        const stop = startGpsWatch((pos, err) => {
          if (pos) setGpsPos(pos);
          if (err) setError(err.message || 'Error GPS');
        });
        setStopGps(() => stop);
        setGpsOn(true);
      } else {
        stopGps?.();
        setStopGps(null);
        setGpsOn(false);
        setGpsPos(null);
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
      if (!gpsOn) {
        const stop = startGpsWatch((pos) => pos && setGpsPos(pos));
        setStopGps(() => stop);
        setGpsOn(true);
      }
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
  const isOnline = summary?.driver?.operational_status === 'available'
    || ['heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(summary?.driver?.operational_status);
  const maxOrders = summary?.driver?.max_orders || 3;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <p className="text-sm text-white/60">Estado</p>
          <p className="text-lg font-bold">{isOnline ? 'En línea' : 'Desconectado'}</p>
          <p className={`text-[10px] ${gpsOn && gpsPos ? 'text-green-400' : 'text-white/40'}`}>
            {gpsOn && gpsPos
              ? `GPS activo · ${gpsPos.lat.toFixed(5)}, ${gpsPos.lng.toFixed(5)}`
              : gpsOn
                ? 'GPS esperando señal…'
                : 'GPS apagado'}
          </p>
          <p className="mt-1 text-[10px] text-white/40">
            Pedidos activos: {actives.length}/{maxOrders}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading || actives.some((a) => a.phase === 'to_customer')}
          onClick={toggleOnline}
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            isOnline ? 'bg-green-500 text-white' : 'bg-white/10 text-white'
          } disabled:opacity-40`}
        >
          {isOnline ? 'Disponible' : 'Conectarme'}
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-white/50">Entregas hoy</p>
          <p className="text-2xl font-bold text-pollon-orange">{summary?.todayDeliveries ?? 0}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-white/50">Ingresos hoy</p>
          <p className="text-2xl font-bold text-green-400">{money(summary?.todayFees ?? 0)}</p>
        </div>
      </div>

      {summary?.pendingOffers?.map((offer) => (
        <DriverOfferCard key={offer.id} offer={offer} onAccept={onAccept} onReject={onReject} loading={busy} />
      ))}

      {actives.map((active) => {
        const job = active.ep_delivery_jobs;
        if (!job) return null;
        const toStore = active.phase === 'to_store' || active.phase === 'at_store';
        return (
          <div key={active.id} className="rounded-2xl border border-pollon-orange/40 bg-white p-4 text-pollon-black shadow-xl">
            <p className="text-xs font-bold uppercase text-pollon-orange">
              {toStore ? 'Hacia sucursal · recojo' : 'Hacia cliente · entrega'}
            </p>
            <p className="mt-1 text-lg font-bold">#{job.ticket_code} · {job.customer_name}</p>
            <p className="text-sm text-gray-600">{job.customer_address}</p>
            <p className="mt-2 text-sm">Cobrar: <strong>{money((job.order_total || 0) + (job.delivery_fee || 0))}</strong></p>

            <div className="mt-4 grid gap-2">
              {toStore && branchCoords && (
                <button
                  type="button"
                  className="rounded-xl border-2 border-pollon-black py-3 text-sm font-bold"
                  onClick={() => openExternalNavigation(branchCoords.lat, branchCoords.lng, branchCoords.name || 'Sucursal')}
                >
                  Navegar a sucursal
                </button>
              )}
              {!toStore && job.customer_lat && (
                <button
                  type="button"
                  className="rounded-xl border-2 border-pollon-black py-3 text-sm font-bold"
                  onClick={() => openExternalNavigation(job.customer_lat, job.customer_lng, job.customer_name)}
                >
                  Navegar al cliente
                </button>
              )}
              {toStore ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl bg-pollon-red py-3 text-sm font-bold text-white"
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
                  className="rounded-xl bg-green-600 py-3 text-sm font-bold text-white"
                  onClick={async () => {
                    setBusy(true);
                    try { await confirmDelivery(active.id); await load(); }
                    catch (e) { setError(e.message); }
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

      {!loading && !summary?.pendingOffers?.length && actives.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-white/50">
          {isOnline
            ? 'Esperando ofertas de pedidos en tiempo real…'
            : 'Conéctate como Disponible para recibir pedidos.'}
        </div>
      )}
    </div>
  );
}
