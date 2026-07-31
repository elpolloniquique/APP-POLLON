import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { notifyDriversForJob } from './pushService';

/**
 * Links pedidos ↔ delivery jobs ↔ driver assignments.
 * Used by AdminOrders to show driver names and auto-dispatch.
 */

let jobCache = {};
let driverCache = {};
let lastFetch = 0;

/** Fetch all delivery jobs with their assigned driver (no embed — safe) */
export async function fetchDeliveryJobMap() {
  if (!isSupabaseConfigured()) return {};
  if (Date.now() - lastFetch < 3000) return jobCache;

  const sb = getSupabase();
  const { data: jobs, error } = await sb
    .from('ep_delivery_jobs')
    .select('id, source_order_id, status, assigned_driver_id, ticket_code')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.warn('[Pollón] fetchDeliveryJobMap:', error.message); return jobCache; }

  const driverIds = [...new Set((jobs || []).map((j) => j.assigned_driver_id).filter(Boolean))];
  if (driverIds.length) {
    const { data: drivers } = await sb
      .from('ep_driver_profiles')
      .select('id, vehicle_plate, profile_id')
      .in('id', driverIds);

    const profileIds = [...new Set((drivers || []).map((d) => d.profile_id).filter(Boolean))];
    let profilesById = {};
    if (profileIds.length) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', profileIds);
      profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    }

    driverCache = Object.fromEntries(
      (drivers || []).map((d) => [d.id, {
        id: d.id,
        vehicle_plate: d.vehicle_plate,
        full_name: profilesById[d.profile_id]?.full_name || 'Repartidor',
      }])
    );
  }

  const map = {};
  for (const j of (jobs || [])) {
    map[j.source_order_id] = {
      jobId: j.id,
      jobStatus: j.status,
      driverId: j.assigned_driver_id,
      driver: j.assigned_driver_id ? driverCache[j.assigned_driver_id] || null : null,
    };
  }
  jobCache = map;
  lastFetch = Date.now();
  return map;
}

/** Get info for a single order */
export function getDeliveryInfo(orderId) {
  return jobCache[orderId] || null;
}

/** Auto-create delivery job + search drivers for a new delivery order */
export async function autoDispatchNewOrder(orderId) {
  if (!isSupabaseConfigured() || !orderId) return null;
  const sb = getSupabase();
  try {
    const { data: jobId, error } = await sb.rpc('ep_upsert_job_from_pedido', { p_order_id: orderId });
    if (error) { console.warn('[Pollón] autoDispatch upsert:', error.message); return null; }
    if (!jobId) return null;

    const { data: searchResult, error: sErr } = await sb.rpc('ep_start_driver_search', { p_job_id: jobId });
    if (sErr) { console.warn('[Pollón] autoDispatch search:', sErr.message); }
    else {
      notifyDriversForJob(jobId).catch(() => {});
    }

    lastFetch = 0;
    return { jobId, searchResult };
  } catch (e) {
    console.warn('[Pollón] autoDispatch:', e.message);
    return null;
  }
}

/** Manual re-search for drivers (button in admin) */
export async function manualSearchDrivers(orderId) {
  if (!isSupabaseConfigured() || !orderId) throw new Error('Sin conexión');
  const sb = getSupabase();

  const { data: jobId, error } = await sb.rpc('ep_upsert_job_from_pedido', { p_order_id: orderId });
  if (error) throw new Error(error.message || 'Error creando job de delivery');
  if (!jobId) throw new Error('No se pudo crear trabajo de delivery');

  const { data, error: sErr } = await sb.rpc('ep_start_driver_search', { p_job_id: jobId });
  if (sErr) throw new Error(sErr.message || 'Error buscando repartidores');

  notifyDriversForJob(jobId).catch(() => {});

  lastFetch = 0;
  return data;
}

/**
 * Re-oferta jobs sin aceptación tras ~3 min (TTL oferta ya expiró).
 * Dispara push a los repartidores de nuevo.
 */
export async function retryStaleDriverSearches() {
  if (!isSupabaseConfigured()) return { ok: true, retried: 0 };
  const sb = getSupabase();
  try {
    const { data, error } = await sb.rpc('ep_retry_stale_driver_searches');
    if (error) {
      console.warn('[Pollón] retryStaleDriverSearches:', error.message);
      return { ok: false, error: error.message };
    }
    const jobIds = data?.job_ids || [];
    for (const jobId of jobIds) {
      notifyDriversForJob(jobId).catch(() => {});
    }
    if (jobIds.length) lastFetch = 0;
    return data || { ok: true, retried: 0 };
  } catch (e) {
    console.warn('[Pollón] retryStaleDriverSearches:', e.message);
    return { ok: false, error: e.message };
  }
}

/** Fetch list of unique driver names for filter dropdown */
export async function fetchDriverNamesForFilter() {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data: drivers, error } = await sb
    .from('ep_driver_profiles')
    .select('id, profile_id')
    .eq('admin_status', 'approved');
  if (error || !drivers?.length) return [];

  const profileIds = drivers.map((d) => d.profile_id).filter(Boolean);
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds);

  const byProfileId = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  return drivers.map((d) => ({
    driverId: d.id,
    name: byProfileId[d.profile_id] || 'Repartidor',
  })).filter((d) => d.name);
}

export function clearCache() {
  jobCache = {};
  driverCache = {};
  lastFetch = 0;
}
