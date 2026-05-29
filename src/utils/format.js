import { buildOrderReceiptText } from './orderReceipt';

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
  return buildOrderReceiptText(order, branch);
}
