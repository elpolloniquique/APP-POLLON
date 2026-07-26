import { useEffect, useMemo, useState, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { LiveMap } from '../../components/delivery/LiveMap';
import { listLiveLocations, listLiveAssignments } from '../../services/trackingService';
import { subscribeDispatch } from '../../services/dispatchService';
import { DEFAULT_MAP_CENTER } from '../../utils/geo';
import { Loader } from '../../components/ui/Loader';

export function AdminLiveMap() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches,
    showBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();
  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;

  const [locations, setLocations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [styleId, setStyleId] = useState('streets');
  const [followId, setFollowId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [locs, asgs] = await Promise.all([
        listLiveLocations(),
        listLiveAssignments(filterBranch),
      ]);
      setLocations(locs);
      setAssignments(asgs);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterBranch]);

  useEffect(() => {
    load();
    const unsub = subscribeDispatch(() => load());
    const t = setInterval(load, 10000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  const markers = useMemo(() => {
    const list = locations.map((l) => ({
      id: `drv-${l.driver_id}`,
      lat: l.lat,
      lng: l.lng,
      label: l.driver?.profiles?.full_name || l.ep_driver_profiles?.profiles?.full_name || 'Repartidor',
      color: '#f97316',
      kind: 'driver',
    }));
    assignments.forEach((a) => {
      const job = a.ep_delivery_jobs;
      if (job?.customer_lat && job?.customer_lng) {
        list.push({
          id: `cli-${a.id}`,
          lat: job.customer_lat,
          lng: job.customer_lng,
          label: job.customer_name || 'Cliente',
          color: '#c00000',
          kind: 'customer',
        });
      }
    });
    return list;
  }, [locations, assignments]);

  const routes = useMemo(() => {
    return assignments
      .map((a) => {
        const loc = locations.find((l) => l.driver_id === a.driver_id);
        const job = a.ep_delivery_jobs;
        if (!loc || !job?.customer_lat) return null;
        return {
          id: a.id,
          from: { lat: loc.lat, lng: loc.lng },
          to: { lat: job.customer_lat, lng: job.customer_lng },
          color: a.phase === 'to_store' ? '#2563eb' : '#c00000',
        };
      })
      .filter(Boolean);
  }, [assignments, locations]);

  const center = markers[0]
    ? { lat: markers[0].lat, lng: markers[0].lng }
    : DEFAULT_MAP_CENTER;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-3 p-3 sm:p-4 lg:p-6">
      <AdminPageHeader
        title="En vivo"
        subtitle="GPS repartidores · MapLibre + CARTO/OSRM (sin costo de tiles de pago)"
        actions={showBranchFilter ? (
          <AdminBranchFilter value={selectedBranchId} onChange={setSelectedBranchId} branches={branches} />
        ) : null}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]">
        {loading ? <Loader text="Cargando mapa…" /> : (
          <LiveMap
            className="h-full min-h-[420px]"
            center={center}
            markers={markers}
            routes={routes}
            styleId={styleId}
            onStyleChange={setStyleId}
            followId={followId}
          />
        )}

        <aside className="overflow-y-auto rounded-2xl border bg-white p-3">
          <p className="mb-2 text-xs font-bold uppercase text-gray-400">Repartidores en mapa</p>
          <div className="space-y-2">
            {locations.map((l) => {
              const name = l.driver?.profiles?.full_name || l.ep_driver_profiles?.profiles?.full_name || 'Repartidor';
              const id = `drv-${l.driver_id}`;
              return (
                <button
                  key={l.driver_id}
                  type="button"
                  onClick={() => setFollowId(id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm hover:border-pollon-red ${followId === id ? 'border-pollon-red bg-red-50' : ''}`}
                >
                  <p className="font-semibold">🛵 {name}</p>
                  <p className="text-[10px] text-gray-500">
                    Actualizado {new Date(l.updated_at).toLocaleTimeString('es-CL')}
                  </p>
                </button>
              );
            })}
            {locations.length === 0 && (
              <p className="text-sm text-gray-500">Nadie compartiendo GPS. El repartidor debe ponerse Disponible.</p>
            )}
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase text-gray-400">Entregas activas</p>
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="rounded-xl border px-3 py-2 text-sm">
                <p className="font-semibold">#{a.ep_delivery_jobs?.ticket_code} · {a.ep_delivery_jobs?.customer_name}</p>
                <p className="text-xs text-gray-500 capitalize">{a.phase?.replace('_', ' ')}</p>
              </div>
            ))}
            {assignments.length === 0 && <p className="text-sm text-gray-500">Sin entregas en curso</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
