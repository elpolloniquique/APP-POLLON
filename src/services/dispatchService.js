import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const DEMO_JOBS = [
  {
    id: 'demo-job-1',
    source_order_id: 'ord-1',
    ticket_code: '0042',
    status: 'ready_for_dispatch',
    customer_name: 'María González',
    customer_phone: '+56912345678',
    customer_address: 'Av. Arturo Prat 1234, Iquique',
    customer_lat: -20.235,
    customer_lng: -70.145,
    order_total: 24990,
    delivery_fee: 2500,
    payment_method: 'efectivo',
    branch_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-job-2',
    source_order_id: 'ord-2',
    ticket_code: '0043',
    status: 'assigned',
    customer_name: 'Pedro Soto',
    customer_phone: '+56987654321',
    customer_address: 'Calle Baquedano 500, Iquique',
    customer_lat: -20.228,
    customer_lng: -70.148,
    order_total: 18990,
    delivery_fee: 2000,
    payment_method: 'transferencia',
    assigned_driver_id: 'demo-drv-1',
    branch_id: null,
    created_at: new Date().toISOString(),
  },
];

export async function listDeliveryJobs({ branchId, status } = {}) {
  if (!isSupabaseConfigured()) {
    return DEMO_JOBS.filter((j) => {
      if (branchId && j.branch_id && j.branch_id !== branchId) return false;
      if (status && j.status !== status) return false;
      return true;
    });
  }
  const sb = getSupabase();
  let q = sb
    .from('ep_delivery_jobs')
    .select('*, ep_driver_profiles(id, vehicle_plate, profiles!profile_id(full_name, phone))')
    .order('created_at', { ascending: false })
    .limit(100);
  if (branchId) q = q.eq('branch_id', branchId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertJobFromOrder(orderId) {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_upsert_job_from_pedido', { p_order_id: orderId });
  if (error) throw error;
  return data;
}

export async function startDriverSearch(jobId) {
  if (!isSupabaseConfigured()) return { ok: true, offered: 1 };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_start_driver_search', { p_job_id: jobId });
  if (error) throw error;
  return data;
}

export async function acceptOffer(offerId) {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_accept_delivery_offer', { p_offer_id: offerId });
  if (error) throw error;
  return data;
}

export async function rejectOffer(offerId) {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_reject_delivery_offer', { p_offer_id: offerId });
  if (error) throw error;
  return data;
}

export async function confirmPickup(assignmentId) {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_confirm_pickup', { p_assignment_id: assignmentId });
  if (error) throw error;
  return data;
}

export async function confirmDelivery(assignmentId) {
  if (!isSupabaseConfigured()) return { ok: true };
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_confirm_delivery', { p_assignment_id: assignmentId });
  if (error) throw error;
  return data;
}

export async function createJobFromLocalOrder(order) {
  if (!isSupabaseConfigured()) {
    return {
      id: `demo-${order.id}`,
      source_order_id: order.id,
      ticket_code: order.ticketNumber || order.codigo_pedido,
      status: 'ready_for_dispatch',
      customer_name: order.customer?.name || '',
      customer_phone: order.customer?.phone || '',
      customer_address: order.customer?.address || '',
      order_total: order.total || 0,
      delivery_fee: order.deliveryFee || 0,
      payment_method: order.metodo_pago || '',
      branch_id: order.branchId || null,
      created_at: new Date().toISOString(),
    };
  }
  return upsertJobFromOrder(order.id);
}

export function subscribeDispatch(callback) {
  if (!isSupabaseConfigured()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel('ep-dispatch-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ep_delivery_jobs' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ep_delivery_offers' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ep_driver_location_latest' }, callback)
    .subscribe();
  return () => sb.removeChannel(channel);
}
