import { ORDER_TYPE_LABELS, PAYMENT_METHODS } from './constants';
import { wrapText } from './format';

export function paymentLabel(method) {
  const m = PAYMENT_METHODS.find((p) => p.id === method);
  return m?.label || (method === 'whatsapp' ? 'WhatsApp' : method || '—');
}

/** Metadatos comunes para ticket / WhatsApp / modal */
export function getOrderReceiptMeta(order, branch) {
  const customer = order.customer || {};
  const items = order.items || [];
  const fechaBase = order.createdAt ? new Date(order.createdAt) : new Date();
  const ticket = String(order.ticketNumber || order.codigo_pedido || '001').padStart(6, '0');
  const orderType = (order.orderType || 'delivery').toLowerCase();
  const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);

  return {
    ticket,
    ticketShort: ticket.replace(/^0+/, '') || ticket,
    fechaStr: fechaBase.toLocaleDateString('es-CL'),
    horaStr: fechaBase.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    sucursal: branch?.name || 'Pollería El Pollón',
    sucursalCity: branch?.city || '',
    sucursalPhone: branch?.phone || '',
    orderType,
    orderTypeLabel: ORDER_TYPE_LABELS[orderType] || orderType.toUpperCase(),
    customer,
    items,
    subtotal,
    deliveryFee: Number(order.deliveryFee) || 0,
    total: Number(order.total) || 0,
    payment: paymentLabel(order.metodo_pago),
    estado: order.estado || 'pendiente',
  };
}

