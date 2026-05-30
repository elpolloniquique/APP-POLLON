import { todayISO } from './format';
import { ORDER_TYPE_LABELS } from './constants';

export const PERIOD_OPTIONS = [
  { id: 'today', label: 'Hoy', short: '24h' },
  { id: 'week', label: 'Semana', short: '7 días' },
  { id: 'month', label: 'Mes', short: '30 días' },
  { id: 'quarter', label: 'Trimestre', short: '90 días' },
];

const STATUS_COLORS = {
  pendiente: '#f59e0b',
  confirmado: '#6366f1',
  preparando: '#f97316',
  listo: '#14b8a6',
  en_delivery: '#8b5cf6',
  entregado: '#22c55e',
  cancelado: '#ef4444',
};

const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  whatsapp: 'WhatsApp',
};

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(iso) {
  return (iso || '').slice(0, 10);
}

/** Rango de fechas según filtro de período. */
export function getPeriodRange(periodId) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (periodId === 'today') {
    return { start, end, prevStart: shiftDays(start, -1), prevEnd: shiftDays(end, -1) };
  }
  if (periodId === 'week') {
    start.setDate(start.getDate() - 6);
    return { start, end, prevStart: shiftDays(start, -7), prevEnd: shiftDays(end, -7) };
  }
  if (periodId === 'month') {
    start.setDate(start.getDate() - 29);
    return { start, end, prevStart: shiftDays(start, -30), prevEnd: shiftDays(end, -30) };
  }
  // quarter
  start.setDate(start.getDate() - 89);
  return { start, end, prevStart: shiftDays(start, -90), prevEnd: shiftDays(end, -90) };
}

function shiftDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function filterOrdersInRange(orders, start, end) {
  return (orders || []).filter((o) => {
    const d = parseDate(o.createdAt);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

export function filterOrdersByPeriod(orders, periodId) {
  const { start, end } = getPeriodRange(periodId);
  return filterOrdersInRange(orders, start, end);
}

function sumTotal(list) {
  return list.reduce((s, o) => s + (Number(o.total) || 0), 0);
}

function avgTicket(list) {
  return list.length ? sumTotal(list) / list.length : 0;
}

export function computeKPIs(currentOrders, previousOrders) {
  const sales = sumTotal(currentOrders);
  const prevSales = sumTotal(previousOrders);
  const delivered = currentOrders.filter((o) => o.estado === 'entregado').length;
  const pending = currentOrders.filter((o) =>
    ['pendiente', 'confirmado', 'preparando'].includes(o.estado),
  ).length;
  const cancelled = currentOrders.filter((o) => o.estado === 'cancelado').length;

  return {
    orders: currentOrders.length,
    sales,
    ticket: avgTicket(currentOrders),
    delivered,
    pending,
    cancelled,
    conversion: currentOrders.length
      ? Math.round((delivered / currentOrders.length) * 100)
      : 0,
    salesDelta: pctChange(sales, prevSales),
    ordersDelta: pctChange(currentOrders.length, previousOrders.length),
    ticketDelta: pctChange(avgTicket(currentOrders), avgTicket(previousOrders)),
  };
}

function pctChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/** Etiquetas del eje temporal según período. */
export function buildTimeline(orders, periodId) {
  const buckets = [];

  if (periodId === 'today') {
    for (let h = 0; h < 24; h += 1) {
      buckets.push({
        key: String(h),
        label: `${String(h).padStart(2, '0')}:00`,
        orders: [],
      });
    }
    orders.forEach((o) => {
      const d = parseDate(o.createdAt);
      if (!d) return;
      buckets[d.getHours()].orders.push(o);
    });
  } else if (periodId === 'week') {
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d.toISOString());
      buckets.push({
        key,
        label: d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }),
        orders: [],
      });
    }
    const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
    orders.forEach((o) => {
      const k = dateKey(o.createdAt);
      if (map[k]) map[k].orders.push(o);
    });
  } else if (periodId === 'month') {
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d.toISOString());
      buckets.push({
        key,
        label: d.getDate() % 3 === 0 ? String(d.getDate()) : '',
        orders: [],
      });
    }
    const map = Object.fromEntries(buckets.map((b) => [b.key, b]));
    orders.forEach((o) => {
      const k = dateKey(o.createdAt);
      if (map[k]) map[k].orders.push(o);
    });
  } else {
    for (let i = 12; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const key = dateKey(d.toISOString());
      buckets.push({
        key,
        label: d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }),
        orders: [],
      });
    }
    orders.forEach((o) => {
      const k = dateKey(o.createdAt);
      let bucket = buckets.find((b) => b.key === k);
      if (!bucket) {
        bucket = buckets.reduce((best, b) => {
          const diff = Math.abs(new Date(b.key) - new Date(k));
          const bestDiff = Math.abs(new Date(best.key) - new Date(k));
          return diff < bestDiff ? b : best;
        }, buckets[0]);
      }
      bucket?.orders.push(o);
    });
  }

  return {
    labels: buckets.map((b) => b.label),
    sales: buckets.map((b) => sumTotal(b.orders)),
    orders: buckets.map((b) => b.orders.length),
  };
}

