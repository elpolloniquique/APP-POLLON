import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ORDERS_KEY } from '../utils/constants';
import { filterOrdersInRange, getPeriodRange } from '../utils/dashboardAnalytics';

let orders = [];
let channel = null;
let backendReady = false;
let initPromise = null;
let listeners = new Set();
let realtimeConnectionStatus = 'connecting';
let lastRealtimeAt = 0;
let pollTimer = null;
let refetchTimer = null;

function sanitize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize).filter((v) => v !== undefined);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) continue;
    out[k] = sanitize(obj[k]);
  }
  return out;
}

function rowToOrder(row) {
  const datos = row.datos_json || {};
  return {
    id: row.id,
    createdAt: row.creado_en,
    ticketNumber: row.codigo_pedido || datos.ticketNumber,
    codigo_pedido: row.codigo_pedido,
    customer: datos.customer || {
      name: row.cliente_nombre,
      phone: row.cliente_telefono,
      address: row.cliente_direccion,
      comments: row.observaciones,
    },
    items: datos.items || [],
    total: Number(row.total) || 0,
    deliveryFee: datos.deliveryFee || 0,
    estado: row.estado,
    deliveredAt: row.entregado_en,
    orderType: row.tipo_entrega || 'delivery',
    metodo_pago: row.metodo_pago,
      branchId: row.branch_id || row.sucursal_id || datos.branchId,
    customerId: row.customer_id || datos.customerId,
    observaciones: row.observaciones,
  };
}

function orderToRow(order) {
  const cust = order.customer || {};
  const codigo = order.codigo_pedido || order.ticketNumber || String(order.id).slice(-6);
  return sanitize({
    id: order.id,
    codigo_pedido: String(codigo).padStart(6, '0'),
    cliente_nombre: cust.name || '',
    cliente_telefono: cust.phone || '',
    cliente_direccion: cust.address || '',
    tipo_entrega: order.orderType || 'delivery',
    metodo_pago: order.metodo_pago || 'whatsapp',
    total: order.total || 0,
    estado: order.estado || 'pendiente',
    observaciones: cust.comments || order.observaciones || '',
    branch_id: order.branchId || null,
    customer_id: order.customerId || null,
    creado_en: order.createdAt || new Date().toISOString(),
    entregado_en: order.deliveredAt || null,
    datos_json: {
      customer: cust,
      items: order.items || [],
      ticketNumber: order.ticketNumber,
      deliveryFee: order.deliveryFee || 0,
      branchId: order.branchId,
      productIds: (order.items || []).map((it) => it.id || it.producto_id).filter(Boolean),
    },
  });
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    orders = raw ? JSON.parse(raw) : [];
  } catch {
    orders = [];
  }
}

function saveLocal() {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function getOrders() {
  return orders;
}

export function setOrders(list) {
  orders = list;
}

export function isBackendReady() {
  return backendReady && isSupabaseConfigured();
}

async function fetchAll(sb) {
  const { data, error } = await sb.from('pedidos').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToOrder);
}

/** Comprueba conexión con Supabase (no depende de haber abierto el panel admin antes) */
async function ensureSupabaseReady() {
  const sb = getSupabase();
  if (!sb) return null;
  if (backendReady) return sb;
  try {
    const { error } = await sb.from('pedidos').select('id').limit(1);
    if (error) throw error;
    backendReady = true;
    return sb;
  } catch (e) {
    console.warn('[Pollón] Supabase pedidos no disponible:', e.message);
    return null;
  }
}

