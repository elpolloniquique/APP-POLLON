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

export function DriverHome() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsPos, setGpsPos] = useState(null);
  const [error, setError] = useState('');
  const [stopGps, setStopGps] = useState(null);

  const load = useCallback(async () => {
    try {
      await ensureMyDriverProfile();
      const s = await getMyDriverSummary();
      setSummary(s);
      setError('');
    } catch (err) {
      setError(err.message || 'Error al cargar. ¿Ejecutaste la migración SQL?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeDispatch(() => load());
    const t = setInterval(load, 12000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  useEffect(() => () => { stopGps?.(); }, [stopGps]);

  const toggleOnline = async () => {
    const next = summary?.driver?.operational_status === 'available' ? 'offline' : 'available';
    setBusy(true);
    try {
      await setMyOperationalStatus(next);
      if (next === 'available' && !gpsOn) {
        const stop = startGpsWatch((pos, err) => {
          if (pos) setGpsPos(pos);
          if (err && !pos) setError(err.message);
        });
        setStopGps(() => stop);
        setGpsOn(true);
      }
      if (next === 'offline' && stopGps) {
        stopGps();
        setStopGps(null);
        setGpsOn(false);
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

  const active = summary?.activeAssignments?.[0];
  const job = active?.ep_delivery_jobs;
  const isOnline = summary?.driver?.operational_status === 'available'
    || ['heading_to_branch', 'delivering', 'carrying_orders', 'offered'].includes(summary?.driver?.operational_status);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <p className="text-sm text-white/60">Estado</p>
          <p className="text-lg font-bold">{isOnline ? 'En línea' : 'Desconectado'}</p>
          {gpsPos && <p className="text-[10px] text-white/40">GPS {gpsPos.lat.toFixed(4)}, {gpsPos.lng.toFixed(4)}</p>}
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={toggleOnline}
          className={`rounded-full px-4 py-2 text-sm font-bold ${
            isOnline ? 'bg-green-500 text-white' : 'bg-white/10 text-white'
          }`}
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

      {active && job && (
        <div className="rounded-2xl border border-pollon-orange/40 bg-white p-4 text-pollon-black shadow-xl">
          <p className="text-xs font-bold uppercase text-pollon-orange">Viaje activo · {active.phase}</p>
          <p className="mt-1 text-lg font-bold">#{job.ticket_code} · {job.customer_name}</p>
          <p className="text-sm text-gray-600">{job.customer_address}</p>
          <p className="mt-2 text-sm">Cobrar: <strong>{money((job.order_total || 0) + (job.delivery_fee || 0))}</strong></p>

          <div className="mt-4 grid gap-2">
            {job.customer_lat && (
              <button
                type="button"
                className="rounded-xl border-2 border-pollon-black py-3 text-sm font-bold"
                onClick={() => openExternalNavigation(job.customer_lat, job.customer_lng, job.customer_name)}
              >
                Navegar
              </button>
            )}
            {active.phase === 'to_store' || active.phase === 'at_store' ? (
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
                Marcar recogido
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
      )}

      {!loading && !summary?.pendingOffers?.length && !active && (
        <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-white/50">
          {isOnline
            ? 'Esperando ofertas de pedidos en tiempo real…'
            : 'Conéctate como Disponible para recibir pedidos.'}
        </div>
      )}
    </div>
  );
}