export function buildStatusChart(orders) {
  const counts = {};
  orders.forEach((o) => {
    const s = o.estado || 'pendiente';
    counts[s] = (counts[s] || 0) + 1;
  });
  const labels = Object.keys(counts);
  return {
    labels,
    datasets: [{
      data: labels.map((l) => counts[l]),
      backgroundColor: labels.map((l) => STATUS_COLORS[l] || '#94a3b8'),
      borderWidth: 0,
    }],
  };
}

export function buildPaymentChart(orders) {
  const counts = {};
  orders.forEach((o) => {
    const p = o.metodo_pago || 'whatsapp';
    counts[p] = (counts[p] || 0) + 1;
  });
  const labels = Object.keys(counts).map((k) => PAYMENT_LABELS[k] || k);
  const keys = Object.keys(counts);
  return {
    labels,
    datasets: [{
      data: keys.map((k) => counts[k]),
      backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6'],
      borderWidth: 0,
    }],
  };
}

export function buildOrderTypeChart(orders) {
  const counts = {};
  orders.forEach((o) => {
    const t = o.orderType || 'delivery';
    counts[t] = (counts[t] || 0) + 1;
  });
  const keys = Object.keys(counts);
  return {
    labels: keys.map((k) => ORDER_TYPE_LABELS[k] || k),
    datasets: [{
      label: 'Pedidos',
      data: keys.map((k) => counts[k]),
      backgroundColor: '#c41e1e',
      borderRadius: 6,
      maxBarThickness: 28,
    }],
  };
}

export function buildHourlyChart(orders) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, count: 0, sales: 0 }));
  orders.forEach((o) => {
    const d = parseDate(o.createdAt);
    if (!d) return;
    hours[d.getHours()].count += 1;
    hours[d.getHours()].sales += Number(o.total) || 0;
  });
  return {
    labels: hours.map(({ h }) => `${String(h).padStart(2, '0')}h`),
    orders: hours.map(({ count }) => count),
    sales: hours.map(({ sales }) => sales),
  };
}

export function buildWeekdayChart(orders) {
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((label) => ({
    label,
    count: 0,
    sales: 0,
  }));
  orders.forEach((o) => {
    const d = parseDate(o.createdAt);
    if (!d) return;
    days[d.getDay()].count += 1;
    days[d.getDay()].sales += Number(o.total) || 0;
  });
  return {
    labels: days.map((d) => d.label),
    orders: days.map((d) => d.count),
    sales: days.map((d) => d.sales),
  };
}

export function buildTopProducts(orders, limit = 6) {
  const items = buildTopProductItems(orders, limit);
  return {
    labels: items.map((i) => (i.name.length > 18 ? `${i.name.slice(0, 18)}…` : i.name)),
    data: items.map((i) => i.qty),
    items,
  };
}

/** Ranking de productos más vendidos (cantidad de unidades). */
export function buildTopProductItems(orders, limit = 6) {
  const stats = new Map();
  (orders || []).forEach((o) => {
    if (o.estado === 'cancelado') return;
    (o.items || []).forEach((it) => {
      const name = (it.name || 'Producto').trim();
      if (!name) return;
      const productId = it.id || it.producto_id || it.productId || null;
      const key = productId || name.toLowerCase();
      const prev = stats.get(key) || { name, productId, qty: 0 };
      prev.qty += Number(it.qty) || 1;
      if (productId && !prev.productId) prev.productId = productId;
      stats.set(key, prev);
    });
  });
  return [...stats.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

/** Cruza ranking de ventas con productos del menú activo. */
export function resolveBestsellerProducts(topItems, menuProducts, limit = 6) {
  if (!menuProducts?.length) return [];
  const byId = new Map(menuProducts.map((p) => [p.id, p]));
  const byName = new Map(menuProducts.map((p) => [(p.name || '').trim().toLowerCase(), p]));
  const resolved = [];
  const used = new Set();

  for (const item of topItems || []) {
    let product = item.productId ? byId.get(item.productId) : null;
    if (!product) product = byName.get((item.name || '').trim().toLowerCase());
    if (!product || !product.available || used.has(product.id)) continue;
    used.add(product.id);
    resolved.push({ ...product, soldQty: item.qty });
    if (resolved.length >= limit) break;
  }
  return resolved;
}

export function buildBranchStats(orders, branches, periodId) {
  const { start, end } = getPeriodRange(periodId);
  const inRange = filterOrdersInRange(orders, start, end);
  return (branches || [])
    .map((b) => {
      const list = inRange.filter((o) => (o.branchId || o.branch_id) === b.id);
      return {
        id: b.id,
        name: b.name,
        orders: list.length,
        sales: sumTotal(list),
        ticket: avgTicket(list),
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

export function buildPipelineChart(orders) {
  const stages = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_delivery', 'entregado'];
  const counts = stages.map((s) => orders.filter((o) => o.estado === s).length);
  return {
    labels: stages,
    datasets: [{
      label: 'Pedidos',
      data: counts,
      backgroundColor: stages.map((s) => STATUS_COLORS[s]),
      borderRadius: 4,
      maxBarThickness: 22,
    }],
  };
}

export { STATUS_COLORS, todayISO };
