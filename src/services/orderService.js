import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { ORDERS_KEY } from '../utils/constants';

let orders = [];
let channel = null;
let backendReady = false;

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
      sucursal_id: order.branchId || null,
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
  const { data, error } = await sb.from('pedidos').select('*').order('creado_en', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToOrder);
}

export async function initOrders(onSync) {
  const sb = getSupabase();
  if (!sb) {
    loadLocal();
    backendReady = false;
    onSync?.(orders);
    return;
  }
  try {
    orders = await fetchAll(sb);
    orders.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    backendReady = true;
    onSync?.(orders);

    if (channel) sb.removeChannel(channel);
    channel = sb
      .channel('pollon-pedidos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async () => {
        try {
          orders = await fetchAll(sb);
          onSync?.(orders);
        } catch (e) {
          console.warn('[Pollón] RT:', e);
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('[Pollón] pedidos:', e);
    loadLocal();
    backendReady = false;
    onSync?.(orders);
  }
}

async function insertDetalle(sb, pedidoId, items) {
  if (!items?.length) return;
  const rows = items.map((it) => ({
    pedido_id: pedidoId,
    producto_id: it.producto_id || null,
    nombre_producto: it.name || 'Producto',
    cantidad: it.qty || 1,
    precio_unitario: Math.round((it.total || 0) / (it.qty || 1)),
    subtotal: it.total || 0,
    extras: { drink: it.drink, bagQty: it.bagQty, notes: it.notes },
  }));
  await sb.from('detalle_pedidos').insert(rows);
}

export async function saveOrder(order) {
  if (!order?.id) throw new Error('Pedido inválido');

  orders.push(order);
  orders.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const sb = getSupabase();
  if (!sb || !backendReady) {
    saveLocal();
    return order;
  }

  const row = orderToRow(order);
  const { error } = await sb.from('pedidos').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  await insertDetalle(sb, order.id, order.items);
  saveLocal();
  return order;
}

export async function updateOrder(order) {
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) orders[idx] = order;
  else orders.push(order);

  const sb = getSupabase();
  if (!sb || !backendReady) {
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
  return fetchAll(sb);
}

export function generateOrderId() {
  return `P${Date.now()}`;
}

export function generateTicketNumber(existingOrders) {
  const nums = existingOrders
    .map((o) => parseInt(String(o.ticketNumber || o.codigo_pedido || '0'), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(6, '0');
}
