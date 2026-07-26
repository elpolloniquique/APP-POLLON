import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const DEMO_LOCATIONS = [
  {
    driver_id: 'demo-drv-1',
    lat: -20.232,
    lng: -70.15,
    heading: 45,
    speed: 18,
    updated_at: new Date().toISOString(),
    driver: { vehicle_plate: 'AB-12-34', profiles: { full_name: 'Carlos Repartidor' } },
  },
];

async function loadDriverCards(driverIds) {
  const ids = [...new Set((driverIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const sb = getSupabase();
  const { data: drivers, error } = await sb
    .from('ep_driver_profiles')
    .select('id, vehicle_plate, operational_status, profile_id')
    .in('id', ids);
  if (error) throw new Error(error.message || 'Error perfiles GPS');

  const profileIds = [...new Set((drivers || []).map((d) => d.profile_id).filter(Boolean))];
  let profilesById = {};
  if (profileIds.length) {
    const { data: profiles, error: pErr } = await sb
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', profileIds);
    if (pErr) throw new Error(pErr.message || 'Error profiles GPS');
    profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  return Object.fromEntries(
    (drivers || []).map((d) => [
      d.id,
      {
        id: d.id,
        vehicle_plate: d.vehicle_plate,
        operational_status: d.operational_status,
        profiles: profilesById[d.profile_id] || null,
      },
    ])
  );
}

export async function upsertMyLocation({ lat, lng, heading, speed, accuracy }) {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_upsert_driver_location', {
    p_lat: lat,
    p_lng: lng,
    p_heading: heading ?? null,
    p_speed: speed ?? null,
    p_accuracy: accuracy ?? null,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('telefono')) {
      throw new Error('Ejecuta fix-delivery-production-ready.sql en Supabase');
    }
    throw new Error(msg || 'No se pudo publicar GPS');
  }
  return data;
}

export async function listLiveLocations() {
  if (!isSupabaseConfigured()) return DEMO_LOCATIONS;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('ep_driver_location_latest')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message || 'Error GPS en vivo');

  const byDriver = await loadDriverCards((data || []).map((r) => r.driver_id));
  return (data || []).map((row) => ({
    ...row,
    ep_driver_profiles: byDriver[row.driver_id] || null,
    driver: byDriver[row.driver_id] || null,
  }));
}

export async function listLiveAssignments(branchId = null) {
  if (!isSupabaseConfigured()) {
    return [
      {
        id: 'demo-asg-1',
        status: 'active',
        phase: 'to_customer',
        driver_id: 'demo-drv-1',
        ep_delivery_jobs: {
          ticket_code: '0043',
          customer_name: 'Pedro Soto',
          customer_address: 'Calle Baquedano 500',
          customer_lat: -20.228,
          customer_lng: -70.148,
          branch_id: branchId,
        },
      },
    ];
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('ep_delivery_assignments')
    .select('*, ep_delivery_jobs(*)')
    .eq('status', 'active')
    .order('accepted_at', { ascending: false });
  if (error) throw new Error(error.message || 'Error asignaciones en vivo');

  let rows = data || [];
  if (branchId) {
    rows = rows.filter((r) => !r.ep_delivery_jobs?.branch_id || r.ep_delivery_jobs.branch_id === branchId);
  }

  const byDriver = await loadDriverCards(rows.map((r) => r.driver_id));
  return rows.map((r) => ({
    ...r,
    ep_driver_profiles: byDriver[r.driver_id] || null,
  }));
}

export async function getDispatchReport(branchId = null, from = null, to = null) {
  if (!isSupabaseConfigured()) {
    return {
      delivered: 48,
      cancelled: 2,
      active: 3,
      total_fees: 120000,
      avg_delivery_minutes: 28.5,
    };
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_dispatch_report', {
    p_branch_id: branchId,
    p_from: from || new Date(Date.now() - 7 * 86400000).toISOString(),
    p_to: to || new Date().toISOString(),
  });
  if (error) throw new Error(error.message || 'Error reporte');
  return data;
}

export async function getDispatchSettings(branchId) {
  if (!isSupabaseConfigured() || !branchId) {
    return {
      enabled: true,
      auto_offer: false,
      offer_ttl_seconds: 60,
      max_search_radius_km: 8,
      arrival_radius_m: 80,
      customer_arrival_radius_m: 60,
      max_orders_per_driver: 2,
      require_gps: true,
      voice_alerts: false,
    };
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('ep_dispatch_settings')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveDispatchSettings(branchId, settings) {
  if (!isSupabaseConfigured()) return settings;
  const sb = getSupabase();
  const payload = {
    branch_id: branchId,
    ...settings,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('ep_dispatch_settings')
    .upsert(payload, { onConflict: 'branch_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Watch GPS del dispositivo y publicar a Supabase cada ~8s */
export function startGpsWatch(onUpdate, { intervalMs = 8000 } = {}) {
  if (!navigator.geolocation) {
    onUpdate?.(null, new Error('Este dispositivo no tiene GPS / geolocalización'));
    return () => {};
  }

  let lastSent = 0;
  let stopped = false;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (stopped) return;
      const payload = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
      };
      try {
        await upsertMyLocation(payload);
        lastSent = Date.now();
        onUpdate?.(payload, null);
      } catch (err) {
        onUpdate?.(payload, err);
      }
    },
    (err) => onUpdate?.(null, new Error(err.message || 'Permiso de ubicación denegado')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  const watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (stopped) return;
      const now = Date.now();
      if (now - lastSent < intervalMs) {
        onUpdate?.(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            accuracy: pos.coords.accuracy,
          },
          null
        );
        return;
      }
      lastSent = now;
      const payload = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
      };
      try {
        await upsertMyLocation(payload);
        onUpdate?.(payload, null);
      } catch (err) {
        onUpdate?.(payload, err);
      }
    },
    (err) => onUpdate?.(null, new Error(err.message || 'Error GPS')),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
  );

  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
  };
}