function sortOrders(list) {
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function mapRealtimeStatus(status = realtimeConnectionStatus) {
  if (!backendReady || !isSupabaseConfigured()) return 'local';
  if (status === 'SUBSCRIBED') return 'live';
  if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'reconnecting';
  return 'connecting';
}

function notifyListeners(meta = {}) {
  const snapshot = sortOrders(orders);
  orders = snapshot;
  const payload = {
    realtimeStatus: mapRealtimeStatus(),
    ...meta,
  };
  listeners.forEach((fn) => {
    try {
      fn(snapshot, payload);
    } catch (e) {
      console.warn('[Pollón] orders listener:', e);
    }
  });
}

function applyRealtimePayload(payload) {
  if (payload.eventType === 'INSERT' && payload.new?.id) {
    const order = rowToOrder(payload.new);
    if (!orders.some((o) => o.id === order.id)) {
      orders = sortOrders([order, ...orders]);
      lastRealtimeAt = Date.now();
      notifyListeners({ source: 'realtime', event: 'INSERT' });
      return true;
    }
    return true;
  }

  if (payload.eventType === 'UPDATE' && payload.new?.id) {
    const order = rowToOrder(payload.new);
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) orders[idx] = order;
    else orders.unshift(order);
    orders = sortOrders(orders);
    lastRealtimeAt = Date.now();
    notifyListeners({ source: 'realtime', event: 'UPDATE' });
    return true;
  }

  if (payload.eventType === 'DELETE' && payload.old?.id) {
    orders = orders.filter((o) => o.id !== payload.old.id);
    lastRealtimeAt = Date.now();
    notifyListeners({ source: 'realtime', event: 'DELETE' });
    return true;
  }

  return false;
}

async function refreshFromServer(sb) {
  orders = await fetchAll(sb);
  lastRealtimeAt = Date.now();
  notifyListeners({ source: 'fetch' });
}

function scheduleFullRefetch(sb) {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    refreshFromServer(sb).catch((e) => console.warn('[Pollón] RT refresh:', e));
  }, 120);
}

function startPollingFallback(sb) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!backendReady || !sb) return;
    const stale = Date.now() - lastRealtimeAt > 10000;
    const disconnected = realtimeConnectionStatus !== 'SUBSCRIBED';
    if (stale || disconnected) {
      refreshFromServer(sb).catch((e) => console.warn('[Pollón] poll refresh:', e));
    }
  }, 8000);
}

function subscribeRealtime(sb) {
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel('pollon-pedidos-rt')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos' },
      (payload) => {
        console.info('[Pollón] Pedido en tiempo real:', payload.eventType, payload.new?.id || payload.old?.id);
        if (!applyRealtimePayload(payload)) {
          scheduleFullRefetch(sb);
        }
      },
    )
    .subscribe((status) => {
      console.info('[Pollón] Realtime pedidos:', status);
      realtimeConnectionStatus = status;
      if (status === 'SUBSCRIBED') {
        lastRealtimeAt = Date.now();
        refreshFromServer(sb).catch((e) => console.warn('[Pollón] sync on subscribe:', e));
      } else {
        notifyListeners({ source: 'realtime-status' });
      }
    });
}

async function ensureInitialized() {
  const sb = getSupabase();
  if (!sb) {
    loadLocal();
    backendReady = false;
    realtimeConnectionStatus = 'local';
    notifyListeners({ source: 'local' });
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      orders = await fetchAll(sb);
      backendReady = true;
      lastRealtimeAt = Date.now();
      realtimeConnectionStatus = 'connecting';
      notifyListeners({ source: 'init' });
      subscribeRealtime(sb);
      startPollingFallback(sb);
    } catch (e) {
      console.warn('[Pollón] initOrders:', e);
      loadLocal();
      backendReady = false;
      realtimeConnectionStatus = 'local';
      notifyListeners({ source: 'local-fallback' });
    }
  })();

  await initPromise;
}

/** Suscripción a pedidos con tiempo real. Devuelve función para cancelar. */
export function subscribeOrders(onSync) {
  listeners.add(onSync);
  ensureInitialized().then(() => {
    onSync(sortOrders(orders), { realtimeStatus: mapRealtimeStatus() });
  });
  return () => {
    listeners.delete(onSync);
  };
}

export async function initOrders(onSync) {
  const unsub = subscribeOrders(onSync);
  return unsub;
}

async function insertDetalle(sb, pedidoId, items) {
  if (!items?.length) return;
  const rows = items.map((it) => ({
    pedido_id: pedidoId,
    // producto_id apunta a tabla legacy "productos"; menú multi-sucursal usa "products"
    producto_id: null,
    nombre_producto: it.name || 'Producto',
    cantidad: it.qty || 1,
    precio_unitario: Math.round((it.total || 0) / (it.qty || 1)),
    subtotal: it.total || 0,
    extras: { drink: it.drink, bagQty: it.bagQty, notes: it.notes, productId: it.id || it.producto_id },
  }));
  const { error } = await sb.from('detalle_pedidos').insert(rows);
  if (error) console.warn('[Pollón] detalle_pedidos:', error.message);
}

