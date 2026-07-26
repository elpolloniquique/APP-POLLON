import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const DEMO_DRIVERS = [
  {
    id: 'demo-drv-1',
    profile_id: 'demo-p1',
    admin_status: 'approved',
    operational_status: 'available',
    preferred_branch_id: null,
    max_orders: 2,
    vehicle_type: 'motocicleta',
    vehicle_plate: 'AB-12-34',
    phone: '+56911111111',
    profiles: { full_name: 'Carlos Repartidor', email: 'repartidor@demo.cl', phone: '+56911111111' },
  },
  {
    id: 'demo-drv-2',
    profile_id: 'demo-p2',
    admin_status: 'pending',
    operational_status: 'offline',
    preferred_branch_id: null,
    max_orders: 2,
    vehicle_type: 'motocicleta',
    vehicle_plate: '',
    phone: '+56922222222',
    profiles: { full_name: 'Ana Postulante', email: 'ana@demo.cl', phone: '+56922222222' },
  },
];

export async function listDrivers({ branchId } = {}) {
  if (!isSupabaseConfigured()) {
    return DEMO_DRIVERS.filter((d) => !branchId || !d.preferred_branch_id || d.preferred_branch_id === branchId);
  }
  const sb = getSupabase();
  let q = sb
    .from('ep_driver_profiles')
    .select('*, profiles(id, full_name, email, phone, role, branch_id)')
    .order('created_at', { ascending: false });
  if (branchId) q = q.eq('preferred_branch_id', branchId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateDriverAdminStatus(driverId, adminStatus, notes = '') {
  if (!isSupabaseConfigured()) return { id: driverId, admin_status: adminStatus };
  const sb = getSupabase();
  const patch = {
    admin_status: adminStatus,
    notes,
    updated_at: new Date().toISOString(),
  };
  if (adminStatus === 'approved') patch.approved_at = new Date().toISOString();
  const { data, error } = await sb.from('ep_driver_profiles').update(patch).eq('id', driverId).select().single();
  if (error) throw error;
  return data;
}

export async function updateDriverProfile(driverId, updates) {
  if (!isSupabaseConfigured()) return { id: driverId, ...updates };
  const sb = getSupabase();
  const { data, error } = await sb
    .from('ep_driver_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', driverId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function ensureMyDriverProfile() {
  if (!isSupabaseConfigured()) {
    return DEMO_DRIVERS[0];
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_ensure_driver_profile');
  if (error) throw error;
  const { data: row } = await sb
    .from('ep_driver_profiles')
    .select('*, profiles(full_name, email, phone)')
    .eq('id', data)
    .single();
  return row;
}

export async function setMyOperationalStatus(status) {
  if (!isSupabaseConfigured()) return { ok: true, status };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_set_my_operational_status', { p_status: status });
  if (error) throw error;
  return data;
}

export async function getMyDriverSummary() {
  if (!isSupabaseConfigured()) {
    return {
      driver: DEMO_DRIVERS[0],
      activeAssignments: [],
      pendingOffers: [],
      todayDeliveries: 3,
      todayFees: 7500,
    };
  }
  const sb = getSupabase();
  const driver = await ensureMyDriverProfile();
  const [offersRes, assignRes, doneRes] = await Promise.all([
    sb
      .from('ep_delivery_offers')
      .select('*, ep_delivery_jobs(*)')
      .eq('driver_id', driver.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    sb
      .from('ep_delivery_assignments')
      .select('*, ep_delivery_jobs(*)')
      .eq('driver_id', driver.id)
      .eq('status', 'active'),
    sb
      .from('ep_delivery_assignments')
      .select('driver_fee, delivered_at')
      .eq('driver_id', driver.id)
      .eq('status', 'completed')
      .gte('delivered_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const done = doneRes.data || [];
  return {
    driver,
    pendingOffers: offersRes.data || [],
    activeAssignments: assignRes.data || [],
    todayDeliveries: done.length,
    todayFees: done.reduce((s, x) => s + (x.driver_fee || 0), 0),
  };
}