/** Texto plano — mismo formato que WhatsApp */
export function buildOrderReceiptText(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

  let msg = `◆ ${m.orderTypeLabel.toUpperCase()} - POLLERÍA EL POLLÓN ◆\n\n`;
  msg += `Sucursal: ${m.sucursal}\n`;
  msg += `${m.ticketShort}    ${m.fechaStr}    ${m.horaStr}\n`;
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ DATOS DEL CLIENTE\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  msg += `◆ Nombre:   ${customer.name || '-'}\n`;
  msg += `◆ Teléfono: ${customer.phone || '-'}\n`;
  const addr = wrapText(customer.address, 32);
  msg += `◆ Dirección:\n${addr ? addr.split('\n').map((l) => `   ${l}`).join('\n') : '   -'}\n\n`;
  if (customer.comments?.trim()) {
    msg += `◆ Observaciones:\n${wrapText(customer.comments, 32).split('\n').map((l) => `   ${l}`).join('\n')}\n\n`;
  }
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ DETALLE DEL PEDIDO\n`;
  msg += `${'─'.repeat(32)}\n\n`;
  items.forEach((it) => {
    const qty = it.qty ?? 1;
    msg += `◆ ${qty}x ${it.name}\n`;
    if (it.drink) msg += `   Bebida: ${it.drink}\n`;
    if (it.bagQty > 0) msg += `   Bolsa x${it.bagQty}\n`;
    if (it.notes) msg += `   Nota: ${it.notes}\n`;
    msg += `   $${(it.total || 0).toLocaleString('es-CL')}\n\n`;
  });
  if (m.deliveryFee > 0) msg += `Delivery: $${m.deliveryFee.toLocaleString('es-CL')}\n`;
  msg += `${'─'.repeat(32)}\n`;
  msg += `◆ TOTAL: $${m.total.toLocaleString('es-CL')}\n`;
  msg += `◆ Pago: ${m.payment}\n`;
  return msg;
}

/** HTML optimizado impresora térmica 80mm */
export function buildThermalReceiptHtml(order, branch) {
  const m = getOrderReceiptMeta(order, branch);
  const { customer, items } = m;

  const itemRows = items.map((it) => {
    const qty = it.qty ?? 1;
    const extras = [
      it.drink ? `Bebida: ${it.drink}` : '',
      it.bagQty > 0 ? `Bolsa x${it.bagQty}` : '',
      it.notes ? `Nota: ${it.notes}` : '',
    ].filter(Boolean).map((e) => `<div class="extra">${escapeHtml(e)}</div>`).join('');

    return `
      <div class="item">
        <div class="item-head">
          <span class="qty">${qty}x</span>
          <span class="name">${escapeHtml(it.name)}</span>
        </div>
        ${extras}
        <div class="item-price">$${(it.total || 0).toLocaleString('es-CL')}</div>
      </div>`;
  }).join('');

  const addrLines = wrapText(customer.address || '-', 28)
    .split('\n')
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join('');

  const obsBlock = customer.comments?.trim()
    ? `<div class="section">
        <div class="label">Observaciones</div>
        ${wrapText(customer.comments, 28).split('\n').map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Pedido #${m.ticket}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      padding: 3mm 2mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .brand { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
    .brand-sub { font-size: 10px; margin-top: 2px; }
    .type-badge {
      display: inline-block;
      margin: 6px 0 4px;
      padding: 2px 8px;
      border: 2px solid #000;
      font-weight: bold;
      font-size: 11px;
    }
    .ticket-num { font-size: 22px; font-weight: bold; margin: 4px 0; letter-spacing: 1px; }
    .meta { font-size: 10px; color: #333; }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .section-title {
      font-weight: bold;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .section { margin-bottom: 6px; }
    .label { font-weight: bold; }
    .row { display: flex; justify-content: space-between; gap: 4px; margin: 2px 0; }
    .item { margin: 6px 0; padding-bottom: 4px; border-bottom: 1px dotted #ccc; }
    .item:last-child { border-bottom: none; }
    .item-head { display: flex; gap: 4px; font-weight: bold; }
    .qty { min-width: 22px; }
    .name { flex: 1; }
    .extra { font-size: 10px; padding-left: 26px; color: #222; }
    .item-price { text-align: right; font-weight: bold; margin-top: 2px; }
    .totals { margin-top: 8px; }
    .total-row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
    .total-final {
      font-size: 16px;
      font-weight: bold;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 2px solid #000;
    }
    .footer {
      margin-top: 10px;
      text-align: center;
      font-size: 9px;
      color: #444;
    }
    .thanks { font-size: 12px; font-weight: bold; margin: 6px 0; }
    @media print {
      body { width: 72mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="brand">EL POLLÓN</div>
    <div class="brand-sub">Pollería — ${escapeHtml(m.sucursal)}</div>
    <div class="type-badge">${escapeHtml(m.orderTypeLabel.toUpperCase())}</div>
    <div class="ticket-num">#${m.ticket}</div>
    <div class="meta">${escapeHtml(m.fechaStr)} · ${escapeHtml(m.horaStr)}</div>
  </div>

  <hr class="divider" />

  <div class="section">
    <div class="section-title">◆ Cliente</div>
    <div class="row"><span class="label">Nombre</span><span>${escapeHtml(customer.name || '—')}</span></div>
    <div class="row"><span class="label">Teléfono</span><span>${escapeHtml(customer.phone || '—')}</span></div>
    <div style="margin-top:4px"><span class="label">Dirección</span></div>
    ${addrLines}
  </div>

  ${obsBlock}

  <hr class="divider" />

  <div class="section">
    <div class="section-title">◆ Detalle del pedido</div>
    ${itemRows || '<div>Sin ítems</div>'}
  </div>

  <hr class="divider" />

  <div class="totals">
    ${m.deliveryFee > 0 ? `<div class="total-row"><span>Delivery</span><span>$${m.deliveryFee.toLocaleString('es-CL')}</span></div>` : ''}
    <div class="total-row total-final">
      <span>TOTAL</span>
      <span>$${m.total.toLocaleString('es-CL')}</span>
    </div>
    <div class="total-row"><span>Pago</span><span>${escapeHtml(m.payment)}</span></div>
  </div>

  <div class="footer">
    <div class="thanks">¡Gracias por tu pedido!</div>
    <div>Pollón — ${escapeHtml(m.sucursalCity || 'Chile')}</div>
    ${m.sucursalPhone ? `<div>${escapeHtml(m.sucursalPhone)}</div>` : ''}
    <div style="margin-top:6px">Impreso: ${new Date().toLocaleString('es-CL')}</div>
  </div>

  <p class="no-print center" style="margin-top:12px;font-size:10px">Cierra esta ventana después de imprimir</p>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Abre ventana de impresión 80mm */
export function printThermalReceipt(order, branch) {
  const html = buildThermalReceiptHtml(order, branch);
  const win = window.open('', '_blank', 'width=420,height=720,noopener');
  if (!win) {
    throw new Error('Permite ventanas emergentes para imprimir el ticket');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);
  };
}