function isDuplicateCodigoError(error) {
  const msg = error?.message || '';
  return msg.includes('pedidos_codigo_pedido_key') || msg.includes('duplicate key');
}

function mapPedidoInsertError(error) {
  const msg = error?.message || '';
  if (msg.includes('branch_id')) {
    return new Error('Falta columna branch_id. En Supabase ejecuta fix-pedidos-checkout.sql');
  }
  if (msg.includes('row-level security') || msg.includes('order_status_history')) {
    return new Error('Permisos de pedido. En Supabase ejecuta fix-pedidos-checkout.sql (script completo).');
  }
  if (msg.includes('sucursal_id')) {
    return new Error('Error de columna legacy. Redeploy en Vercel con el código actualizado.');
  }
  return error;
}

export async function allocateTicketNumber(sb) {
  if (sb) {
    try {
      const { data, error } = await sb
        .from('pedidos')
        .select('codigo_pedido')
        .order('codigo_pedido', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data?.codigo_pedido) {
        const last = parseInt(String(data.codigo_pedido), 10);
        if (!Number.isNaN(last)) {
          return String(last + 1).padStart(6, '0');
        }
      }
    } catch (e) {
      console.warn('[Pollón] allocateTicketNumber:', e);
    }
  }
  return generateTicketNumber(getOrders());
}

function commitOrderLocally(order) {
  orders.push(order);
  orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  saveLocal();
}

export async function saveOrder(order) {
  if (!order?.id) throw new Error('Pedido inválido');

  const sb = await ensureSupabaseReady();
  if (!sb) {
    if (!order.codigo_pedido) {
      order.codigo_pedido = generateTicketNumber(getOrders());
      order.ticketNumber = order.codigo_pedido;
    }
    commitOrderLocally(order);
    if (isSupabaseConfigured()) {
      throw new Error('No se pudo guardar en Supabase. Revisa la conexión o ejecuta fix-realtime-pedidos.sql');
    }
    return order;
  }

  if (!order.codigo_pedido) {
    order.codigo_pedido = await allocateTicketNumber(sb);
    order.ticketNumber = order.codigo_pedido;
  }

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      order.codigo_pedido = await allocateTicketNumber(sb);
      order.ticketNumber = order.codigo_pedido;
    }

    const row = orderToRow(order);
    const { error } = await sb.from('pedidos').insert(row);
    if (!error) {
      await insertDetalle(sb, order.id, order.items);
      commitOrderLocally(order);
      return order;
    }

    if (isDuplicateCodigoError(error) && attempt < maxAttempts - 1) {
      continue;
    }

    throw mapPedidoInsertError(error);
  }

  throw new Error('No se pudo generar un código de pedido único. Intenta de nuevo.');
}

export async function updateOrder(order) {
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) orders[idx] = order;
  else orders.push(order);

  const sb = await ensureSupabaseReady();
  if (!sb) {
    saveLocal();
    return order;
  }
  const row = orderToRow(order);
  const { error } = await sb.from('pedidos').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  saveLocal();
  return order;
}

export async function fetchOrdersAdmin() {
  const sb = getSupabase();
  if (!sb) return getOrders();
  const list = await fetchAll(sb);
  orders = list;
  lastRealtimeAt = Date.now();
  return list;
}

/** Pedidos de una sucursal para analytics públicos (ej. más vendidos en inicio). */
export async function fetchBranchOrdersForPeriod(branchId, periodId = 'month') {
  const sb = getSupabase();
  if (!sb || !branchId) return [];

  const { start, end } = getPeriodRange(periodId);

  const { data, error } = await sb
    .from('pedidos')
    .select('*')
    .eq('branch_id', branchId)
    .gte('creado_en', start.toISOString())
    .order('creado_en', { ascending: false })
    .limit(2000);

  if (error) {
    console.warn('[Pollón] fetchBranchOrdersForPeriod:', error.message);
    return [];
  }

  const orders = (data || []).map(rowToOrder).filter((o) => o.estado !== 'cancelado');
  return filterOrdersInRange(orders, start, end);
}

export function generateOrderId() {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `P${Date.now()}-${suffix}`;
}

export function generateTicketNumber(existingOrders) {
  const nums = existingOrders
    .map((o) => parseInt(String(o.ticketNumber || o.codigo_pedido || '0'), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(6, '0');
}
