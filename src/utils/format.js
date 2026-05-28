const CURRENCY = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function money(v) {
  return CURRENCY.format(Number(v) || 0);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL');
  } catch {
    return iso;
  }
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function nextEstado(current) {
  const flow = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_delivery', 'entregado', 'cancelado'];
  const idx = flow.indexOf(current || 'pendiente');
  return flow[(idx + 1) % flow.length];
}

export function estadoLabel(estado) {
  const labels = {
    pendiente: 'Nuevo',
    confirmado: 'Confirmado',
    preparando: 'En cocina',
    listo: 'Listo',
    en_delivery: 'En reparto',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };
  return labels[estado] || estado;
}

export function elapsedMinutes(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

const TICKET_LINE_LENGTH = 35;

export function wrapText(text, maxLen = TICKET_LINE_LENGTH) {
  const str = String(text || '').trim();
  if (!str) return '';
  const lines = [];
  let remaining = str;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      lines.push(remaining);
      break;
    }
    let chunk = remaining.slice(0, maxLen);
    const lastSpace = chunk.lastIndexOf(' ');
    if (lastSpace > 0) {
      chunk = chunk.slice(0, lastSpace);
      remaining = remaining.slice(lastSpace + 1).trim();
    } else {
      remaining = remaining.slice(maxLen);
    }
    lines.push(chunk);
  }
  return lines.join('\n');
}

export function buildWhatsappMessage(order, branch) {
  const customer = order.customer || {};
  const items = order.items || [];
  const fechaBase = order.createdAt ? new Date(order.createdAt) : new Date();
  const fechaStr = fechaBase.toLocaleDateString('es-CL');
  const horaStr = fechaBase.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const ticket = String(order.ticketNumber || order.codigo_pedido || '001').padStart(3, '0');
  const sucursal = branch?.name || 'El Pollón';

  let msg = `◆ ${(order.orderType || 'delivery').toUpperCase()} - POLLERÍA EL POLLÓN ◆\n\n`;
  msg += `Sucursal: ${sucursal}\n`;
  msg += `${ticket}    ${fechaStr}    ${horaStr}\n`;
  msg += `────────────────────────────────\n`;
  msg += `◆ DATOS DEL CLIENTE\n`;
  msg += `────────────────────────────────\n\n`;
  msg += `◆ Nombre:   ${customer.name || '-'}\n`;
  msg += `◆ Teléfono: ${customer.phone || '-'}\n`;
  const addr = wrapText(customer.address);
  msg += `◆ Dirección:\n${addr ? addr.split('\n').map((l) => `   ${l}`).join('\n') : '   -'}\n\n`;
  if (customer.comments?.trim()) {
    msg += `◆ Observaciones:\n${wrapText(customer.comments).split('\n').map((l) => `   ${l}`).join('\n')}\n\n`;
  }
  msg += `────────────────────────────────\n`;
  msg += `◆ DETALLE DEL PEDIDO\n`;
  msg += `────────────────────────────────\n\n`;
  items.forEach((it) => {
    const qty = it.qty ?? 1;
    msg += `◆ ${qty}x ${it.name}\n`;
    if (it.drink) msg += `   🥤 ${it.drink}\n`;
    if (it.bagQty > 0) msg += `   ♻️ Bolsa x${it.bagQty}\n`;
    if (it.notes) msg += `   📝 ${it.notes}\n`;
    msg += `   $${(it.total || 0).toLocaleString('es-CL')}\n\n`;
  });
  if (order.deliveryFee > 0) msg += `Delivery: $${order.deliveryFee.toLocaleString('es-CL')}\n`;
  msg += `────────────────────────────────\n`;
  msg += `◆ TOTAL: $${(order.total || 0).toLocaleString('es-CL')}\n`;
  msg += `◆ Pago: ${order.metodo_pago || 'whatsapp'}\n`;
  return msg;
}
