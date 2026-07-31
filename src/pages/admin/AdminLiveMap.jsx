import { useEffect, useMemo, useState, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { LiveMap } from '../../components/delivery/LiveMap';
import { LiveDriverSidebar } from '../../components/delivery/LiveDriverSidebar';
import { LiveVoiceAlertToggle } from '../../components/delivery/LiveVoiceAlertToggle';
import {
  listLiveLocations,
  listLiveAssignments,
  getDriverActiveOrdersDetail,
} from '../../services/trackingService';
import { subscribeDispatch } from '../../services/dispatchService';
import { fetchOsrmRoute } from '../../utils/osrm';
import { DEFAULT_MAP_CENTER } from '../../utils/geo';
import {
  colorForDriver,
  isPickupPhase,
  isDeliveryPhase,
  shortBranchLabel,
} from '../../utils/liveMapColors';
import { Loader } from '../../components/ui/Loader';
import { adminListAllBranches } from '../../services/branchService';
import { useLiveVoiceAlerts } from '../../hooks/useLiveVoiceAlerts';
import {
  loadVoiceAlertEnabled,
  saveVoiceAlertEnabled,
  unlockSpeech,
  stopVoiceAlerts,
} from '../../utils/liveVoiceAlert';

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export function AdminLiveMap() {
  const {
    selectedBranchId,
    setSelectedBranchId,
    branches: filterBranches,
    showBranchFilter,
    branchId: staffBranchId,
    isSuperAdmin,
  } = useAdminBranchFilter();
  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;

  const [allBranches, setAllBranches] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [styleId, setStyleId] = useState('streets');
  const [followId, setFollowId] = useState(null);
  const [error, setError] = useState('');
  const [etas, setEtas] = useState({});
  const [viewDriverId, setViewDriverId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voiceAlertOn, setVoiceAlertOn] = useState(() => loadVoiceAlertEnabled());

  const setVoiceEnabled = (on) => {
    if (on) unlockSpeech();
    else stopVoiceAlerts();
    setVoiceAlertOn(on);
    saveVoiceAlertEnabled(on);
  };

  // Chrome/Safari: la voz requiere un gesto del usuario al menos una vez
  useEffect(() => {
    if (!voiceAlertOn) return undefined;
    const unlock = () => unlockSpeech();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.speechSynthesis?.getVoices?.();
    return () => window.removeEventListener('pointerdown', unlock);
  }, [voiceAlertOn]);

  useEffect(() => {
    adminListAllBranches()
      .then(setAllBranches)
      .catch(() => setAllBranches(filterBranches || []));
  }, [filterBranches]);

  const branches = allBranches.length ? allBranches : (filterBranches || []);

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
    const t = setInterval(load, 5000);
    return () => { unsub(); clearInterval(t); };
  }, [load]);

  const activeBranch = useMemo(() => {
    if (filterBranch) return branches.find((b) => b.id === filterBranch) || null;
    // Prefer Iquique / first with coords
    const withGps = branches.find((b) => b.lat != null && b.lng != null);
    return withGps || branches[0] || null;
  }, [branches, filterBranch]);

  const store = useMemo(() => {
    if (activeBranch?.lat == null || activeBranch?.lng == null) {
      // fallback Vivar 1086 Iquique approx from known seed
      return {
        lat: -20.218584,
        lng: -70.148756,
        label: shortBranchLabel(activeBranch?.name) || 'EL POLLON',
      };
    }
    return {
      lat: Number(activeBranch.lat),
      lng: Number(activeBranch.lng),
      label: shortBranchLabel(activeBranch.name),
    };
  }, [activeBranch]);

  /** Agrupa asignaciones por driver con fase dominante */
  const driverGroups = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      const did = a.driver_id;
      if (!did) continue;
      if (!map.has(did)) {
        map.set(did, {
          driverId: did,
          assignments: [],
          driver: a.ep_driver_profiles,
          phases: [],
        });
      }
      const g = map.get(did);
      g.assignments.push(a);
      g.phases.push(a.phase);
    }

    return [...map.values()].map((g) => {
      const hasDelivery = g.phases.some(isDeliveryPhase);
      const phase = hasDelivery ? 'to_customer' : (g.phases.find(isPickupPhase) || g.phases[0] || 'to_store');
      const color = colorForDriver(g.driverId, phase);
      const loc = locations.find((l) => l.driver_id === g.driverId);
      const name =
        g.driver?.profiles?.full_name
        || loc?.driver?.profiles?.full_name
        || 'Repartidor';
      const acceptedAt = g.assignments
        .map((a) => a.accepted_at)
        .filter(Boolean)
        .sort()[0];
      return {
        ...g,
        phase,
        color,
        name,
        lat: loc?.lat,
        lng: loc?.lng,
        updatedAt: loc?.updated_at || acceptedAt,
        acceptedAt,
      };
    });
  }, [assignments, locations]);

  const pickupDrivers = useMemo(
    () => driverGroups.filter((d) => isPickupPhase(d.phase)),
    [driverGroups]
  );
  const deliveryDrivers = useMemo(
    () => driverGroups.filter((d) => isDeliveryPhase(d.phase)),
    [driverGroups]
  );

  useLiveVoiceAlerts({
    enabled: voiceAlertOn,
    pickupDrivers,
    etas,
    store,
  });

  // ETA via OSRM (async, cached in state)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const d of driverGroups) {
        if (d.lat == null || d.lng == null) continue;
        const to = isPickupPhase(d.phase)
          ? store
          : (() => {
            const job = d.assignments.find((a) => a.phase === 'to_customer')?.ep_delivery_jobs
              || d.assignments[0]?.ep_delivery_jobs;
            if (job?.customer_lat == null) return null;
            return { lat: job.customer_lat, lng: job.customer_lng };
          })();
        if (!to?.lat) continue;
        const route = await fetchOsrmRoute({ lat: d.lat, lng: d.lng }, to);
        if (cancelled) return;
        if (route?.durationMin != null) {
          next[d.driverId] = Math.max(1, Math.round(route.durationMin));
        }
      }
      if (!cancelled) setEtas(next);
    })();
    return () => { cancelled = true; };
  }, [driverGroups, store]);

  const sidebarPickup = pickupDrivers.map((d) => ({
    driverId: d.driverId,
    name: d.name,
    color: d.color,
    phaseLabel: 'Hacia sucursal',
    updatedLabel: formatTime(d.updatedAt || d.acceptedAt),
    etaLabel: etas[d.driverId] != null ? `${etas[d.driverId]} min estimado` : null,
  }));

  const sidebarDelivery = deliveryDrivers.map((d) => ({
    driverId: d.driverId,
    name: d.name,
    color: d.color,
    phaseLabel: 'Hacia cliente',
    updatedLabel: formatTime(d.updatedAt || d.acceptedAt),
    etaLabel: etas[d.driverId] != null ? `${etas[d.driverId]} min estimado` : null,
  }));

  const markers = useMemo(() => {
    return driverGroups
      .filter((d) => d.lat != null && d.lng != null)
      .map((d) => ({
        id: `drv-${d.driverId}`,
        lat: d.lat,
        lng: d.lng,
        label: (d.name || 'Repartidor').split(' ')[0],
        color: d.color,
        kind: 'driver',
      }));
  }, [driverGroups]);

  const routes = useMemo(() => {
    return driverGroups
      .filter((d) => d.lat != null && d.lng != null)
      .map((d) => {
        if (isPickupPhase(d.phase)) {
          return {
            id: `r-${d.driverId}`,
            from: { lat: d.lat, lng: d.lng },
            to: { lat: store.lat, lng: store.lng },
            color: d.color,
          };
        }
        const job = d.assignments.find((a) => a.phase === 'to_customer')?.ep_delivery_jobs
          || d.assignments[0]?.ep_delivery_jobs;
        if (!job?.customer_lat) return null;
        return {
          id: `r-${d.driverId}`,
          from: { lat: d.lat, lng: d.lng },
          to: { lat: job.customer_lat, lng: job.customer_lng },
          color: d.color,
        };
      })
      .filter(Boolean);
  }, [driverGroups, store]);

  const center = markers[0]
    ? { lat: markers[0].lat, lng: markers[0].lng }
    : { lat: store.lat, lng: store.lng };

  const loadDetail = async (driverId) => {
    setViewDriverId(driverId);
    setFollowId(`drv-${driverId}`);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getDriverActiveOrdersDetail(driverId);
      setDetail(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (item) => {
    // Mismo repartidor abierto → cerrar; otro → abrir (cierra el anterior)
    if (viewDriverId === item.driverId) {
      setViewDriverId(null);
      setDetail(null);
      return;
    }
    await loadDetail(item.driverId);
  };

  const closeDetail = () => {
    setViewDriverId(null);
    setDetail(null);
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-3 p-3 sm:p-4 lg:px-8 lg:py-5">
      <AdminPageHeader
        title="En vivo"
        subtitle="GPS repartidores · seguimiento hacia sucursal y hacia cliente"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <LiveVoiceAlertToggle enabled={voiceAlertOn} onChange={setVoiceEnabled} />
            {showBranchFilter ? (
              <AdminBranchFilter
                value={selectedBranchId || activeBranch?.id || ''}
                onChange={setSelectedBranchId}
                branches={branches}
              />
            ) : null}
          </div>
        )}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_320px]">
        {loading ? (
          <Loader text="Cargando mapa…" />
        ) : (
          <div className="relative z-0 min-h-0">
            <LiveMap
              className="h-full min-h-[420px]"
              center={center}
              markers={markers}
              routes={routes}
              store={store}
              styleId={styleId}
              onStyleChange={setStyleId}
              followId={followId}
              showLegend
            />
          </div>
        )}

        <LiveDriverSidebar
          pickupDrivers={sidebarPickup}
          deliveryDrivers={sidebarDelivery}
          selectedDriverId={viewDriverId}
          openDriverId={viewDriverId}
          detail={detail}
          detailLoading={detailLoading}
          onSelect={(id) => setFollowId(`drv-${id}`)}
          onView={openDetail}
          onCloseDetail={closeDetail}
          canMarkPickup
          onPickupDone={() => {
            load();
            if (viewDriverId) loadDetail(viewDriverId);
          }}
        />
      </div>
    </div>
  );
}
