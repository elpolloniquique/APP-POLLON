import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { DEFAULT_BRANCHES } from '../data/branches';
import { logAudit } from './auditService';

function mapBranch(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city || '',
    address: row.address || '',
    schedule: row.opening_hours || row.horario || 'Lun-Dom: 11:30 - 23:00',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    isOpen: row.is_active !== false && row.abierta !== false,
    isActive: row.is_active !== false,
    deliveryEnabled: row.delivery_enabled !== false,
    pickupEnabled: row.pickup_enabled !== false,
    reservationsEnabled: row.reservations_enabled !== false,
    deliveryZones: row.zona_delivery || 'Zona principal',
    deliveryCost: Number(row.delivery_cost ?? row.costo_delivery) || 0,
    deliveryEta: row.delivery_eta || row.tiempo_entrega || '30-45 min',
    comingSoon: false,
    displayOrder: row.display_order ?? row.orden ?? 0,
  };
}

async function loadFromBranchesTable() {
  const sb = getSupabase();
  const { data, error } = await sb.from('branches').select('*').order('display_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapBranch).filter((b) => b.isActive);
}

async function loadFromLegacySucursales() {
  const sb = getSupabase();
  const { data, error } = await sb.from('sucursales').select('*').order('orden', { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((r) => !r.proximamente)
    .map((r) => mapBranch({
      id: r.id,
      slug: r.slug,
      name: r.nombre,
      city: r.ciudad,
      address: r.direccion,
      opening_hours: r.horario,
      phone: r.telefono,
      whatsapp: r.whatsapp,
      is_active: r.abierta !== false,
      delivery_cost: r.costo_delivery,
      delivery_eta: r.tiempo_entrega,
      zona_delivery: r.zona_delivery,
      display_order: r.orden,
    }));
}

export async function loadBranches(includeInactive = false) {
  if (!isSupabaseConfigured()) return DEFAULT_BRANCHES.filter((b) => includeInactive || !b.comingSoon);

  try {
    const list = await loadFromBranchesTable();
    if (list.length) return includeInactive ? list : list.filter((b) => b.isActive);
  } catch (e) {
    console.warn('[Pollón] branches:', e.message);
  }

  try {
    const legacy = await loadFromLegacySucursales();
    if (legacy.length) return legacy;
  } catch (e2) {
    console.warn('[Pollón] sucursales legacy:', e2.message);
  }

  return DEFAULT_BRANCHES.filter((b) => includeInactive || !b.comingSoon);
}

export async function adminListAllBranches() {
  if (!isSupabaseConfigured()) return DEFAULT_BRANCHES;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('branches').select('*').order('display_order', { ascending: true });
    if (error) throw error;
    if (data?.length) return data.map(mapBranch);
  } catch (e) {
    console.warn(e);
  }
  return loadBranches(true);
}

export async function adminSaveBranch(branch, user) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin conexión Supabase');

  const row = {
    id: branch.id || undefined,
    slug: branch.slug || branch.name.toLowerCase().replace(/\s+/g, '-'),
    name: branch.name,
    city: branch.city,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    opening_hours: branch.schedule,
    delivery_enabled: branch.deliveryEnabled !== false,
    pickup_enabled: branch.pickupEnabled !== false,
    reservations_enabled: branch.reservationsEnabled !== false,
    delivery_cost: branch.deliveryCost ?? 0,
    delivery_eta: branch.deliveryEta || '30-45 min',
    is_active: branch.isActive !== false,
    display_order: branch.displayOrder ?? 0,
  };

  const { data, error } = await sb.from('branches').upsert(row).select().single();
  if (error) throw error;
  await logAudit({ user, branchId: data.id, entityType: 'branch', entityId: data.id, action: branch.id ? 'update' : 'create', newData: data });
  return mapBranch(data);
}

/** Parsea horario tipo "Lun-Dom: 11:30 - 23:00" o "11:30 - 23:00" */
function parseScheduleWindow(schedule) {
  if (!schedule || typeof schedule !== 'string') return null;
  const m = schedule.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const toMin = (h, min) => Number(h) * 60 + Number(min);
  return { start: toMin(m[1], m[2]), end: toMin(m[3], m[4]) };
}

export function isBranchOpenNow(branch) {
  if (!branch?.isActive && branch?.isActive !== undefined) return false;
  if (branch?.comingSoon) return false;
  if (branch?.isOpen === false) return false;

  const window = parseScheduleWindow(branch.schedule || branch.opening_hours);
  if (!window) return branch?.isOpen !== false;

  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (window.end < window.start) {
    return mins >= window.start || mins <= window.end;
  }
  return mins >= window.start && mins <= window.end;
}
